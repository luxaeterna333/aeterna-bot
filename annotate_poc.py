# -*- coding: utf-8 -*-
# v2 POC "Мясо": цифры = позиции игроков (кластерами), защита = конусы обзора, атака = стрелки движения.
import sys, io, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from PIL import Image, ImageDraw, ImageFont

SRC = 'Мясо.png'
FONT_PATH = r'C:\Windows\Fonts\arialbd.ttf'
RED = (224, 49, 49)
BLUE = (51, 120, 230)
WHITE = (255, 255, 255)

def font(sz): return ImageFont.truetype(FONT_PATH, sz)

def marker(draw, x, y, num, color, r=24):
    draw.ellipse([x-r-2, y-r-2, x+r+2, y+r+2], fill=(0, 0, 0, 130))
    draw.ellipse([x-r, y-r, x+r, y+r], fill=color + (255,), outline=WHITE, width=4)
    f = font(int(r*1.25)); t = str(num)
    bb = draw.textbbox((0, 0), t, font=f)
    draw.text((x-(bb[2]-bb[0])/2-bb[0], y-(bb[3]-bb[1])/2-bb[1]), t, font=f, fill=WHITE)

def cone(draw, x, y, ang_deg, color, length=235, spread=0.38):
    a = math.radians(ang_deg)
    p2 = (x+length*math.cos(a-spread), y+length*math.sin(a-spread))
    p3 = (x+length*math.cos(a+spread), y+length*math.sin(a+spread))
    draw.polygon([(x, y), p2, p3], fill=color + (70,))
    draw.line([(x, y), p2], fill=color + (160,), width=3)
    draw.line([(x, y), p3], fill=color + (160,), width=3)

def arrow(draw, p1, p2, color, w=10):
    draw.line([p1, p2], fill=color + (235,), width=w)
    ang = math.atan2(p2[1]-p1[1], p2[0]-p1[0]); L = 28
    for s in (-1, 1):
        b = ang + s*0.5
        draw.line([p2, (p2[0]-L*math.cos(b), p2[1]-L*math.sin(b))], fill=color + (235,), width=w)

def legend(draw, text, color):
    f = font(34); bb = draw.textbbox((0, 0), text, font=f)
    draw.rectangle([20, 20, 20+(bb[2]-bb[0])+90, 76], fill=(0, 0, 0, 175))
    draw.ellipse([32, 34, 60, 62], fill=color + (255,), outline=WHITE, width=3)
    draw.text((74, 28), text, font=f, fill=WHITE)

def render(positions, cones, arrows, color, label, out):
    base = Image.open(SRC).convert('RGBA'); W, H = base.size
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for c in cones: cone(d, c[0]*W, c[1]*H, c[2], color)
    for a in arrows: arrow(d, (a[0]*W, a[1]*H), (a[2]*W, a[3]*H), color)
    for i, (fx, fy) in enumerate(positions, 1): marker(d, fx*W, fy*H, i, color)
    legend(d, label, color)
    Image.alpha_composite(base, layer).convert('RGB').save(out, quality=92)
    print('saved', out)

# ЗАЩИТА: кластеры 2-1-2 (ДЭФ/Вышка/Конты), конусы веером НА СЕВЕР (откуда идёт атака),
# вдоль открытых направлений — не в танки (восток/запад) и не в воду (юг).
DEF_POS = [(0.44, 0.83), (0.47, 0.845), (0.36, 0.80), (0.55, 0.815), (0.575, 0.835)]
DEF_CONE = [(0.44, 0.83, 275), (0.47, 0.845, 295), (0.36, 0.80, 250), (0.55, 0.815, 315), (0.575, 0.835, 335)]

# АТАКА: позиции на стороне спавна (СЕВЕР) у краёв укрытий для пика; стрелки = маршруты.
ATK_POS = [(0.40, 0.50), (0.43, 0.52), (0.30, 0.66), (0.60, 0.60), (0.46, 0.70)]
ATK_ARR = [(0.42, 0.55, 0.46, 0.69), (0.31, 0.68, 0.42, 0.80), (0.59, 0.63, 0.52, 0.79)]

render(DEF_POS, DEF_CONE, [], BLUE, 'ЗАЩИТА: позиции + что смотреть', 'Мясо_защита.png')
render(ATK_POS, [], ATK_ARR, RED, 'АТАКА: позиции + куда идти', 'Мясо_атака.png')
print('DONE')
