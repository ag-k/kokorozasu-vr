# アプリのアイコン（PWA・Quest のライブラリ用）を作る
# 夜の海に月と小舟、中央に「志」。python tools/make_icons.py
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons')
FONT = r'C:\Windows\Fonts\yumindb.ttf'


def draw(size, maskable=False):
    S = size * 4  # 大きく描いて縮める（なめらかに）
    im = Image.new('RGB', (S, S), (13, 18, 22))
    d = ImageDraw.Draw(im)
    # 夜空から海へのグラデーション
    for y in range(S):
        t = y / S
        c = (int(18 + 10 * t), int(28 + 22 * t), int(40 + 30 * t)) if t < 0.62 else (int(16 + 8 * (t - 0.62)), int(44 + 10 * (t - 0.62)), int(62 + 12 * (t - 0.62)))
        d.line([(0, y), (S, y)], fill=c)
    # 月
    mx, my, mr = S * 0.72, S * 0.24, S * 0.085
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(239, 226, 190))
    # 波の筋
    for k in range(5):
        y = S * (0.7 + k * 0.055)
        pts = [(x, y + math.sin(x / S * 18 + k) * S * 0.006) for x in range(0, S + 1, max(1, S // 80))]
        d.line(pts, fill=(120, 160, 175), width=max(1, S // 220))
    # 小舟
    bx, by = S * 0.5, S * 0.75
    d.polygon([(bx - S * 0.16, by), (bx + S * 0.17, by), (bx + S * 0.12, by + S * 0.04), (bx - S * 0.12, by + S * 0.04)], fill=(30, 22, 16))
    d.line([(bx - S * 0.02, by), (bx - S * 0.02, by - S * 0.13)], fill=(30, 22, 16), width=max(2, S // 120))
    d.polygon([(bx - S * 0.015, by - S * 0.125), (bx + S * 0.08, by - S * 0.04), (bx - S * 0.015, by - S * 0.03)], fill=(203, 185, 145))
    # 志
    f = ImageFont.truetype(FONT, int(S * (0.34 if maskable else 0.4)))
    text = '志'
    tb = d.textbbox((0, 0), text, font=f)
    tx = (S - (tb[2] - tb[0])) / 2 - tb[0]
    ty = S * 0.37 - (tb[3] - tb[1]) / 2 - tb[1]
    d.text((tx, ty), text, font=f, fill=(230, 196, 110))
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for s in (192, 512):
    draw(s).save(os.path.join(OUT, f'icon-{s}.png'))
draw(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('ok')
