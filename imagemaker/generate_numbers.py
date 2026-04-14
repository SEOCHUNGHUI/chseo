from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def _load_font(font_size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """
    Prefer Malgun Gothic on Windows. Fall back to commonly available fonts,
    then to PIL's default bitmap font.
    """
    candidates: list[str] = [
        # Windows (Korean)
        r"C:\Windows\Fonts\malgun.ttf",
        r"C:\Windows\Fonts\malgunsl.ttf",
        # Other common fonts (may exist depending on environment)
        r"C:\Windows\Fonts\arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]

    for path in candidates:
        try:
            if os.path.exists(path):
                return ImageFont.truetype(path, font_size)
        except Exception:
            pass

    # Last resort: PIL default
    return ImageFont.load_default()


def _fit_font(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, image_size: int) -> ImageFont.ImageFont:
    """
    If a truetype font is used, adjust size so the text fits well.
    For bitmap default font, keep as-is.
    """
    if not hasattr(font, "path"):
        return font

    # Try to make the text occupy ~70% of the width/height.
    # Start large, then shrink until it fits.
    target = int(image_size * 0.7)
    for size in range(int(image_size * 0.55), 10, -2):
        try:
            candidate = ImageFont.truetype(getattr(font, "path"), size)
        except Exception:
            return font
        bbox = draw.textbbox((0, 0), text, font=candidate)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if w <= target and h <= target:
            return candidate
    return font


def generate_images(
    *,
    start: int = 1,
    end: int = 1000,
    image_size: int = 512,
    background: tuple[int, int, int] = (255, 255, 255),
    text_color: tuple[int, int, int] = (0, 0, 0),
    output_dir: Path = Path("output"),
    quality: int = 95,
) -> float:
    output_dir.mkdir(parents=True, exist_ok=True)

    base_font = _load_font(font_size=int(image_size * 0.28))
    pad_width = max(4, len(str(end)))

    t0 = time.perf_counter()
    for n in range(start, end + 1):
        img = Image.new("RGB", (image_size, image_size), background)
        draw = ImageDraw.Draw(img)

        text = str(n)
        font = _fit_font(draw, text, base_font, image_size)

        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        x = (image_size - text_w) / 2 - bbox[0]
        y = (image_size - text_h) / 2 - bbox[1]

        draw.text((x, y), text, font=font, fill=text_color)

        out_path = output_dir / f"image_{n:0{pad_width}d}.jpg"
        img.save(out_path, format="JPEG", quality=quality, optimize=True)

    return time.perf_counter() - t0


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate numbered images using Pillow.")
    parser.add_argument("--start", type=int, default=1, help="Start number (inclusive). Default: 1")
    parser.add_argument("--end", type=int, default=1000, help="End number (inclusive). Default: 1000")
    parser.add_argument("--size", type=int, default=512, help="Image size in pixels (square). Default: 512")
    parser.add_argument("--output", type=Path, default=Path("output"), help="Output directory. Default: output/")
    args = parser.parse_args()

    if args.start < 1 or args.end < args.start:
        raise SystemExit("Invalid range: require 1 <= start <= end.")

    elapsed = generate_images(start=args.start, end=args.end, image_size=args.size, output_dir=args.output)
    count = args.end - args.start + 1
    print(f"Generated {count} images in {elapsed:.3f} seconds ({args.output.as_posix()}/).")
    print(f"Avg per image: {elapsed / count:.6f} seconds")


if __name__ == "__main__":
    main()

