# 梦殒春宵小镇 · 美术评审（第 1 轮）和返工单

审查方：Elorian，2026-10-31，两轮对账。对比：第一版小镇 vs 黯月初升、暗流涌动、极乐迪斯科官方图（`design/refs/de/`）。

**结论：这版不能上线。** 布局、门、路、进屋都没问题，问题在光、色、边缘和几件东西的画法。

## 对账结果

| 项 | 用户意见 | 结果 |
|---|---|---|
| 帐篷入口 | 要有游乐场灯光、欢迎人进来 | 成立。大帐和小棚的亮灯版只变了 154 和 55 个像素 |
| 右下角 | 有两处很怪 | 成立，是**断塔**和**东南红白小帐篷**。断塔是一片朝向不对的薄墙，读不出塔；小帐篷太新太欢快，像能进。地窖贴着遗迹不是问题，帐篷没路也不是问题 |
| 地图边缘 | 没有往外扩散渐隐 | 成立。现在是直边，距边 6 像素处明度约 100–120，再往外就是背景 |
| 杂色 | 太多 | 成立，但病因是饱和度过载、明度太平、细节太匀，不是色相太杂 |
| 极乐迪斯科 | 不够 | 成立。原作是大块冷暗面加小而烫的光池，这版处处同亮、处处同细 |

撤回的判断：Elorian 第一轮说「不能进的遗迹在发光」「路网断头」，前提是我给错了材料。地窖能进，火光合法；旧帐篷和摊位不能进，没路是对的。它第二轮说「酒馆没亮窗」不准确：亮了，但太弱，看不出来，所以四间房的亮窗也要加强。

## 新加的规矩

- **能进 = 绷紧、鲜艳、暖轮廓光，有光；不能进 = 塌陷、褪色、冷轮廓、封门，无光。**
- 不能进的东西没有路，这是对的。
- 地图边缘必须是不规则侵蚀，往外渐隐成黑，不能是直边。

## 数值目标

| 指标（地形内） | 这版 | 目标 |
|---|---|---|
| 饱和度均值 | 0.45 | 0.24–0.30 |
| 饱和度 > 0.45 的像素 | 51% | ≤ 15% |
| 亮度中位数 | 0.37 | 0.30–0.34 |
| 局部对比变异系数 | 0.33 | ≥ 0.55 |
| 明度 < 0.12 的暗部 | 太少 | ≥ 12% |
| 轮廓周长 / 凸包周长 | 1.48 | ≥ 2.5 |
| 距边 6 像素（1910 宽缩略图）明度，0–255 | 100–120 | ≤ 60 |

配色比例：暮色草土（70–90°，S ≤ 0.22，V 0.25–0.45）约 55%；石板路（35–45°，S ≤ 0.18）约 10%；紫色暗部（250–265°，东南 240–250°，V 0.10–0.20）≥ 12%；马戏红（10–20°，S 0.55–0.65）≤ 12%，只给能进的大帐和小棚；紫罗兰（270–285°）≤ 8%，集中在花园；入口灯光（38–48°，V 0.90–1.00）≤ 3%，只给能进的建筑。

## 返工单（给 Codex）

**布局已按用户确认改过，`design\guides\snv-town-guide.png` 是新底稿，以它为准。** 变动：钟表铺搬到 (1590, 880)，小路改道；宏伟遗迹往北 30；断塔到 (1890, 1270)；一堆碎石和一棵枯树让位；新增旋转木马、乐台、舞池。其他东西不动。房子图的画布尺寸和透明通道不变。不用从头生成构图，在现有成品上改。输出到 `outputs\snv-v2\`，不覆盖 `outputs\snv\`，不写进项目目录。

1. **底图 `town-base.webp`（7640×4160）**：先把上面这些变动画进去（钟表铺旧地基改成舞池，新位置留空地），再按下面的提示词 1 全图重绘光、色、笔触，最后全图对照新底稿检查。提示词里的 30–60 像素是 1910 宽时的尺寸，在 7640 宽上是 120–240 像素。
2. **喷泉**：底图和两张广场都按提示词 3 重画。玩家以这里为集合点，0.5 倍下必须一眼认出是喷泉。
3. **六间房子的 closed、closed-lit、open 和 `house-crypt-open.png`**：跟底图做同一套调色，放上去不能像贴上去的。透明通道不变。地窖的火光收在下沉庭院里，不要打到后面的台基和柱身。
3a. **绝望的狂欢**：背景和每样东西的位置见 `design\snv-map\README.md` 的「我们补的背景」。旋转木马和乐台是不能进的旧物，按旧帐篷的规矩画，不亮灯。舞池、面具、乐谱、鞋、断灯串都是贴地的东西，人能踩过去，不要画高。
3b. **疏密**：现在该空的地方没东西，该密的地方又到处是碎花。全图分成两种地方：
   - **密集区只有六处**：花园宴席、酒馆门口、大帐门前、旋转木马、舞池、地窖入口。细节和故事都放这里。
   - **其余都是安静区**：北边空地、西边黄土地、东边草地、花园四块草坪、东南荒地。用大块方向性笔触和统一色调，删掉零散的小花、黄绿草斑和杂点，只留一两件有意思的小东西。花只开在底稿画了花圃的地方。
4. **亮窗**：酒馆、画室、钟表铺、花房的 closed-lit 现在太弱。窗玻璃要接近灯芯亮度，并有向外的暖色光晕，0.5 倍下一眼看得出来。
5. **大帐和杂耍小棚的 `closed-lit`**：按提示词 2 把灯画进这两张 PNG（游戏只读这张图，没有单独的灯光层）。closed 版不加灯。
6. **`square-day-snv.webp`、`square-night-snv.webp`**：同样降饱和、压明度、拉开疏密，昼夜仍要对齐。
7. 交付 `align-check.png`、`houses-sheet.png`、0.5 倍和 0.25 倍全图各一张，以及上面数值表的实测结果。达不到的项直接写明。

### 提示词 1：底图

> Repaint this isometric game map to match the attached layout guide exactly: same camera, positions and scale for every building, tent, ruin, tree, path and prop in the guide; add nothing tall that is not in the guide. Mood: a desperate carnival on its seventh sleepless night, joy gone feverish, the party still going because nobody dares to stop. Only large quiet areas plus a few dense story spots: keep ground outside the story spots as broad unified brushwork with no scattered small flowers or specks. Global grade: late-summer dusk into violet hour; push midtones down, target median value about 0.30 to 0.34, crush shadows into saturated violet at hue 250 to 265 degrees, desaturate ground, grass, stone and canvas so almost nothing exceeds 0.45 saturation; keep the violet flower beds saturated but confined to the central square; build large dark value masses and strong light-dark grouping so the map reads at half size; painterly directional brushwork with broad confident strokes and lost edges on ground, grass and cloth, crisp detail only on the fountain and landmarks; long soft directional shadows from the upper left. Map border: replace the hard diamond cutoff with an irregular eroded edge, ruin stones and broken columns eating the southeast edge, tent pegs and frayed rope eating the camp edge, flower-bed stones and tree roots eating the flower-street edge; fade the outer 30 to 60 pixels of terrain toward black with hue shifting to deep violet, feathered like ink-wash brush fades, center stays crisp. Southeast corner: turn cold and gloomy, cool violet-blue ambient on stone and grass with shadow hue 240 to 250 degrees, a darker ground value band than the rest of the map, no warm light at all on the colonnade shafts or the ruined tower. Ruined tower, the thin jagged slab at the southeast: redraw in the same position and footprint as a real square stone tower ruin with proper wall thickness, solid corner masses, stepped plinth, a rectangular shaft aligned to the isometric axes, a three-dimensional jagged broken top showing interior wall thickness, same stone family as the ruins but lit colder, moss and ivy at the base. Old tents and wagons, namely the red-white tent by the ruins, the green-striped tent at the east tip, the two tents at the north camp, the tent and covered wagon at the west and the two market stalls: render them clearly abandoned and un-enterable, faded chalky canvas with saturation under 0.25, reds faded to dusty rust-grey and whites to weathered bone, sagging deflated cloth, a bent or leaning pole each, slack or snapped guy ropes, torn patched hems, weeds and vines through the base, dirt and moss streaks under every eave, entrances tied shut or collapsed inward, no lamps, flags torn or removed, shapes and positions unchanged. The tent by the ruins sits in cold shadow, value under 0.3. No text, no letters, no logos, no watermarks.

### 提示词 2：入口灯（大帐、杂耍小棚的 closed-lit）

用户要的是游乐场入口的欢迎感，所以比 Elorian 原稿多一道灯泡门头，灯泡在琥珀色里混入暖红。彩灯只准出现在这两张图上。

> Edit this transparent isometric tent sprite into its lit, open-for-business version, keeping the tent silhouette, position, canvas size and existing alpha unchanged except where lights extend it. It must feel like the entrance of a night funfair inviting you in: a marquee arch of closely spaced glowing bulbs framing the entrance, alternating warm amber and warm red, with no sign board, no letters and no text of any kind; festoon strings of big amber bulbs swagged along the entrance eave and around the whole eave line; two lamp posts with amber lantern panes flanking the doorway; the door flaps pulled open with warm orange light pouring from inside, brightest at the gap, warm rim light on the flap edges; an elliptical warm pool of light on the ground in front of the entrance. Bulb cores near maximum value with soft round halos three to four times the bulb diameter, spaced widely enough that every bulb still reads at 50 percent zoom, feathered falloff, no hard circles; shadows around the lights stay deep. The rest of the canvas stays as it is, not brighter.

大帐的灯泡芯直径在原图上不小于 12 像素，小棚同一套缩小版。

### 提示词 3：喷泉（底图和两张广场）

水用蓝青色，用户已确认，取代原需求里的淡紫色。花从柱身撤到池沿，顶上不再开花。

> Redraw only the central fountain; keep its exact position, the paved circle, paths, benches, flower arches and side trellises unchanged; no text. Build a tall classic tiered fountain: three stepped circular stone plinth rings, a wide shallow basin about one third of the paved circle's diameter, a thick stone column with a clear capital, an upper bowl, and a bright white vertical water jet from the top plus four arched streams falling from the bowl into the basin. Move the climbing flowers off the column onto the basin rim so the column reads as bare stone. Stone slightly cooler and lighter than the paving with a dark rim shadow line under the basin edge; water in saturated blue-cyan at hue 190 to 200 degrees with a white foam ring; water jet near-white. Total height about 1.6 times the surrounding bushes so the spire silhouettes against the grass. Keep dusk lighting; water may glow faintly cool blue, no amber.

## 验收

- 上表数值全部达标，用同一算法测。
- 0.5 倍和 0.25 倍看：大帐和小棚入口一眼是亮着、欢迎人进去；四间房的亮窗和地窖火光读作能进；没有任何旧帐篷、遗迹、断塔像能进。
- 0.5 倍下一眼认出中间是喷泉：浅水盘、深色池沿、白色水柱、蓝色水面。
- 断塔读作塔，在等距轴上。东南角明显更冷更暗。
- 密集区和安静区一眼分得开，安静区没有零散碎花和杂点。看得出庆典在硬撑：空位上的紫罗兰、停转的木马、没人的乐台、通向地窖的面具。
- 地图边缘不规则，渐隐成黑，没有直边。
- 没有任何文字。
- 位置、碰撞不变。接入游戏后门口不被挡，路对得上。

## 第二次返工（看过 v2 草稿后）

v2 草稿的喷泉、旋转木马、断塔方向对，但用户否决了配色：杂色太多，AI 感太强。实测和原因：

| 指标 | v2 草稿 | 极乐迪斯科 |
|---|---|---|
| 饱和度均值 | 0.38 | 0.15–0.21 |
| 饱和度 > 0.45 | 33% | 1–5% |
| 局部对比变异系数 | 0.39 | 0.65–0.86 |
| 色相分布 | 红橙和紫蓝品红两大片 | 约 80% 集中在一个相邻色相段 |

**上面「紫色暗部」的方案作废**，这是杂色的主要来源。极乐迪斯科的画面几乎全是带一点冷暖的灰，暗部是冷灰绿、灰青，不是饱和的紫。

**新配色（取自 `design\refs\de\` 实测）**
- 约 85%：中性灰土色。暗 `#1b1d1c #242421 #353633`，中 `#545754 #595349 #72726b`，亮 `#908d83 #a9a698 #dadddf`。
- 暗部冷色：`#35474d #1b252f`（灰青），不用紫。
- 约 10%：草地压成灰橄榄，和土色接近。
- 强调色合计不超过 5%：褪色的马戏红只在两顶能进的帐篷，琥珀灯光只在能进的入口和窗，紫罗兰只在花园的花上，喷泉蓝青只在水面。

**去 AI 感**
- 不要全图同样细。大片地面是几乎没细节的平涂，像原作的沙地，留笔触不留纹理。
- 细节只在六个密集区，其他地方敢空。
- 物体轮廓用松动的速写线，线条有断有续，屋顶和帐篷的形状略歪。
- 不要边缘发紫的轮廓光，不要处处发亮的高光，不要重复的石板和花团。

**数值目标改为**：饱和度均值 ≤ 0.24，大于 0.45 的像素 ≤ 6%，局部对比变异系数 ≥ 0.6，同一 30° 色相段集中度 ≥ 60%。

**流程**：不再一次出全图。先出一张小样（花园加喷泉，约全图四分之一），用户确认风格后再做全图。全图要和底稿对齐；v2 草稿的整体位置偏了约 100 像素，乐台和旋转木马的位置也错了，不能直接用。

## 第三次：批准全镇预览

用户看过灰色小样后，要求不要压成大色块、要更有色彩和狂欢节的感觉。Codex 据此出了 `outputs\snv-v2\town-overview-preview.png`，用户批准，要求按它做全套。

- **这张预览就是风格基准。** 第二次返工的数值目标作废。新基准：饱和度均值约 0.30，大于 0.45 的像素约 15%，亮度中位数约 0.33，各 ±0.04。
- **预览没有和底稿对齐**：物体从中心向外放大约 1.2 倍，且不均匀。位置以底稿为准。先用控制点把预览变形对齐到底稿，再分块高清重绘。
- **七块浅色空地是底稿占位**，成品里要画成周围的地面，不能留浅色方块和虚线边。

控制点变形试过，四周严重拉丝，已放弃。用户改定做法：**整张等比例缩小，再补全缺的边缘**，只有个别物体局部挪位。另外两条：
- 比预览多一点庆典的感觉和颜色：横跨路面的彩旗、花环、帐篷上的彩绸，用成条成串的大形状，不用碎点。
- 去 AI 味：地面现在像迷彩的碎色块要去掉，改成长而顺的方向性笔触和大块色面。

分块重绘也失败了：接缝穿过喷泉造成重影，上半部的分块整体往上偏，颜色明显比预览艳。所以底图改为本机合成，不用分块成品当主体：
1. 预览按 0.804 等比缩放，只加一层很平滑的局部校正（最大位移约 65 个底稿像素），去掉不可靠的树和断塔控制点。控制点残差中位数约 7 个底稿像素，最大约 28。
2. 分块成品只用来补预览画框以外的地图四角，调色后再接入。
3. 七块空地用周围地面填平。
4. 安静地面做 Kuwahara 平滑、沿等距轴的短笔触和方向性纹理，这一步去掉了碎色块。
5. 彩旗串是程序画的，挂在旗杆、拱门和屋顶之间，避开房子占地。
