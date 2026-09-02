#!/usr/bin/env python3
"""Generate intro/outro title cards for demo video."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "assets" / "brand" / "prorogapro-mark-transparent-1953x2048.png"
if not LOGO.exists():
    LOGO = ROOT / "assets" / "prorogapro-mark.png"

FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/Library/Fonts/Arial.ttf",
]


def font(size, bold=False):
    candidates = [FONTS[0], FONTS[2]] if bold else [FONTS[1], FONTS[3]]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def card(w, h, title, subtitle=None, footer=None):
    img = Image.new("RGBA", (w, h), (30, 58, 138, 255))
    draw = ImageDraw.Draw(img)
    if LOGO.exists():
        logo = Image.open(LOGO).convert("RGBA")
        lw = int(w * 0.18)
        lh = int(logo.height * (lw / logo.width))
        logo = logo.resize((lw, lh), Image.Resampling.LANCZOS)
        img.paste(logo, ((w - lw) // 2, int(h * 0.22)), logo)
    ty = int(h * 0.52)
    tfont = font(int(h * 0.055), bold=True)
    bbox = draw.textbbox((0, 0), title, font=tfont)
    draw.text(((w - bbox[2] + bbox[0]) // 2, ty), title, fill=(255, 255, 255), font=tfont)
    if subtitle:
        sfont = font(int(h * 0.028))
        sb = draw.textbbox((0, 0), subtitle, font=sfont)
        draw.text(((w - sb[2] + sb[0]) // 2, ty + int(h * 0.08)), subtitle, fill=(203, 213, 225), font=sfont)
    if footer:
        ffont = font(int(h * 0.026))
        fb = draw.textbbox((0, 0), footer, font=ffont)
        draw.text(((w - fb[2] + fb[0]) // 2, int(h * 0.72)), footer, fill=(147, 197, 253), font=ffont)
    return img


def main():
    kind, out, w, h = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    if kind == "intro":
        im = card(w, h, "ProrogaPro", "Scadenze e proroghe contrattuali")
    else:
        im = card(w, h, "Prova gratis 14 giorni", footer="evolofabio.github.io/gestione-scadenze-contratti")
    im.save(out)


if __name__ == "__main__":
    main()
