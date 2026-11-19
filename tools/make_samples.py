#!/usr/bin/env python3
"""Deterministically paint original sample photographs for the cover Studio."""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
import math
import random

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "app" / "samples"
DESTINATION.mkdir(parents=True, exist_ok=True)


def vertical_gradient(size, stops):
    width, height = size
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        position = y / max(1, height - 1)
        for index in range(len(stops) - 1):
            start, first = stops[index]
            end, second = stops[index + 1]
            if start <= position <= end:
                amount = (position - start) / max(0.0001, end - start)
                color = tuple(round(a + (b - a) * amount) for a, b in zip(first, second))
                break
        else:
            color = stops[-1][1]
        draw.line((0, y, width, y), fill=color)
    return image


def glowing_line(image, points, color, width=5, glow=22):
    aura = Image.new("RGBA", image.size)
    painter = ImageDraw.Draw(aura)
    painter.line(points, fill=(*color, 180), width=width * 4, joint="curve")
    aura = aura.filter(ImageFilter.GaussianBlur(glow))
    image.paste(aura, (0, 0), aura)
    painter = ImageDraw.Draw(image)
    painter.line(points, fill=(*color, 255), width=width, joint="curve")


def paint_clouds(image, seed, tint=(255, 182, 199)):
    rng = random.Random(seed)
    layer = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(layer)
    width, height = image.size
    for _ in range(16):
        x = rng.randint(-200, width)
        y = rng.randint(int(height * 0.1), int(height * 0.48))
        length = rng.randint(160, 520)
        thickness = rng.randint(8, 30)
        draw.ellipse((x, y, x + length, y + thickness), fill=(*tint, rng.randint(20, 75)))
    layer = layer.filter(ImageFilter.GaussianBlur(16))
    image.paste(layer, (0, 0), layer)


def paint_sun(image, center, radius, color=(255, 211, 118)):
    x, y = center
    glow = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(glow)
    draw.ellipse((x - radius * 1.8, y - radius * 1.8, x + radius * 1.8, y + radius * 1.8), fill=(*color, 80))
    glow = glow.filter(ImageFilter.GaussianBlur(radius // 2))
    image.paste(glow, (0, 0), glow)
    draw = ImageDraw.Draw(image)
    for band in range(9):
        top = y - radius + band * radius * 2 / 9
        bottom = y - radius + (band + 1) * radius * 2 / 9 - band * 1.4
        # Striped sun echoes classic synthwave poster printing.
        left = x - math.sqrt(max(0, radius * radius - (top - y) ** 2))
        right = x + math.sqrt(max(0, radius * radius - (top - y) ** 2))
        draw.rectangle((left, top, right, bottom), fill=(*color, 255))


def palm_tree(image, base, height, lean=0, color=(24, 20, 49), seed=1):
    rng = random.Random(seed)
    x, y = base
    top_x = x + lean
    top_y = y - height
    draw = ImageDraw.Draw(image)
    trunk = [(x - height * 0.025, y), (x + height * 0.025, y),
             (top_x + height * 0.015, top_y), (top_x - height * 0.012, top_y)]
    draw.polygon(trunk, fill=(*color, 255))
    for index in range(11):
        angle = math.pi * 2 * index / 11 + rng.uniform(-0.13, 0.13)
        length = height * rng.uniform(0.25, 0.42)
        end_x = top_x + math.cos(angle) * length
        end_y = top_y + math.sin(angle) * length * 0.46 + height * 0.055
        mid_x = top_x + math.cos(angle) * length * 0.55
        mid_y = top_y + math.sin(angle) * length * 0.2 - height * 0.06
        draw.line((top_x, top_y, mid_x, mid_y, end_x, end_y), fill=(*color, 255), width=max(3, height // 95))
        for step in range(2, 10):
            t = step / 11
            px = top_x + (end_x - top_x) * t
            py = top_y + (end_y - top_y) * t - math.sin(t * math.pi) * height * 0.05
            leaf = height * 0.055 * (1 - t * 0.5)
            draw.line((px, py, px - math.sin(angle) * leaf, py + math.cos(angle) * leaf), fill=(*color, 255), width=max(2, height // 150))
            draw.line((px, py, px + math.sin(angle) * leaf, py - math.cos(angle) * leaf), fill=(*color, 255), width=max(2, height // 150))


def skyline(image, horizon, color, seed, minimum=60, maximum=230):
    rng = random.Random(seed)
    draw = ImageDraw.Draw(image)
    x = -20
    while x < image.width:
        width = rng.randint(45, 125)
        height = rng.randint(minimum, maximum)
        draw.rectangle((x, horizon - height, x + width, horizon), fill=(*color, 255))
        if rng.random() < 0.5:
            draw.rectangle((x + width * 0.35, horizon - height - 18, x + width * 0.65, horizon - height), fill=(*color, 255))
        for wx in range(x + 12, x + width - 8, 20):
            for wy in range(int(horizon - height + 18), horizon - 12, 27):
                if rng.random() < 0.35:
                    draw.rectangle((wx, wy, wx + 5, wy + 9), fill=(255, 174, 115, 140))
        x += width + rng.randint(5, 20)


def human_figure(image, x, ground, scale, jacket=(30, 24, 54), rim=(255, 123, 162), facing=1):
    """Original stylised mannequin silhouette; no real person is depicted."""
    draw = ImageDraw.Draw(image)
    head_y = ground - 370 * scale
    draw.ellipse((x - 34 * scale, head_y - 45 * scale, x + 34 * scale, head_y + 38 * scale), fill=(38, 25, 48, 255))
    draw.polygon([(x - 28 * scale, head_y + 22 * scale), (x + 30 * scale, head_y + 18 * scale),
                  (x + 76 * scale, ground - 225 * scale), (x + 44 * scale, ground - 104 * scale),
                  (x - 52 * scale, ground - 106 * scale), (x - 75 * scale, ground - 230 * scale)], fill=(*jacket, 255))
    draw.polygon([(x - 54 * scale, ground - 115 * scale), (x - 5 * scale, ground - 115 * scale),
                  (x - 15 * scale, ground), (x - 52 * scale, ground)], fill=(19, 18, 39, 255))
    draw.polygon([(x + 2 * scale, ground - 115 * scale), (x + 48 * scale, ground - 115 * scale),
                  (x + 64 * scale, ground), (x + 23 * scale, ground)], fill=(19, 18, 39, 255))
    draw.line((x - 58 * scale, ground - 230 * scale, x - 100 * scale, ground - 110 * scale), fill=(*jacket, 255), width=max(8, int(30 * scale)))
    draw.line((x + 57 * scale, ground - 228 * scale, x + 93 * scale, ground - 118 * scale), fill=(*jacket, 255), width=max(8, int(29 * scale)))
    draw.line((x - 30 * scale, head_y - 36 * scale, x - 38 * scale, head_y + 10 * scale), fill=(*rim, 230), width=max(2, int(5 * scale)))
    draw.line((x - 68 * scale, ground - 230 * scale, x - 48 * scale, ground - 120 * scale), fill=(*rim, 190), width=max(2, int(4 * scale)))
    # Shirt opening and sharp lapels keep the silhouette fashion-editorial.
    draw.polygon([(x - 18 * scale, head_y + 40 * scale), (x + 20 * scale, head_y + 40 * scale),
                  (x + 8 * scale, ground - 240 * scale)], fill=(245, 174, 163, 255))
    draw.line((x - 28 * scale, head_y + 50 * scale, x + 4 * scale, ground - 225 * scale), fill=(245, 210, 200, 180), width=max(2, int(3 * scale)))


def sports_car(image, box, body=(236, 70, 115)):
    x, y, width, height = box
    draw = ImageDraw.Draw(image)
    shadow = Image.new("RGBA", image.size)
    shade = ImageDraw.Draw(shadow)
    shade.ellipse((x, y + height * 0.65, x + width, y + height * 1.06), fill=(10, 8, 30, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(height * 0.1)))
    image.paste(shadow, (0, 0), shadow)
    draw = ImageDraw.Draw(image)
    draw.polygon([(x + width * 0.08, y + height * 0.68), (x + width * 0.19, y + height * 0.37),
                  (x + width * 0.37, y + height * 0.10), (x + width * 0.66, y + height * 0.10),
                  (x + width * 0.84, y + height * 0.40), (x + width * 0.97, y + height * 0.62),
                  (x + width * 0.93, y + height * 0.85), (x + width * 0.10, y + height * 0.85)], fill=(*body, 255))
    draw.polygon([(x + width * 0.29, y + height * 0.36), (x + width * 0.41, y + height * 0.16),
                  (x + width * 0.63, y + height * 0.16), (x + width * 0.77, y + height * 0.37)], fill=(30, 40, 76, 255))
    draw.polygon([(x + width * 0.32, y + height * 0.35), (x + width * 0.42, y + height * 0.19),
                  (x + width * 0.48, y + height * 0.19), (x + width * 0.45, y + height * 0.35)], fill=(133, 182, 202, 255))
    draw.line((x + width * 0.15, y + height * 0.54, x + width * 0.90, y + height * 0.54), fill=(255, 166, 174, 255), width=max(3, int(height * 0.025)))
    for wheel_x in (x + width * 0.23, x + width * 0.80):
        draw.ellipse((wheel_x - height * 0.17, y + height * 0.65, wheel_x + height * 0.17, y + height), fill=(12, 13, 28, 255))
        draw.ellipse((wheel_x - height * 0.09, y + height * 0.73, wheel_x + height * 0.09, y + height * 0.91), fill=(146, 150, 170, 255))
    glowing_line(image, [(x + width * 0.11, y + height * 0.61), (x + width * 0.29, y + height * 0.60)], (255, 240, 191), max(2, int(height * 0.025)), 12)
    glowing_line(image, [(x + width * 0.75, y + height * 0.60), (x + width * 0.93, y + height * 0.61)], (255, 240, 191), max(2, int(height * 0.025)), 12)


def film_finish(image, seed, warmth=0.08):
    rng = random.Random(seed)
    noise_size = (image.width // 3, image.height // 3)
    noise = Image.frombytes("L", noise_size, bytes(rng.randrange(78, 178) for _ in range(noise_size[0] * noise_size[1])))
    noise = noise.resize(image.size, Image.Resampling.BILINEAR)
    grain = Image.merge("RGB", (noise, noise, noise))
    image = Image.blend(image, grain, 0.055)
    wash = Image.new("RGB", image.size, (255, 105, 126))
    image = Image.blend(image, wash, warmth)
    return ImageEnhance.Contrast(image).enhance(1.08)


def make_boulevard():
    size = (1600, 1200)
    image = vertical_gradient(size, [(0, (45, 42, 111)), (0.45, (185, 77, 137)), (0.72, (255, 160, 129)), (1, (38, 29, 66))]).convert("RGBA")
    paint_clouds(image, 7)
    paint_sun(image, (1120, 335), 145)
    skyline(image, 690, (39, 32, 73), 33, 90, 290)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 690, 1600, 1200), fill=(27, 24, 52, 255))
    # Art-deco hotel and illuminated architectural ribs.
    draw.rectangle((0, 255, 400, 780), fill=(39, 40, 80, 255))
    draw.polygon([(0, 255), (200, 150), (400, 255)], fill=(50, 43, 87, 255))
    for x in (45, 130, 270, 355):
        draw.rectangle((x, 280, x + 14, 700), fill=(99, 71, 116, 255))
    for y in (370, 485, 600):
        for x in (72, 172, 295):
            draw.rectangle((x, y, x + 58, y + 60), fill=(249, 143, 150, 255))
    glowing_line(image, [(40, 320), (40, 690)], (50, 241, 230), 6, 22)
    glowing_line(image, [(380, 310), (380, 690)], (255, 75, 163), 6, 22)
    palm_tree(image, (1430, 865), 570, -85, seed=8)
    palm_tree(image, (520, 800), 400, 40, seed=9)
    # Road markings and long reflected neon strokes.
    draw.polygon([(700, 690), (790, 690), (990, 1200), (690, 1200)], fill=(43, 34, 68, 255))
    for index in range(7):
        y = 740 + index * 70
        draw.rectangle((760 - index * 10, y, 770 + index * 12, y + 28), fill=(255, 186, 127, 160))
    sports_car(image, (80, 790, 650, 280), body=(218, 63, 123))
    human_figure(image, 1110, 1160, 1.55, jacket=(27, 29, 57), rim=(68, 244, 226))
    return film_finish(image.convert("RGB"), 128, 0.035)


def make_pier():
    size = (1500, 1200)
    image = vertical_gradient(size, [(0, (80, 70, 151)), (0.38, (242, 112, 148)), (0.64, (255, 193, 129)), (1, (26, 80, 111))]).convert("RGBA")
    paint_clouds(image, 16, (255, 200, 193))
    paint_sun(image, (755, 425), 175, (255, 221, 139))
    skyline(image, 650, (67, 54, 94), 20, 40, 140)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 650, 1500, 1200), fill=(35, 100, 126, 255))
    for index in range(90):
        y = 660 + index * 6
        spread = 150 + index * 4
        alpha = max(15, 150 - index)
        draw.line((750 - spread, y, 750 + spread, y), fill=(255, 179, 137, alpha), width=2)
    draw.polygon([(0, 925), (1500, 790), (1500, 900), (0, 1070)], fill=(35, 30, 56, 255))
    for x in range(40, 1500, 125):
        y = 1020 - x * 0.085
        draw.rectangle((x, y, x + 18, 1200), fill=(24, 27, 48, 255))
    palm_tree(image, (160, 1010), 660, 110, seed=13)
    palm_tree(image, (1370, 900), 530, -90, seed=14)
    human_figure(image, 905, 1035, 0.95, jacket=(240, 112, 139), rim=(255, 224, 162))
    human_figure(image, 1080, 1000, 0.82, jacket=(33, 39, 70), rim=(255, 157, 156))
    return film_finish(image.convert("RGB"), 81, 0.025)


def make_ocean_drive():
    size = (1600, 1100)
    image = vertical_gradient(size, [(0, (34, 49, 100)), (0.48, (197, 80, 142)), (0.72, (255, 170, 123)), (1, (24, 28, 54))]).convert("RGBA")
    paint_clouds(image, 51)
    paint_sun(image, (350, 370), 150)
    draw = ImageDraw.Draw(image)
    # Neon motel facade with balconies and a roof sign.
    draw.rectangle((790, 235, 1600, 745), fill=(39, 39, 76, 255))
    draw.rectangle((850, 180, 1490, 250), fill=(48, 43, 84, 255))
    for y in (340, 475, 610):
        draw.rectangle((820, y, 1600, y + 13), fill=(108, 72, 110, 255))
        for x in range(855, 1560, 135):
            draw.rectangle((x, y - 75, x + 78, y - 10), fill=(244, 132, 149, 255))
            draw.rectangle((x + 10, y - 65, x + 68, y - 20), fill=(43, 73, 110, 255))
    glowing_line(image, [(815, 275), (1550, 275)], (67, 236, 224), 5, 18)
    glowing_line(image, [(900, 205), (1390, 205)], (255, 74, 158), 7, 24)
    palm_tree(image, (725, 800), 570, 55, seed=28)
    palm_tree(image, (120, 760), 450, -50, seed=29)
    draw.rectangle((0, 745, 1600, 1100), fill=(27, 29, 55, 255))
    for x, color in ((850, (255, 64, 153)), (1020, (60, 225, 225)), (1370, (255, 126, 127))):
        reflection = Image.new("RGBA", image.size)
        rd = ImageDraw.Draw(reflection)
        rd.polygon([(x, 760), (x + 30, 760), (x + 160, 1100), (x - 100, 1100)], fill=(*color, 45))
        reflection = reflection.filter(ImageFilter.GaussianBlur(22))
        image.paste(reflection, (0, 0), reflection)
    sports_car(image, (190, 600, 1210, 440), body=(238, 83, 128))
    return film_finish(image.convert("RGB"), 207, 0.02)


def main():
    samples = {
        "midnight-boulevard.jpg": make_boulevard(),
        "sunset-pier.jpg": make_pier(),
        "ocean-drive.jpg": make_ocean_drive(),
    }
    for name, image in samples.items():
        path = DESTINATION / name
        image.save(path, "JPEG", quality=91, optimize=True, progressive=False, subsampling=1)
        print(f"{path.relative_to(ROOT)} {image.width}x{image.height} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
