# -*- coding: utf-8 -*-
# Движок разметки: из спецификации зоны {cx,cy,r,atk} авто-генерит позиции/конусы/стрелки.
# Защита: кучный кластер у центра зоны, конусы веером наружу (покрывают все подходы).
# Атака: позиции по периметру (или со стороны atk), стрелки внутрь к зоне.
import sys, io, math, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = r'C:\Windows\Fonts\arialbd.ttf'
RED = (224, 49, 49); BLUE = (51, 120, 230); WHITE = (255, 255, 255)

def font(sz): return ImageFont.truetype(FONT_PATH, sz)

def marker(draw, x, y, num, color, r):
    draw.ellipse([x-r-2, y-r-2, x+r+2, y+r+2], fill=(0, 0, 0, 130))
    draw.ellipse([x-r, y-r, x+r, y+r], fill=color + (255,), outline=WHITE, width=4)
    f = font(int(r*1.25)); t = str(num); bb = draw.textbbox((0, 0), t, font=f)
    draw.text((x-(bb[2]-bb[0])/2-bb[0], y-(bb[3]-bb[1])/2-bb[1]), t, font=f, fill=WHITE)

def cone(draw, x, y, ang, color, length, spread=0.40):
    a = math.radians(ang)
    p2 = (x+length*math.cos(a-spread), y+length*math.sin(a-spread))
    p3 = (x+length*math.cos(a+spread), y+length*math.sin(a+spread))
    draw.polygon([(x, y), p2, p3], fill=color + (70,))
    draw.line([(x, y), p2], fill=color + (160,), width=3)
    draw.line([(x, y), p3], fill=color + (160,), width=3)

def arrow(draw, p1, p2, color, w):
    draw.line([p1, p2], fill=color + (235,), width=w)
    ang = math.atan2(p2[1]-p1[1], p2[0]-p1[0]); L = w*2.8
    for s in (-1, 1):
        b = ang + s*0.5
        draw.line([p2, (p2[0]-L*math.cos(b), p2[1]-L*math.sin(b))], fill=color + (235,), width=w)

def legend(draw, text, color):
    f = font(30); bb = draw.textbbox((0, 0), text, font=f)
    draw.rectangle([16, 16, 16+(bb[2]-bb[0])+80, 64], fill=(0, 0, 0, 180))
    draw.ellipse([28, 27, 52, 51], fill=color + (255,), outline=WHITE, width=3)
    draw.text((64, 22), text, font=f, fill=WHITE)

def layout(cx, cy, r, atk, asp):
    def pt(d, a):  # d — доля ширины; y корректируем под аспект, чтобы был визуальный круг
        ar = math.radians(a)
        return (cx + d*math.cos(ar), cy + d*math.sin(ar)*asp)
    # ЗАЩИТА: плотный кластер у центра зоны, конусы веером наружу (все подходы)
    ring = [40, 150, 215, 325]
    dpos = [(cx, cy)] + [pt(0.38*r, a) for a in ring]
    dcone = [(dpos[0][0], dpos[0][1], atk if atk is not None else 270)] + \
            [(dpos[i+1][0], dpos[i+1][1], ring[i]) for i in range(4)]
    # АТАКА: 2 кластера (3+2) близко к краю зоны, на одной стороне (рядом с точкой боя)
    base = atk if atk is not None else 215
    cA, cB = base, base + 50
    apos = [pt(1.12*r, cA-13), pt(1.12*r, cA+13), pt(1.28*r, cA),
            pt(1.12*r, cB-11), pt(1.12*r, cB+11)]
    aarr = [(pt(1.28*r, cA)[0], pt(1.28*r, cA)[1], pt(0.98*r, cA)[0], pt(0.98*r, cA)[1]),
            (pt(1.2*r, cB)[0], pt(1.2*r, cB)[1], pt(0.95*r, cB)[0], pt(0.95*r, cB)[1])]
    return dpos, dcone, apos, aarr

def render(src, pts, cones, arrows, color, label, out, W, H):
    base = Image.open(src).convert('RGBA')
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    sc = max(W, H) / 1531.0
    for c in cones: cone(d, c[0]*W, c[1]*H, c[2], color, int(210*sc))
    for a in arrows: arrow(d, (a[0]*W, a[1]*H), (a[2]*W, a[3]*H), color, max(6, int(9*sc)))
    for i, (fx, fy) in enumerate(pts, 1): marker(d, fx*W, fy*H, i, color, max(15, int(21*sc)))
    legend(d, label, color)
    Image.alpha_composite(base, layer).convert('RGB').save(out, quality=92)

def main():
    specs = json.load(open('maps_specs.json', encoding='utf-8'))
    for fname, s in specs.items():
        base = Image.open(fname); W, H = base.size
        if 'def_pos' in s:  # ручная расстановка (крыши/укрытия)
            dpos = s['def_pos']; dcone = s.get('def_cone', [])
            apos = s.get('atk_pos', []); aarr = s.get('atk_arr', [])
        else:
            dpos, dcone, apos, aarr = layout(s['cx'], s['cy'], s['r'], s.get('atk'), W/H)
        stem = fname.replace('.png', '')
        render(fname, dpos, dcone, [], BLUE, 'ЗАЩИТА: позиции + обзор', f'{stem}_защита.png', W, H)
        render(fname, apos, [], aarr, RED, 'АТАКА: позиции + маршруты', f'{stem}_атака.png', W, H)
        print('rendered', stem.encode('ascii', 'replace').decode())
    print('DONE', len(specs))

if __name__ == '__main__':
    main()
