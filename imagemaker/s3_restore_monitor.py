from __future__ import annotations

import argparse
import csv
import sys
import time
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import boto3
from botocore.config import Config


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_restore_header(restore: str | None) -> tuple[bool | None, datetime | None]:
    """
    Parse S3 Restore header string.

    Examples:
      ongoing-request="true"
      ongoing-request="false", expiry-date="Fri, 23 Jan 2015 00:00:00 GMT"
    Returns:
      (ongoing_request, expiry_date_utc)
      - ongoing_request is None if header missing / unparsable
    """
    if not restore:
        return (None, None)

    s = restore.strip()
    ongoing: bool | None = None
    expiry: datetime | None = None

    # Very small, robust parser (no external deps).
    parts = [p.strip() for p in s.split(",") if p.strip()]
    for p in parts:
        if p.startswith('ongoing-request="') and p.endswith('"'):
            val = p[len('ongoing-request="') : -1].lower()
            if val in ("true", "false"):
                ongoing = val == "true"
        elif p.startswith('expiry-date="') and p.endswith('"'):
            val = p[len('expiry-date="') : -1]
            # RFC1123-like: "Fri, 23 Jan 2015 00:00:00 GMT"
            try:
                expiry = datetime.strptime(val, "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=timezone.utc)
            except Exception:
                expiry = None

    return (ongoing, expiry)


@dataclass
class ObjectTiming:
    key: str
    first_seen_utc: datetime
    completed_utc: datetime | None = None
    polls: int = 0
    last_restore_header: str | None = None

    def is_done(self) -> bool:
        return self.completed_utc is not None

    def elapsed_seconds(self) -> float | None:
        if not self.completed_utc:
            return None
        return (self.completed_utc - self.first_seen_utc).total_seconds()


def _list_first_n_keys(s3, bucket: str, prefix: str, n: int) -> list[str]:
    keys: list[str] = []
    token: str | None = None
    while len(keys) < n:
        kwargs = {"Bucket": bucket, "MaxKeys": min(1000, n - len(keys))}
        if prefix:
            kwargs["Prefix"] = prefix
        if token:
            kwargs["ContinuationToken"] = token

        resp = s3.list_objects_v2(**kwargs)
        for obj in resp.get("Contents", []) or []:
            k = obj.get("Key")
            if k is not None:
                keys.append(k)
                if len(keys) >= n:
                    break

        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")

    return keys


def _iter_keys_from_file(path: Path) -> Iterable[str]:
    for line in path.read_text(encoding="utf-8").splitlines():
        k = line.strip()
        if not k or k.startswith("#"):
            continue
        yield k


def _head_restore_status(s3, bucket: str, key: str) -> tuple[str | None, bool | None]:
    resp = s3.head_object(Bucket=bucket, Key=key)
    restore = resp.get("Restore")
    ongoing, _expiry = _parse_restore_header(restore)
    return restore, ongoing


def monitor_restore(
    *,
    s3,
    bucket: str,
    keys: list[str],
    poll_interval_seconds: int,
    csv_path: Path,
) -> int:
    started_utc = _utc_now()
    timings: dict[str, ObjectTiming] = {k: ObjectTiming(key=k, first_seen_utc=started_utc) for k in keys}

    print(f"Monitoring restore status for {len(keys)} objects in bucket={bucket!r}")
    print(f"Poll interval: {poll_interval_seconds}s")
    print(f"CSV output: {csv_path.as_posix()}")
    print("Waiting for Restore header to show ongoing-request=\"false\" ...")
    print()

    remaining = len(keys)
    cycle = 0
    while remaining > 0:
        cycle += 1
        cycle_t0 = time.perf_counter()

        done_this_cycle = 0
        for k, t in timings.items():
            if t.is_done():
                continue
            t.polls += 1
            try:
                restore_header, ongoing = _head_restore_status(s3, bucket, k)
                t.last_restore_header = restore_header

                # "Completed" when explicit ongoing-request is false.
                if ongoing is False:
                    t.completed_utc = _utc_now()
                    done_this_cycle += 1
            except Exception as e:
                # Keep monitoring; transient errors shouldn't stop batch tests.
                t.last_restore_header = f"ERROR: {type(e).__name__}: {e}"

        remaining = sum(1 for _k, t in timings.items() if not t.is_done())
        now_utc = _utc_now()
        print(
            f"[{now_utc.isoformat(timespec='seconds')}] cycle={cycle} completed+{done_this_cycle} remaining={remaining}"
        )

        if remaining == 0:
            break

        # Sleep remaining time in the interval, accounting for query time.
        elapsed = time.perf_counter() - cycle_t0
        sleep_for = max(0.0, poll_interval_seconds - elapsed)
        time.sleep(sleep_for)

    # Print per-object timing summary and write CSV.
    rows = []
    for k in keys:
        t = timings[k]
        elapsed = t.elapsed_seconds()
        elapsed_str = f"{elapsed:.3f}" if elapsed is not None else ""
        completed_iso = t.completed_utc.isoformat(timespec="seconds") if t.completed_utc else ""
        first_seen_iso = t.first_seen_utc.isoformat(timespec="seconds")
        rows.append(
            {
                "key": k,
                "first_seen_utc": first_seen_iso,
                "completed_utc": completed_iso,
                "elapsed_seconds": elapsed_str,
                "polls": str(t.polls),
                "last_restore_header": t.last_restore_header or "",
            }
        )

    # Deterministic ordering in CSV = input order.
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "key",
                "first_seen_utc",
                "completed_utc",
                "elapsed_seconds",
                "polls",
                "last_restore_header",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print()
    print("Per-object total time (seconds):")
    for k in keys:
        t = timings[k]
        elapsed = t.elapsed_seconds()
        if elapsed is None:
            print(f"- {k}: (not completed)")
        else:
            print(f"- {k}: {elapsed:.3f}s")

    print()
    total_elapsed = (_utc_now() - started_utc).total_seconds()
    print(f"All completed. Wall time: {total_elapsed:.3f}s")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=(
            "Monitor S3 Glacier restore completion for objects, polling HeadObject Restore header until "
            "ongoing-request=\"false\". Designed for S3-compatible on-prem storage."
        )
    )
    p.add_argument("--endpoint-url", default=None, help="S3-compatible endpoint URL (e.g. https://s3.example.local)")
    p.add_argument("--region", default="us-east-1", help="AWS region (kept for compatibility). Default: us-east-1")
    p.add_argument("--bucket", required=True, help="Bucket name")
    p.add_argument("--prefix", default="", help="Only consider objects under this prefix when auto-listing")
    p.add_argument(
        "--keys-file",
        type=Path,
        default=None,
        help="Optional text file listing object keys (one per line). If provided, overrides --max-keys listing.",
    )
    p.add_argument("--max-keys", type=int, default=100, help="Number of objects to monitor when auto-listing. Default: 100")
    p.add_argument("--poll-seconds", type=int, default=30, help="Polling interval in seconds. Default: 30")
    p.add_argument(
        "--csv",
        type=Path,
        default=Path("restore_timings.csv"),
        help="Output CSV path. Default: restore_timings.csv",
    )
    p.add_argument(
        "--access-key-id",
        default=None,
        help="Access key id (optional). If omitted, boto3 default credential chain is used.",
    )
    p.add_argument(
        "--secret-access-key",
        default=None,
        help="Secret access key (optional). If omitted, boto3 default credential chain is used.",
    )

    args = p.parse_args(argv)

    if args.poll_seconds < 1:
        raise SystemExit("--poll-seconds must be >= 1")
    if args.max_keys < 1:
        raise SystemExit("--max-keys must be >= 1")

    # Ignore SSL verification (for on-prem / test envs) and suppress urllib3 warnings.
    warnings.filterwarnings("ignore", message="Unverified HTTPS request")

    session = boto3.session.Session()
    s3 = session.client(
        "s3",
        region_name=args.region,
        endpoint_url=args.endpoint_url,
        aws_access_key_id=args.access_key_id,
        aws_secret_access_key=args.secret_access_key,
        verify=False,
        config=Config(
            retries={"max_attempts": 10, "mode": "standard"},
            signature_version="s3v4",
        ),
    )

    if args.keys_file is not None:
        keys = list(_iter_keys_from_file(args.keys_file))
        if not keys:
            raise SystemExit(f"No keys found in --keys-file: {args.keys_file}")
    else:
        keys = _list_first_n_keys(s3, args.bucket, args.prefix, args.max_keys)
        if not keys:
            raise SystemExit("No objects found to monitor (check bucket/prefix).")

    return monitor_restore(
        s3=s3,
        bucket=args.bucket,
        keys=keys,
        poll_interval_seconds=args.poll_seconds,
        csv_path=args.csv,
    )


if __name__ == "__main__":
    raise SystemExit(main())

