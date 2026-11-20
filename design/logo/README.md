# 血染钟楼 Online 的 logo

2026-11-20 用户选了方向 B「标签里的钟楼」：游戏界面那种右边斜切的标签里挖出一座钟楼，钟面是一点红。
（另外两个没选的方向 A 围坐、C 门缝在 `concepts/`。）

## 文件

| 文件 | 用在哪 |
|---|---|
| `symbol.svg` | 图形，浅色底（墨色标签、红钟） |
| `symbol-on-dark.svg` | 图形，深色底（纸白标签、红钟）——官网顶栏、页脚用的就是它 |
| `symbol-small.svg` / `symbol-small-on-dark.svg` | 小尺寸版（32 px 以下）：去掉小门、塔身加宽、钟面放大 |
| `symbol-black.svg` / `symbol-white.svg` / `symbol-mono-c63d2a.svg` | 单色版（印章、刺绣、只能用一种颜色的地方） |
| `lockup-zh.svg` / `lockup-zh-on-dark.svg` | 横版组合：图形 + 「血染钟楼」+ ONLINE |
| `lockup-en.svg` / `lockup-en-on-dark.svg` | 横版组合：图形 + Blood on the Clocktower + ONLINE |
| `favicon-tile.svg`、`web/` | 浏览器标签图标（墨色圆角底块 + 小尺寸版）、favicon.ico、手机桌面图标、PWA 图标 |
| `og-zh.png` / `og-en.png` | 分享卡片 1200×630（官网 og:image） |

全部由 `python design/logo/build.py` 生成（字转成了轮廓，不依赖字体）；单色版和网页图标用 logo-design skill 的
`export_variants.py` / `render_png.py` 出（命令见 build.py 开头）。官网用的拷在 `site/` 和 `site/media/brand/`，
游戏用的拷在 `client/public/`。

## 颜色

| | HEX | 用途 |
|---|---|---|
| 墨 | `#0e1010` | 浅色底上的标签和字；深色底 |
| 纸白 | `#f4f4f0` | 深色底上的标签和字 |
| 血红 | `#c63d2a` | 只给钟面和 ONLINE；不要把整个标志涂红 |

## 字

「血染钟楼」和英文名：Noto Serif SC Black（900）；ONLINE：Barlow Condensed Bold（700），字距 0.42 em。
两款都是 SIL OFL 授权，允许用在 logo 里。

## 规矩

- 留白：四周至少留出钟面直径那么宽（约图形高度的 1/6）。
- 最小尺寸：图形 24 px（屏幕）/ 8 mm（印刷）；再小用 `symbol-small`。横版组合最小 120 px 宽。
- 不要：拉伸变形、改斜边方向、给标签加描边或阴影、把钟面换成别的颜色、把官方 Blood on the Clocktower 的标志或字体放进来。
- 这是非官方粉丝作品的标志：旁边需要的时候写清「非官方，与 The Pandemonium Institute 无关」。
- 没有做商标检索；以后要正式用（比如上架、印周边）之前，先查一下。
