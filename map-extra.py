# -*- coding: utf-8 -*-
# Карта под формат NxN: базовые позиции + (N-len) доп.
# Доп. позиции считает ИИ wellflow (текстом, по координатам базовых — vision у шлюза нет),
# фолбэк — детерминированно (кластеры рядом). Аргументы: <mapFile> <atk|def> <N> <out>.
import sys, io, json, os, math, re, urllib.request, traceback
from PIL import Image
from annotate_maps import layout, render, BLUE, RED

mapFile, side, fmt, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
isAtk = side == 'atk'
specs = json.load(open('maps_specs.json', encoding='utf-8'))
spec = specs.get(os.path.basename(mapFile))
base = Image.open(mapFile); W, H = base.size
ruName = os.path.basename(mapFile).replace('.png', '')

if spec and 'def_pos' in spec:
    if isAtk:
        pos = [list(p) for p in spec.get('atk_pos', [])]; cones = []; arrows = [list(a) for a in spec.get('atk_arr', [])]
    else:
        pos = [list(p) for p in spec.get('def_pos', [])]; cones = [list(c) for c in spec.get('def_cone', [])]; arrows = []
elif spec:
    dpos, dcone, apos, aarr = layout(spec['cx'], spec['cy'], spec['r'], spec.get('atk'), W / H)
    if isAtk:
        pos = [list(p) for p in apos]; cones = []; arrows = [list(a) for a in aarr]
    else:
        pos = [list(p) for p in dpos]; cones = [list(c) for c in dcone]; arrows = []
else:
    pos, cones, arrows = [], [], []

need = fmt - len(pos)
src = 'base'

# --- ИИ-дорисовка (текстом) ---
if need > 0:
    key = os.environ.get('WELLFLOW_API_KEY')
    model = os.environ.get('WELLFLOW_MODEL_HEAVY', 'claude-sonnet-4.6')
    if key:
        base_txt = ', '.join(f'({p[0]:.2f},{p[1]:.2f})' for p in pos)
        logic = ('атака — у края зоны со стороны захода, из укрытий/высоты, НЕ внутри зоны'
                 if isAtk else 'защита — у зоны/на крышах/укрытиях, обзор (конус) наружу')
        prompt = (
            f'Ты тактик ВЗП GTA5RP. Карта "{ruName}", сторона {"атака" if isAtk else "защита"}. '
            f'Координаты — доли ширины/высоты снимка (0..1), (0,0) — левый верх. '
            f'Базовые позиции игроков: {base_txt}. Зона боя примерно в центре этих точек. '
            f'Добавь {need} НОВЫХ позиций. Логика: {logic}. Приоритет: рельеф(право/лево-пик)>пик>закрытость. '
            f'Ставь рядом с базовыми кластерами (2-3), НЕ растягивай и не дублируй. '
            f'Верни ТОЛЬКО JSON: {{"extra":[{{"x":0.50,"y":0.50{"" if isAtk else chr(44)+chr(34)+"cone"+chr(34)+":270"}}}]}}'
        )
        payload = json.dumps({'model': model, 'max_tokens': 400, 'temperature': 0.4,
                              'messages': [{'role': 'user', 'content': prompt}]}).encode()
        try:
            req = urllib.request.Request('https://api.wellflow.dev/v1/chat/completions', data=payload,
                                         headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
            resp = json.loads(urllib.request.urlopen(req, timeout=45).read())
            txt = resp['choices'][0]['message']['content']
            m = re.search(r'\{[\s\S]*\}', txt)
            data = json.loads(m.group(0) if m else txt)
            for e in (data.get('extra') or [])[:need]:
                if isinstance(e.get('x'), (int, float)) and isinstance(e.get('y'), (int, float)):
                    x = min(0.97, max(0.03, float(e['x']))); y = min(0.97, max(0.03, float(e['y'])))
                    pos.append([x, y])
                    if not isAtk:
                        cones.append([x, y, e['cone'] if isinstance(e.get('cone'), (int, float)) else 270])
            if len(pos) >= fmt:
                src = 'ai'
        except Exception:
            sys.stderr.write(traceback.format_exc())

# --- Детерминированный фолбэк на недостающие ---
remaining = fmt - len(pos)
if remaining > 0 and pos:
    cx = sum(p[0] for p in pos) / len(pos); cy = sum(p[1] for p in pos) / len(pos)
    for k in range(remaining):
        bp = pos[k % len(pos)]; ang = k * 2.39996
        npos = [min(0.97, max(0.03, bp[0] + 0.025 * math.cos(ang))), min(0.97, max(0.03, bp[1] + 0.025 * math.sin(ang)))]
        pos.append(npos)
        if not isAtk:
            cones.append([npos[0], npos[1], math.degrees(math.atan2(npos[1] - cy, npos[0] - cx))])
    if src == 'base':
        src = 'fallback'

color = RED if isAtk else BLUE
label = ('АТАКА' if isAtk else 'ЗАЩИТА') + f': {len(pos)} поз. ({fmt}x{fmt})'
render(mapFile, pos, cones, arrows, color, label, out, W, H)
print('OK', out, 'positions', len(pos), 'source', src)
