#!/usr/bin/env python3
"""Export high-resolution PNG brand assets with transparent background."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "assets"
OUT = ROOT / "brand"
OUT.mkdir(exist_ok=True)

SOURCES = {
    "prorogapro-mark": ROOT / "prorogapro-mark.png",
    "prorogapro-logo-full": ROOT / "prorogapro-logo.png",
    "prorogapro-wordmark": ROOT / "prorogapro-wordmark.png",
}

MAX_SIDES = [2048, 4096]


def export():
    for name, path in SOURCES.items():
        if not path.exists():
            continue
        img = Image.open(path).convert("RGBA")
        w, h = img.size
        for max_side in MAX_SIDES:
            scale = max_side / max(w, h)
            if scale <= 1 and max_side != 2048:
                continue
            if scale <= 1:
                resized = img
            else:
                nw = max(1, int(round(w * scale)))
                nh = max(1, int(round(h * scale)))
                resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
            nw, nh = resized.size
            out_path = OUT / f"{name}-transparent-{nw}x{nh}.png"
            resized.save(out_path, optimize=True)
            print(out_path)


if __name__ == "__main__":
    export()
