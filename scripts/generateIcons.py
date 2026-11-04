#!/usr/bin/env python3
"""
Generates the app's launcher / adaptive / splash icons with Pillow.

The mark matches the overlay bubble glyph (res/drawable/ic_copilot.xml):
a chat bubble with a 4-point spark, here white-on-gradient (indigo → cyan).

    python3 scripts/generateIcons.py      # writes assets/*.png
    npm run prebuild                      # regenerates android/ launcher mipmaps from app.json
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")
SS = 4  # supersampling for smooth edges

INDIGO = (79, 70, 229)
CYAN = (6, 182, 212)
INK = (11, 16, 32)


def gradient(size):
    """Diagonal indigo → cyan gradient."""
    w = h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h - 2)
            px[x, y] = tuple(int(INDIGO[i] + (CYAN[i] - INDIGO[i]) * t) for i in range(3))
    return img


def draw_mark(draw, cx, cy, scale, bubble=(255, 255, 255, 255), spark=INK + (255,)):
    """Bubble + spark in a 24-unit design space centred on (12, 12) → (cx, cy)."""
    def p(x, y):
        return (cx + (x - 12) * scale, cy + (y - 12) * scale)

    # Bubble body (3,3)-(21,17), radius 3, with a tail down to (7,21)
    x0, y0 = p(3, 3)
    x1, y1 = p(21, 17)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=3 * scale, fill=bubble)
    draw.polygon([p(7, 16), p(12, 16.5), p(7, 21)], fill=bubble)
    # 4-point spark centred at (12, 10)
    c = (12, 10)
    arm, waist = 4.6, 1.25
    pts = [
        (c[0], c[1] - arm), (c[0] + waist, c[1] - waist),
        (c[0] + arm, c[1]), (c[0] + waist, c[1] + waist),
        (c[0], c[1] + arm), (c[0] - waist, c[1] + waist),
        (c[0] - arm, c[1]), (c[0] - waist, c[1] - waist),
    ]
    draw.polygon([p(x, y) for x, y in pts], fill=spark)


def icon(size=1024):
    """Full launcher icon: gradient rounded square + white mark."""
    S = size * SS
    base = gradient(S // 4).resize((S, S), Image.BICUBIC).convert("RGBA")
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.23), fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(base, (0, 0), mask)
    draw_mark(ImageDraw.Draw(img), S / 2, S / 2 + S * 0.02, scale=S / 24 * 0.62)
    return img.resize((size, size), Image.LANCZOS)


def adaptive_foreground(size=1024):
    """Transparent foreground; mark kept inside the 66% safe zone."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(img), S / 2, S / 2 + S * 0.015, scale=S / 24 * 0.5)
    return img.resize((size, size), Image.LANCZOS)


def adaptive_background(size=1024):
    return gradient(size // 4).resize((size, size), Image.BICUBIC)


def splash(size=512):
    """Mark on transparent background for the splash screen."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, S - 1, S - 1], fill=INDIGO + (255,))
    draw_mark(d, S / 2, S / 2 + S * 0.02, scale=S / 24 * 0.55)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    icon().save(os.path.join(OUT, "icon.png"))
    adaptive_foreground().save(os.path.join(OUT, "adaptive-icon.png"))
    adaptive_background().save(os.path.join(OUT, "adaptive-icon-bg.png"))
    splash().save(os.path.join(OUT, "splash-icon.png"))
    print("wrote", sorted(f for f in os.listdir(OUT) if f.endswith(".png")))
