import asyncio

import psutil
from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.docker_client import get_docker
from app.models import User

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/host")
def host_stats(_: User = Depends(get_current_user)):
    cpu = psutil.cpu_percent(interval=0.2)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        "cpu_percent": round(cpu, 1),
        "mem_used": mem.used,
        "mem_total": mem.total,
        "mem_percent": round(mem.percent, 1),
        "disk_used": disk.used,
        "disk_total": disk.total,
        "disk_percent": round(disk.percent, 1),
    }


def _container_stat(c) -> dict:
    try:
        s = c.stats(stream=False)
        # CPU %
        cpu_delta = (
            s["cpu_stats"]["cpu_usage"]["total_usage"]
            - s["precpu_stats"]["cpu_usage"]["total_usage"]
        )
        sys_delta = s["cpu_stats"].get("system_cpu_usage", 0) - s["precpu_stats"].get(
            "system_cpu_usage", 0
        )
        num_cpus = s["cpu_stats"].get("online_cpus") or len(
            s["cpu_stats"]["cpu_usage"].get("percpu_usage", [1])
        )
        cpu_pct = (cpu_delta / sys_delta * num_cpus * 100.0) if sys_delta > 0 else 0.0

        # Memory (cache 제외)
        mem_stats = s.get("memory_stats", {})
        mem_raw = mem_stats.get("usage", 0)
        cache = mem_stats.get("stats", {}).get("cache", 0)
        mem_usage = max(mem_raw - cache, 0)
        mem_limit = mem_stats.get("limit", 0)

        return {
            "id": c.short_id,
            "cpu_percent": round(cpu_pct, 1),
            "mem_usage": mem_usage,
            "mem_limit": mem_limit,
        }
    except Exception:
        return {"id": c.short_id, "cpu_percent": 0.0, "mem_usage": 0, "mem_limit": 0}


@router.get("/container-stats")
async def container_stats(_: User = Depends(get_current_user)):
    client = get_docker()
    containers = client.containers.list()  # 실행 중인 컨테이너만
    results = await asyncio.gather(
        *[asyncio.to_thread(_container_stat, c) for c in containers]
    )
    return list(results)
