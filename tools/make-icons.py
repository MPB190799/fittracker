# Erzeugt die App-Symbole (icon-180/192/512.png): goldener 8-Strahl-Kompass in Lünette auf Dunkel.
# Lauf: python3 tools/make-icons.py   (braucht Pillow)
from PIL import Image, ImageDraw, ImageFilter
import math
def render(size):
    S = size * 4; c = S / 2
    grad = Image.radial_gradient('L').resize((S, S))
    bg = Image.composite(Image.new('RGB', (S, S), '#080810'), Image.new('RGB', (S, S), '#171730'),
                         grad.point(lambda v: min(255, int(v * 1.15))))
    d = ImageDraw.Draw(bg)
    R = S * 0.40
    d.ellipse([c - R, c - R, c + R, c + R], outline=(78, 68, 40), width=max(2, S // 230))
    for i in range(48):
        a = math.radians(i * 7.5); major = i % 6 == 0
        r1 = R + S * (0.03 if major else 0.018); r2 = R + S * 0.004
        col = (212, 175, 55) if i == 0 else ((120, 106, 70) if major else (62, 58, 50))
        d.line([(c + r1 * math.sin(a), c - r1 * math.cos(a)), (c + r2 * math.sin(a), c - r2 * math.cos(a))],
               fill=col, width=max(2, S // (160 if major else 300)))
    pts = []
    for i in range(16):
        a = math.radians(-90 + i * 22.5); r = (14 if i % 4 == 0 else (8.5 if i % 2 == 0 else 3.6)) * S * 0.62 / 28
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
    mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).polygon(pts, fill=255)
    metal = Image.new('RGB', (S, S)); md = ImageDraw.Draw(metal)
    for y in range(S):
        t = y / S
        if t < 0.45: k = t / 0.45; a_, b_ = (236, 210, 122), (212, 175, 55)
        else: k = (t - 0.45) / 0.55; a_, b_ = (212, 175, 55), (168, 134, 42)
        md.line([(0, y), (S, y)], fill=tuple(int(x + (z - x) * k) for x, z in zip(a_, b_)))
    glow = mask.filter(ImageFilter.GaussianBlur(S * 0.03)).point(lambda v: int(v * 0.35))
    bg = Image.composite(Image.new('RGB', (S, S), (212, 175, 55)), bg, glow)
    bg = Image.composite(metal, bg, mask)
    r = S * 0.022; ImageDraw.Draw(bg).ellipse([c - r, c - r, c + r, c + r], fill='#080810')
    return bg.resize((size, size), Image.LANCZOS)
if __name__ == "__main__":
    for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'icon-180.png')]:
        render(size).save(name)
    print("Icons erzeugt")
