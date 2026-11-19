from pathlib import Path
import math
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "app" / "samples"
SAMPLES.mkdir(parents=True, exist_ok=True)
W, H = 1800, 1200
RNG = random.Random(1986)


def gradient(stops):
    image = Image.new("RGB", (W, H))
    pixels = image.load()
    for y in range(H):
        t = y / (H - 1)
        for index in range(len(stops) - 1):
            p0, c0 = stops[index]
            p1, c1 = stops[index + 1]
            if p0 <= t <= p1:
                f = (t - p0) / (p1 - p0)
                color = tuple(round(c0[k] * (1 - f) + c1[k] * f) for k in range(3))
                break
        ImageDraw.Draw(image).line((0, y, W, y), fill=color)
    return image


def glow(image, box, color, blur=70):
    layer = Image.new("RGBA", image.size)
    ImageDraw.Draw(layer).ellipse(box, fill=color)
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def palm(layer, x, y, scale=1.0, lean=-50, color=(27, 28, 50, 255)):
    draw = ImageDraw.Draw(layer)
    points = []
    for step in range(21):
        t = step / 20
        points.append((x + lean * t * t * scale, y - 500 * t * scale))
    draw.line(points, fill=color, width=max(3, round(17 * scale)))
    tx, ty = points[-1]
    for index in range(11):
        angle = math.radians(-172 + index * 33)
        length = RNG.uniform(160, 240) * scale
        ex = tx + math.cos(angle) * length
        ey = ty + math.sin(angle) * length * 0.48 + 55 * scale
        cx = tx + math.cos(angle) * length * 0.48
        cy = ty + math.sin(angle) * length * 0.42 - 32 * scale
        curve = []
        for step in range(17):
            t = step / 16
            px = (1-t)**2*tx + 2*(1-t)*t*cx + t*t*ex
            py = (1-t)**2*ty + 2*(1-t)*t*cy + t*t*ey
            curve.append((px, py))
        draw.line(curve, fill=color, width=max(2, round(7 * scale)))
        for step in range(3, 15, 2):
            px, py = curve[step]
            previous = curve[step - 1]
            following = curve[step + 1]
            dx = following[0] - previous[0]
            dy = following[1] - previous[1]
            norm = max(1, math.hypot(dx, dy))
            nx, ny = -dy / norm, dx / norm
            leaf = 28 * scale * (1 - step / 20)
            draw.polygon([(px, py), (px + nx * leaf + dx * .3, py + ny * leaf + 13 * scale), (following[0], following[1])], fill=color)


def skyline(layer, horizon=700, tint=(64, 48, 83, 255), count=24):
    draw = ImageDraw.Draw(layer)
    x = -20
    for index in range(count):
        width = RNG.randint(45, 105)
        height = RNG.randint(70, 270)
        top = horizon - height
        draw.rectangle((x, top, x + width, horizon + 85), fill=tint)
        if index % 4 == 0:
            draw.rectangle((x + width * .2, top - 24, x + width * .8, top), fill=tint)
        for wx in range(x + 12, x + width - 8, 19):
            for wy in range(int(top) + 17, horizon, 27):
                if RNG.random() < .34:
                    draw.rectangle((wx, wy, wx + 5, wy + 8), fill=(255, 190, 133, 150))
        x += width + RNG.randint(4, 16)


def grain_finish(image, name):
    noise = Image.new("L", (W // 3, H // 3))
    noise.putdata([RNG.randrange(256) for _ in range(noise.width * noise.height)])
    noise = noise.resize((W, H), Image.Resampling.BILINEAR)
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    image = Image.blend(image.convert("RGB"), noise_rgb, .038)
    image = ImageEnhance.Contrast(image).enhance(1.06)
    image.save(SAMPLES / name, quality=91, optimize=True, progressive=True)


def make_hero():
    base = gradient([(0, (102, 97, 163)), (.38, (245, 147, 153)), (.68, (255, 195, 134)), (1, (45, 54, 84))]).convert("RGBA")
    glow(base, (1100, 250, 1540, 690), (255, 221, 158, 150), 65)
    draw = ImageDraw.Draw(base)
    draw.ellipse((1200, 370, 1430, 600), fill=(255, 219, 157, 255))
    draw.rectangle((0, 710, W, H), fill=(62, 88, 116, 255))
    for y in range(730, 1100, 35):
        draw.line((0, y, W, y + RNG.randint(-4, 4)), fill=(233, 146, 144, 60), width=3)
    skyline(base, 725, (58, 49, 81, 255), 28)
    palm(base, 210, 1080, 1.6, 85)
    palm(base, 1590, 1030, 1.05, -40)
    draw = ImageDraw.Draw(base)
    draw.polygon([(0, 1060), (520, 945), (790, 955), (960, 1200), (0, 1200)], fill=(30, 27, 48, 255))
    # Original stylised figure, seen from behind, beside the waterfront.
    draw.ellipse((947, 298, 1088, 459), fill=(37, 25, 43, 255))
    draw.polygon([(965, 427), (1056, 420), (1123, 612), (892, 617)], fill=(42, 26, 48, 255))
    draw.polygon([(922, 518), (1091, 510), (1156, 886), (844, 886)], fill=(203, 58, 105, 255))
    draw.polygon([(976, 875), (1031, 875), (1001, 1134), (944, 1134)], fill=(53, 30, 48, 255))
    draw.polygon([(1057, 875), (1110, 875), (1164, 1134), (1106, 1134)], fill=(53, 30, 48, 255))
    draw.polygon([(905, 538), (932, 540), (859, 830), (828, 831)], fill=(65, 37, 53, 255))
    draw.polygon([(1071, 538), (1094, 533), (1175, 791), (1146, 804)], fill=(65, 37, 53, 255))
    draw.arc((958, 326, 1095, 470), 190, 350, fill=(255, 169, 151, 180), width=5)
    glow(base, (780, 400, 1200, 1030), (250, 95, 145, 22), 90)
    grain_finish(base, "hero.jpg")


def make_boulevard():
    base = gradient([(0, (71, 79, 135)), (.48, (242, 132, 143)), (.75, (255, 185, 113)), (1, (70, 54, 79))]).convert("RGBA")
    glow(base, (480, 230, 960, 710), (255, 204, 149, 100), 80)
    skyline(base, 690, (52, 43, 73, 255), 23)
    palm(base, 150, 900, 1.2, 65)
    palm(base, 1650, 940, 1.45, -100)
    draw = ImageDraw.Draw(base)
    draw.rectangle((0, 760, W, H), fill=(42, 40, 59, 255))
    draw.polygon([(0, 1170), (710, 760), (800, 760), (320, 1200)], fill=(236, 163, 123, 150))
    draw.polygon([(1120, 1200), (1080, 760), (1130, 760), (1600, 1200)], fill=(236, 163, 123, 120))
    glow(base, (200, 820, 1550, 1220), (255, 59, 117, 45), 55)
    draw = ImageDraw.Draw(base)
    draw.ellipse((394, 949, 592, 1147), fill=(18, 20, 31, 255))
    draw.ellipse((1190, 949, 1388, 1147), fill=(18, 20, 31, 255))
    draw.ellipse((430, 986, 556, 1112), fill=(146, 142, 151, 255))
    draw.ellipse((1226, 986, 1352, 1112), fill=(146, 142, 151, 255))
    draw.polygon([(307, 1009), (412, 837), (666, 778), (784, 655), (1070, 669), (1231, 789), (1440, 850), (1522, 1020), (1410, 1075), (354, 1072)], fill=(226, 73, 104, 255))
    draw.polygon([(703, 774), (817, 682), (1037, 694), (1173, 791)], fill=(41, 49, 75, 255))
    draw.polygon([(841, 699), (920, 698), (913, 777), (755, 777)], fill=(100, 111, 146, 255))
    draw.line((365, 931, 1410, 903), fill=(255, 183, 153, 255), width=9)
    draw.rectangle((1320, 927, 1458, 961), fill=(255, 221, 170, 255))
    draw.rectangle((355, 950, 420, 981), fill=(248, 101, 108, 255))
    draw.rounded_rectangle((697, 922, 1085, 972), radius=13, fill=(28, 30, 46, 255))
    grain_finish(base, "boulevard.jpg")


def make_motel():
    base = gradient([(0, (24, 31, 68)), (.52, (68, 44, 94)), (1, (18, 27, 48))]).convert("RGBA")
    glow(base, (120, 80, 760, 660), (251, 61, 174, 95), 90)
    draw = ImageDraw.Draw(base)
    draw.rectangle((920, 250, 1800, 1040), fill=(55, 48, 74, 255))
    for floor in range(3):
        for room in range(5):
            x = 1000 + room * 160
            y = 345 + floor * 215
            draw.rectangle((x, y, x + 99, y + 137), fill=(25, 30, 52, 255))
            draw.rectangle((x + 8, y + 8, x + 89, y + 62), fill=(243, 145, 128, 190))
    draw.rectangle((955, 963, 1800, 1001), fill=(22, 26, 46, 255))
    draw.line((190, 191, 190, 1090), fill=(31, 28, 50, 255), width=27)
    draw.rounded_rectangle((55, 100, 650, 563), radius=36, fill=(31, 25, 60, 255), outline=(251, 104, 182, 255), width=8)
    font_big = ImageFont.truetype(str(ROOT / "app/fonts/Anton-Regular.ttf"), 128)
    font_small = ImageFont.truetype(str(ROOT / "app/fonts/Anton-Regular.ttf"), 58)
    draw.text((113, 131), "STARLIGHT", font=font_big, fill=(255, 220, 189, 255), stroke_width=3, stroke_fill=(248, 81, 174, 255))
    draw.text((135, 300), "M O T E L", font=font_small, fill=(255, 128, 198, 255))
    draw.text((112, 401), "VACANCY  /  POOL", font=font_small, fill=(109, 233, 219, 255))
    draw.rectangle((0, 1020, W, H), fill=(25, 27, 46, 255))
    for index in range(12):
        x = 70 + index * 160
        draw.polygon([(x, 1050), (x + 70, 1050), (x + 185, 1200), (x + 40, 1200)], fill=(215, 66, 150, 32))
    palm(base, 1690, 1040, 1.0, -75, (15, 20, 39, 255))
    grain_finish(base, "motel.jpg")


def make_rooftop():
    base = gradient([(0, (62, 59, 120)), (.42, (208, 105, 152)), (.7, (255, 183, 118)), (1, (42, 49, 77))]).convert("RGBA")
    glow(base, (1040, 260, 1430, 650), (255, 212, 148, 145), 70)
    ImageDraw.Draw(base).ellipse((1130, 360, 1340, 570), fill=(255, 210, 139, 255))
    skyline(base, 800, (48, 42, 73, 255), 30)
    draw = ImageDraw.Draw(base)
    draw.polygon([(0, 930), (1800, 835), (1800, 1200), (0, 1200)], fill=(27, 28, 48, 255))
    draw.line((0, 933, 1800, 838), fill=(238, 122, 132, 255), width=5)
    # Two anonymous figures at the rail.
    for x, y, s in [(780, 560, 1.0), (938, 590, .86)]:
        draw.ellipse((x, y, x + 105*s, y + 120*s), fill=(28, 25, 44, 255))
        draw.polygon([(x + 9*s, y + 105*s), (x + 94*s, y + 105*s), (x + 143*s, y + 391*s), (x - 31*s, y + 391*s)], fill=(29, 26, 45, 255))
        draw.line((x + 12*s, y + 365*s, x - 3*s, y + 585*s), fill=(26, 24, 43, 255), width=round(35*s))
        draw.line((x + 101*s, y + 365*s, x + 129*s, y + 585*s), fill=(26, 24, 43, 255), width=round(35*s))
    palm(base, 1510, 1040, 1.2, -50, (25, 26, 45, 255))
    grain_finish(base, "rooftop.jpg")


if __name__ == "__main__":
    make_hero()
    make_boulevard()
    make_motel()
    make_rooftop()
    for path in sorted(SAMPLES.glob("*.jpg")):
        print(f"generated {path.relative_to(ROOT)} {path.stat().st_size} bytes")
