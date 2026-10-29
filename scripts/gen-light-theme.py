"""Generate light-theme override CSS from client/src/styles.css.
For every top-level rule that is part of the reading UI (not the map / square / intro scenes),
emit html.theme-light overrides that flip dark backgrounds to paper tones and light text to ink.
Run: python -I scripts/gen-light-theme.py client/src/styles.css  (prints CSS to stdout; paste over the generated block at the end of styles.css)"""
import re
import sys

src = open(sys.argv[1], encoding='utf-8').read()
start = src.find('/* ───────── 浅色主题（自动生成')
if start >= 0:
    src = src[:start]
src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)  # 去掉注释

# 读字的界面：只在这些容器里面（以及它们自己身上）换浅色
CHROME = '.dock, .drawer, .lobby-right, .sheet-bg, .mark-menu, .vol-panel, .cs, .tut, .term-tip'
ACCENT_BG = re.compile(r'var\(--(red|mot|int|phy|psy|opt|ok|attr|c|paper|ring)\)|#[a-f0-9]{6}', re.I)

# 画面上的东西（压在地图 / 画上的字要保持深底）和动画：不换
SKIP = ['.town', '.map', '.walker', '.token', '.board-bar', '.vote-stats', '.vs-', '.sound-toggles', '.minimap', '.hud',
        '.where', '.room-strip', '.alive-strip', '.ti2', '.dm-', '.demo', '.intro', '.kill', '.scene', '.cottage', '.title-card',
        '.lobby-bg', '.hero', '.mm-sheet-btn', '.town-', '.spectator-bar', '.nom-warn', '.skillcheck', '.dawn', '.door', '.square',
        '.stage', '.spot', '.moon', '.claw', '.bolt', '.stamp', '.f-', '.lr-', '.char', '.idcard', '.idback', '.le-stage', '.le-marks',
        ':root', '.cs-head button', '.knock', '.mg-name', '.mg-seat', '.mg-dead', '.mg-note', '.mark-badge', '.portrait',
        '.as-', '.rs-', '.walker', '.float', '.seat', '.raised', '.whisper', '.token-', '.vc-', '.big', '.hand', '.center-box', '.sq-board div',
        '.stat', '.tut-target', '::-webkit-scrollbar', '.gallows', '.on-block', '.ob-']

def lum(r, g, b):
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

def parse_color(c):
    c = c.strip()
    m = re.fullmatch(r'#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})', c)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = ''.join(x * 2 for x in h)
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0
    m = re.fullmatch(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)', c)
    if m:
        return int(m.group(1)), int(m.group(2)), int(m.group(3)), float(m.group(4) or 1)
    return None

COLOR_RE = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)')

def flip_bg(m):
    p = parse_color(m.group(0))
    if not p:
        return m.group(0)
    r, g, b, a = p
    L = lum(r, g, b)
    if L < 0.22:  # 深色底 → 纸色
        t = min(1, L / 0.22)
        base = (248 - int(10 * t), 244 - int(10 * t), 235 - int(10 * t))
        if a >= 1:
            return '#%02x%02x%02x' % base
        return 'rgba(%d, %d, %d, %s)' % (*base, max(a, .9))
    if L > 0.75 and a < 0.5:  # 浅色半透明（悬停高亮）→ 深色半透明
        return 'rgba(40, 34, 24, %s)' % a
    return m.group(0)

def flip_fg(m):
    p = parse_color(m.group(0))
    if not p:
        return m.group(0)
    r, g, b, a = p
    L = lum(r, g, b)
    if L > 0.62:
        return '#2a2620' if L > 0.85 else '#4a463d'
    return m.group(0)

def flip_border(m):
    p = parse_color(m.group(0))
    if not p:
        return m.group(0)
    r, g, b, a = p
    if lum(r, g, b) > 0.7:
        return 'rgba(40, 34, 24, %s)' % min(1, a + .08)
    return m.group(0)

out = []
for m in re.finditer(r'(^|\n)([^@{}\n][^{}]*?)\{([^{}]*)\}', src):
    sel = m.group(2).strip()
    if not sel or sel.startswith('@') or sel.startswith('from') or sel.startswith('to') or re.match(r'^\d', sel):
        continue
    # html / body 只按标签名跳过（不然 .ri-body、.acard-body 这类类名也被当成 body 跳掉）
    if any(k in sel for k in SKIP) or re.search(r'(^|[\s,>+~])(html|body)\b', sel):
        continue
    decls = []
    body = m.group(3)
    bgm = re.search(r'background(?:-color)?\s*:\s*([^;]+)', body)
    accent_bg = bool(bgm and ACCENT_BG.search(bgm.group(1)) and not any(lum(*parse_color(c)[:3]) < 0.22 for c in COLOR_RE.findall(bgm.group(1)) if parse_color(c)))
    for d in body.split(';'):
        if ':' not in d:
            continue
        prop, val = d.split(':', 1)
        prop = prop.strip(); val = val.strip()
        if prop in ('background', 'background-color'):
            v = val
            v = v.replace('var(--panel)', 'var(--lt-panel)').replace('var(--ink)', 'var(--lt-bg)')
            v2 = COLOR_RE.sub(flip_bg, v)
            if v2 != val:
                decls.append(f'{prop}: {v2}')
        elif prop == 'color' and not accent_bg:
            v = val.replace('var(--paper)', 'var(--lt-strong)').replace('var(--cream)', 'var(--lt-text)').replace('var(--opt-hi)', 'var(--lt-strong)').replace('var(--muted)', 'var(--lt-muted)')
            v2 = COLOR_RE.sub(flip_fg, v)
            if v2 != val:
                decls.append(f'{prop}: {v2}')
        elif prop.startswith('border') and prop != 'border-radius':
            v2 = COLOR_RE.sub(flip_border, val)
            if v2 != val:
                decls.append(f'{prop}: {v2}')
        elif prop == 'box-shadow' and re.search(r'rgba\(0, 0, 0', val):
            decls.append('box-shadow: 0 10px 30px rgba(40, 34, 24, .18)')
    if decls:
        parts = []
        for x in sel.split(','):
            x = x.strip()
            parts.append(f'html.theme-light :where({CHROME}) {x}')
            if '::' not in x and ':hover' not in x:
                parts.append(f'html.theme-light {x}:where({CHROME})')
        sels = ', '.join(parts)
        out.append(f'{sels} {{ {"; ".join(decls)}; }}')

print('\n'.join(out))
