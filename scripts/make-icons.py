#!/usr/bin/env python3
"""Draw the Ward Sports home-screen icons. Black, gold, and crimson."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "sports" / "icons"
FONT = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
BG = "#09090b"
GOLD = "#d4b56a"
GOLD_BRIGHT = "#f3e2b0"
CRIMSON = "#8e1c32"


def wing(draw, cx, cy, scale, sign):
    feathers = [
        (0.05, -0.04, 0.38, -0.22, 0.46, -0.08, 0.14, 0.00),
        (0.04, 0.02, 0.40, 0.00, 0.46, 0.12, 0.12, 0.08),
        (0.03, 0.08, 0.30, 0.16, 0.34, 0.26, 0.08, 0.14),
    ]
    for feather in feathers:
        points = [
            (cx + sign * feather[0] * scale, cy + feather[1] * scale),
            (cx + sign * feather[2] * scale, cy + feather[3] * scale),
            (cx + sign * feather[4] * scale, cy + feather[5] * scale),
            (cx + sign * feather[6] * scale, cy + feather[7] * scale),
        ]
        draw.polygon(points, fill=GOLD)


def emblem(draw, size, cx, cy, scale):
    wing(draw, cx, cy, scale, -1)
    wing(draw, cx, cy, scale, 1)
    top = cy - 0.02 * scale
    shield = [
        (cx, top - 0.16 * scale),
        (cx + 0.16 * scale, top + 0.02 * scale),
        (cx + 0.13 * scale, top + 0.28 * scale),
        (cx, top + 0.40 * scale),
        (cx - 0.13 * scale, top + 0.28 * scale),
        (cx - 0.16 * scale, top + 0.02 * scale),
    ]
    draw.polygon(shield, fill=CRIMSON)
    draw.line(shield + [shield[0]], fill=GOLD_BRIGHT, width=max(2, size // 80))
    font = ImageFont.truetype(FONT, int(scale * 0.22))
    text = "W"
    box = draw.textbbox((0, 0), text, font=font)
    tw = box[2] - box[0]
    th = box[3] - box[1]
    draw.text(
        (cx - tw / 2 - box[0], top + 0.02 * scale - box[1] + (0.16 * scale - th) / 2),
        text,
        font=font,
        fill=GOLD_BRIGHT,
    )


def draw(size, maskable=False):
    image = Image.new("RGB", (size, size), BG)
    pen = ImageDraw.Draw(image)
    margin = int(size * (0.16 if maskable else 0.07))
    width = max(2, size // (40 if maskable else 46))
    pen.rounded_rectangle(
        [margin, margin, size - 1 - margin, size - 1 - margin],
        radius=int(size * 0.12),
        outline=GOLD,
        width=width,
    )
    inset = margin + width + max(3, size // 70)
    pen.rounded_rectangle(
        [inset, inset, size - 1 - inset, size - 1 - inset],
        radius=int(size * 0.09),
        outline=CRIMSON,
        width=max(2, size // 80),
    )
    emblem(pen, size, size / 2, size * 0.48, size * (0.62 if maskable else 0.78))
    return image


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192).save(OUT / "icon-192.png")
    draw(512).save(OUT / "icon-512.png")
    draw(180).save(OUT / "apple-touch-icon.png")
    draw(512, maskable=True).save(OUT / "icon-maskable-512.png")
    print(f"Wrote icons to {OUT}")


if __name__ == "__main__":
    main()
