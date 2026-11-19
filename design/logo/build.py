"""血染钟楼 Online 的 logo（2026-11-20 用户选了方向 B「标签里的钟楼」）。

游戏界面那种斜切标签（右边斜下）里挖出一座钟楼：尖顶 60°、塔身通到底边，塔底一扇小拱门，钟面是一点红。
配色：墨 #0e1010、纸白 #f4f4f0、血红 #c63d2a。深色底用纸白标签，浅色底用墨色标签，钟面永远是红的。
字：Noto Serif SC 900（「血染钟楼」、英文名）和 Barlow Condensed 700（ONLINE），都是 OFL 授权、可以做 logo；
这里把字转成轮廓（不依赖字体），字体文件取自 node_modules/@fontsource。

跑法（在仓库根目录）：python design/logo/build.py
生成 design/logo/ 下的 SVG，再用 logo-design skill 的 export_variants.py 出单色版和网页图标（见 README.md）。
"""
import math
import os
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FS = None
for base in (ROOT, os.path.join(ROOT, '..', '..', '..')):  # 工作树里 node_modules 在主目录
    p = os.path.join(base, 'node_modules', '@fontsource')
    if os.path.isdir(p):
        FS = p
        break
if not FS:
    sys.exit('找不到 node_modules/@fontsource')

INK, PAPER, RED = '#0e1010', '#f4f4f0', '#c63d2a'


def font(rel):
    return TTFont(os.path.join(FS, rel))


SERIF_ZH = font('noto-serif-sc/files/noto-serif-sc-chinese-simplified-900-normal.woff2')
SERIF_LAT = font('noto-serif-sc/files/noto-serif-sc-latin-900-normal.woff2')
SERIF_ZH_400 = font('noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff2')
SERIF_LAT_400 = font('noto-serif-sc/files/noto-serif-sc-latin-400-normal.woff2')
COND = font('barlow-condensed/files/barlow-condensed-latin-700-normal.woff2')


def text_path(text, size, x, y, fonts, tracking=0.0):
    """一行字 → SVG path d（基线在 y）。fonts 按顺序找字形；tracking 是字距（em 的倍数）。返回 (d, 宽度)。"""
    d = []
    pen_x = x
    for ch in text:
        f = next((f for f in fonts if ord(ch) in f.getBestCmap()), fonts[0])
        upm = f['head'].unitsPerEm
        s = size / upm
        gname = f.getBestCmap()[ord(ch)]
        gs = f.getGlyphSet()
        sp = SVGPathPen(gs)
        gs[gname].draw(TransformPen(sp, (s, 0, 0, -s, pen_x, y)))
        d.append(sp.getCommands())
        pen_x += gs[gname].width * s + tracking * size
    return ' '.join(d), pen_x - x - tracking * size


# ── 图形 ──
def symbol_paths(small=False, ox=0.0, oy=0.0, k=1.0):
    """返回 (标签（含塔形镂空）, 门, 钟心圆) 三段 path d；坐标在 256 画布上，再按 k 缩放、平移 ox/oy。"""
    def P(x, y):
        return f'{ox + x * k:.2f} {oy + y * k:.2f}'
    cx = 122.0  # 标签右边斜收，视觉中心比几何中心偏左
    tag = f'M{P(30, 40)}H{ox + 226 * k:.2f}L{P(202, 216)}H{ox + 30 * k:.2f}Z'
    if small:
        hw, apex, shoulder, clock_r, clock_y = 36.0, 52.0, 52.0 + 36.0 * math.tan(math.radians(60)), 19.0, 140.0
    else:
        hw, apex, shoulder, clock_r, clock_y = 48 / math.tan(math.radians(60)), 50.0, 98.0, 14.0, 124.0
    tower = f'M{P(cx, apex)}L{P(cx + hw, shoulder)}V{oy + 216 * k:.2f}H{ox + (cx - hw) * k:.2f}V{oy + shoulder * k:.2f}Z'
    door = '' if small else f'M{P(cx - 9, 216)}v{-26 * k:.2f}a{9 * k:.2f} {9 * k:.2f} 0 0 1 {18 * k:.2f} 0v{26 * k:.2f}z'
    clock = f'M{P(cx - clock_r, clock_y)}a{clock_r * k:.2f} {clock_r * k:.2f} 0 1 0 {2 * clock_r * k:.2f} 0a{clock_r * k:.2f} {clock_r * k:.2f} 0 1 0 {-2 * clock_r * k:.2f} 0z'
    return tag + tower, door, clock


def symbol_svg(tag_fill, clock_fill, small=False, title='血染钟楼 Online'):
    t, door, clock = symbol_paths(small)
    body = f'<path fill="{tag_fill}" fill-rule="evenodd" d="{t}"/>'
    if door:
        body += f'<path fill="{tag_fill}" d="{door}"/>'
    body += f'<path fill="{clock_fill}" d="{clock}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>{title}</title>{body}</svg>\n'


def symbol_group(tag_fill, clock_fill, ox, oy, k):
    t, door, clock = symbol_paths(False, ox, oy, k)
    return (f'<path fill="{tag_fill}" fill-rule="evenodd" d="{t}"/><path fill="{tag_fill}" d="{door}"/>'
            f'<path fill="{clock_fill}" d="{clock}"/>')


# ── 横版组合：图形 + 字 ──
def lockup(lang, fg, accent):
    # 图形占 256×256 的 40..216 那一段（高 176）；字的大小按图形高度定
    parts = [symbol_group(fg, RED, 0, 0, 1)]
    x0 = 252
    if lang == 'zh':
        d, w = text_path('血染钟楼', 122, x0, 160, [SERIF_ZH, SERIF_LAT], tracking=0.04)
        parts.append(f'<path fill="{fg}" d="{d}"/>')
        d2, w2 = text_path('ONLINE', 38, x0 + 4, 212, [COND], tracking=0.42)
        parts.append(f'<path fill="{accent}" d="{d2}"/>')
        width = x0 + max(w, w2) + 8
    else:
        d1, w1 = text_path('Blood on the', 46, x0, 82, [SERIF_LAT], tracking=0.01)
        d, w = text_path('Clocktower', 92, x0 - 2, 176, [SERIF_LAT], tracking=0.0)
        d2, w2 = text_path('ONLINE', 34, x0 + 2, 214, [COND], tracking=0.42)
        parts += [f'<path fill="{fg}" d="{d1}"/>', f'<path fill="{fg}" d="{d}"/>', f'<path fill="{accent}" d="{d2}"/>']
        width = x0 + max(w, w1, w2) + 8
    title = '血染钟楼 Online' if lang == 'zh' else 'Blood on the Clocktower Online'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} 256"><title>{title}</title>{"".join(parts)}</svg>\n'


# ── 分享卡片（1200×630，深色底）──
def og_card(lang):
    tagline = ('在 Discord 里开一局血染钟楼 · AI 说书人 · 17 个剧本' if lang == 'zh'
               else 'Play Blood on the Clocktower in Discord · AI Storyteller · 17 scripts')
    lk = lockup(lang, PAPER, RED)
    inner = lk[lk.index('<path'):lk.rindex('</svg>')]
    w = float(lk.split('viewBox="0 0 ')[1].split(' ')[0])
    k = 1.25
    ox = (1200 - w * k) / 2
    oy = 150
    d, tw = text_path(tagline, 30 if lang == 'zh' else 28, 0, 0, [SERIF_ZH_400, SERIF_LAT_400] if lang == 'zh' else [SERIF_LAT_400, SERIF_ZH_400])
    tx = (1200 - tw) / 2
    note, nw = text_path('rambooo.com/botc' + ('/en' if lang == 'en' else ''), 22, 0, 0, [COND], tracking=0.12)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">'
            f'<rect width="1200" height="630" fill="{INK}"/>'
            f'<rect x="0" y="606" width="1200" height="24" fill="{RED}"/>'
            f'<g transform="translate({ox:.1f} {oy}) scale({k})">{inner}</g>'
            f'<path fill="#aca799" transform="translate({tx:.1f} 500)" d="{d}"/>'
            f'<path fill="#6f6b62" transform="translate({(1200 - nw) / 2:.1f} 560)" d="{note}"/>'
            '</svg>\n')


def favicon_tile():
    """浏览器标签上的小图标：墨色圆角底块 + 小尺寸版图形（纸白标签、红钟），浅色、深色标签栏上都看得清。"""
    t, door, clock = symbol_paths(True, 256 * 0.06, 256 * 0.07, 0.88)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>血染钟楼 Online</title>'
            f'<rect width="256" height="256" rx="44" fill="{INK}"/>'
            f'<path fill="{PAPER}" fill-rule="evenodd" d="{t}"/><path fill="{RED}" d="{clock}"/></svg>\n')


def write(name, s):
    with open(os.path.join(HERE, name), 'w', encoding='utf8') as f:
        f.write(s)
    print('写了', name)


if __name__ == '__main__':
    write('symbol.svg', symbol_svg(INK, RED))                 # 浅色底（主版本）
    write('symbol-on-dark.svg', symbol_svg(PAPER, RED))       # 深色底
    write('symbol-small.svg', symbol_svg(INK, RED, small=True))
    write('symbol-small-on-dark.svg', symbol_svg(PAPER, RED, small=True))
    write('lockup-zh.svg', lockup('zh', INK, RED))
    write('lockup-zh-on-dark.svg', lockup('zh', PAPER, RED))
    write('lockup-en.svg', lockup('en', INK, RED))
    write('lockup-en-on-dark.svg', lockup('en', PAPER, RED))
    write('og-zh.svg', og_card('zh'))
    write('og-en.svg', og_card('en'))
    write('favicon-tile.svg', favicon_tile())
