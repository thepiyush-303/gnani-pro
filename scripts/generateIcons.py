#!/usr/bin/env python3
"""
Derives ConvoAI's launcher assets from the source icon `assets/new-icon.png`
(1024², mascot on a full-bleed rose background).

    python3 scripts/generateIcons.py                       # writes assets/adaptive-icon.png
    npx expo prebuild --platform android --no-install      # regenerates launcher mipmaps from app.json

- Legacy icon + splash use new-icon.png directly (see app.json).
- Adaptive icon: launcher masks show only the centre ~66% (and circles clip corners),
  so the foreground is the icon scaled to 80% on its own background colour.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "new-icon.png")
OUT = os.path.join(ROOT, "assets", "adaptive-icon.png")
SCALE = 0.80

if __name__ == "__main__":
    src = Image.open(SRC).convert("RGBA")
    size = src.size[0]
    bg = src.getpixel((4, 4))  # the icon's rose background
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * SCALE)
    scaled = src.resize((inner, inner), Image.LANCZOS)
    canvas.paste(scaled, ((size - inner) // 2, (size - inner) // 2))
    canvas.save(OUT)
    print(f"wrote {os.path.relpath(OUT, ROOT)} (background #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X})")
