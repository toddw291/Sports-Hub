#!/usr/bin/env python3
"""Draw the Ward Sports home-screen icons: a gold aquila on gunmetal."""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "sports" / "icons"
GUNMETAL = "#1E2124"
VOID = "#0B0B0D"
GOLD = "#C9A44C"
GOLD_BRIGHT = "#E8C874"


def scale(points, cx, cy, size):
    return [(cx + x * size, cy + y * size) for x, y in points]


def wing(sign):
    raw = [
        (0.02, -0.02),
        (0.18, -0.16),
        (0.34, -0.22),
        (0.26, -0.10),
        (0.42, -0.12),
        (0.28, -0.02),
        (0.46, 0.02),
        (0.30, 0.08),
        (0.40, 0.14),
        (0.18, 0.12),
        (0.04, 0.08),
    ]
    return [(sign * x, y) for x, y in raw]


def head(sign):
    raw = [
        (0.04, -0.02),
        (0.06, -0.16),
        (0.02, -0.24),
        (0.10, -0.28),
        (0.16, -0.22),
        (0.14, -0.16),
        (0.18, -0.14),
        (0.12, -0.08),
        (0.08, -0.02),
    ]
    return [(sign * x, y) for x, y in raw]


def beak(sign):
    return [(sign * x, y) for x, y in [(0.14, -0.20), (0.28, -0.18), (0.15, -0.14)]]


def body():
    return [(-0.12, -0.12), (0.12, -0.12), (0.11, 0.22), (0.00, 0.32), (-0.11, 0.22)]


def tail():
    return [
        [(-0.07, 0.20), (-0.14, 0.40), (-0.01, 0.28)],
        [(-0.02, 0.24), (0.00, 0.44), (0.02, 0.24)],
        [(0.07, 0.20), (0.14, 0.40), (0.01, 0.28)],
    ]


def feathers(sign):
    return [
        [(sign * x, y) for x, y in pair]
        for pair in [
            [(0.16, -0.12), (0.30, -0.08)],
            [(0.18, -0.02), (0.36, 0.02)],
            [(0.16, 0.08), (0.32, 0.12)],
        ]
    ]


def draw_aquila(pen, cx, cy, size, width):
    pen.polygon(scale(wing(1), cx, cy, size), fill=GOLD)
    pen.polygon(scale(wing(-1), cx, cy, size), fill=GOLD)
    pen.polygon(scale(body(), cx, cy, size), fill=GOLD)
    pen.polygon(scale(head(1), cx, cy, size), fill=GOLD_BRIGHT)
    pen.polygon(scale(head(-1), cx, cy, size), fill=GOLD_BRIGHT)
    pen.polygon(scale(beak(1), cx, cy, size), fill=GOLD)
    pen.polygon(scale(beak(-1), cx, cy, size), fill=GOLD)
    for feather in tail():
        pen.polygon(scale(feather, cx, cy, size), fill=GOLD_BRIGHT)
    line = max(1, width)
    for sign in (-1, 1):
        for feather in feathers(sign):
            pen.line(scale(feather, cx, cy, size), fill=GOLD_BRIGHT, width=line)
    eye = max(1, int(size * 0.018))
    for sign in (-1, 1):
        ex = cx + sign * 0.11 * size
        ey = cy - 0.20 * size
        pen.ellipse([ex - eye, ey - eye, ex + eye, ey + eye], fill=VOID)


def draw(size, maskable=False):
    image = Image.new("RGB", (size, size), GUNMETAL)
    pen = ImageDraw.Draw(image)
    margin = int(size * (0.12 if maskable else 0.06))
    pen.rounded_rectangle(
        [margin, margin, size - 1 - margin, size - 1 - margin],
        radius=int(size * 0.08),
        outline=GOLD,
        width=max(2, size // 48),
    )
    draw_aquila(pen, size / 2, size * 0.50, size * (0.78 if maskable else 0.92), max(2, size // 80))
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
