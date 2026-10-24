# 血染钟楼 · 美术需求（交给 Codex 生成）

一共三批图：**22 张能力牌插画 + 1 张卡背**、**18 张可选人物头像**、**2 张小屋场景**（可选）。
风格整体参考《极乐迪斯科》（Disco Elysium），但**画的都是原创内容**：不要画原作里的任何人物、不要出现原作的文字、标志或 UI。

---

## 一、交付规格（三批通用）

| 批次 | 尺寸（像素） | 比例 | 文件 | 放到 |
|---|---|---|---|---|
| 角色技能卡 | 720 × 1000 | 竖幅 18:25 | `<角色id>.webp` | `botc-bot/client/src/assets/art/roles/` |
| 卡背 | 720 × 1000 | 同上 | `_back.webp` | 同上 |
| 人物头像 | 576 × 800 | 竖幅 18:25 | `<人物id>.webp` | `botc-bot/client/src/assets/art/people/` |
| 小屋场景 | 1600 × 1200 | 4:3 | `cottage-night.webp`、`cottage-dawn.webp` | `botc-bot/client/src/assets/art/scenes/` |

- 格式：WebP，质量 85 左右；单张控制在 300KB 以内（人物头像 150KB 以内）。
- **画面里不要有任何文字、数字、字母、签名、水印、边框**（名字和边框由程序叠加）。
- 文件名必须和下面表格里的 id 完全一致（全小写英文）。程序在构建时扫描这几个目录，放进去以后重新 `npm run build` 就会用上；缺的图会自动退回到代码画的占位图，所以可以一张一张地补。

---

## 二、能力牌插画（22 张 + 卡背）

**能力牌围绕能力来画。** 主体可以是角色本人（身体、手、脸的局部，像原作技能卡那样），也可以是象征物或小场景，关键是一眼能看出"这个能力在做什么"。玩家自己的长相由第三节的人物头像负责，两者不冲突。
卡面的名字条、能力说明、行动时机、提醒标记都由程序排版（可以打开 `http://localhost:3001/?preview=cards` 看版面），所以插画里不要放任何文字或框。

### 参考图

就是原作「角色属性页」里那 24 张技能卡（你发的那张 4×6 拼图）。原图在 Wiki 上，720×1000：

- 智力（灰蓝）：[Logic](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/2/29/Portrait_logic.png) · [Encyclopedia](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/7/72/Portrait_encyclopedia.png) · [Rhetoric](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/7/7b/Portrait_rhetoric.png) · [Drama](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/2/28/Portrait_drama_rank1.png) · [Conceptualization](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/7/74/Portrait_conceptualization_rank1.png) · [Visual Calculus](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/f/f2/Portrait_visual-calculus_rank1.png)
- 精神（淡紫）：[Volition](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/8/83/Portrait_volition.png) · [Inland Empire](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/2/28/Portrait_inland-empire.png) · [Empathy](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/9/95/Portrait_empathy.png) · [Authority](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/4/43/Portrait_authority.png) · [Esprit de Corps](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/7/72/Portrait_esprit-de-Corps.png) · [Suggestion](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/e/e5/Portrait_suggestion.png)
- 体格（深红）：[Endurance](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/0/03/Portrait_endurance.png) · [Pain Threshold](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/7/75/Portrait_pain-threshold.png) · [Physical Instrument](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/e/ea/Portrait_physical-instrument.png) · [Electrochemistry](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/f/f9/Portrait_electrochemistry.png) · [Shivers](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/2/2d/Portrait_shivers.png) · [Half Light](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/a/a0/Portrait_half-light.png)
- 运动（赭黄）：[Hand/Eye Coordination](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/5/50/Portrait_he_coordination.png) · [Perception](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/5/56/Portrait_perception.png) · [Reaction Speed](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/3/30/Portrait_reaction.png) · [Savoir Faire](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/8/8a/Portrait_savoir-faire.png) · [Interfacing](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/7/7d/Portrait_interfacing.png) · [Composure](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/f/ff/Portrait_composure.png)

### 统一风格（每张都要满足）

1. **表现主义油画**：粗糙、快速的大笔触，干刷、刮刀痕；形体扭曲夸张，不追求写实比例。
2. **近乎单色**：画面 70% 以上是**带颗粒和划痕的做旧黑底**，人物只用一个色系的明暗来塑造（见下面的阵营色），最多加一点点该色系的补色做点缀。
3. **主体围绕能力**：可以画角色本人（常常只画局部：脸、手、躯干），也可以画象征物；人物和物件常被裁切、从画面边缘伸进来；**没有完整的背景场景**。
4. **情绪是不安、心理化的**：画的是"这个能力给人的感觉"，不是一张说明图。
5. 四边有一圈很淡的做旧边缘（纸边磨损感），但**不要画框**。
6. 不要文字、符号字母、数字。

### 阵营色（对应原作四种属性）

| 阵营 | 对应原作 | 主色（亮部） | 中间调 | 暗部 |
|---|---|---|---|---|
| 镇民（13） | 智力 · 灰蓝 | `#9fb3c8` 冷灰蓝，可带少量 `#c9874a` 锈橙点缀 | `#4f6478` | `#11151a` |
| 外来者（4） | 精神 · 淡紫 | `#c4b5ee` 薰衣草紫 | `#6d5f9a` | `#0f0d16` |
| 爪牙（4） | 运动 · 赭黄 | `#e2b543` 赭黄 | `#8a6a1f` | `#100d06` |
| 恶魔（1） | 体格 · 深红 | `#d23c52` 深红 | `#7a1c2a` | `#12070a` |

### 通用提示词模板

> Expressionist oil painting in the style of the Disco Elysium skill cards. Rough, fast, dry-brush strokes and palette-knife scrapes, distorted anatomy. Near-monochrome: {阵营色描述}, the subject emerging from a grungy, scratched, almost-black background that fills most of the frame. Subject: {主体}. Cropped, intimate, psychological, unsettling. Faint worn paper edges. Vertical 720×1000. No text, no letters, no numbers, no frame, no watermark.

阵营色描述照抄：
- 镇民：`cold slate-blue and grey-blue tones (#9fb3c8 highlights, #4f6478 midtones), with a few small rust-orange accents`
- 外来者：`pale lavender and violet tones (#c4b5ee highlights, #6d5f9a midtones)`
- 爪牙：`ochre and mustard-yellow tones (#e2b543 highlights, #8a6a1f midtones)`
- 恶魔：`crimson and blood-red tones (#d23c52 highlights, #7a1c2a midtones)`

### 22 张牌的主体（以下是参考思路，可以加入角色本人）

| id | 角色 | 阵营 | 主体（填进 {主体}） | 中文说明 |
|---|---|---|---|---|
| `washerwoman` | 洗衣妇 | 镇民 | two shirts hanging side by side on a sagging laundry line, water dripping; only one of them bears a faint stain shaped like a badge | 晾衣绳上并排两件湿衬衫，只有一件上有块像徽章的污渍——两人之一 |
| `librarian` | 图书管理员 | 镇民 | a long card-catalogue drawer pulled open, two index cards sticking up, one of them marked with a strange crooked sigil | 拉开的卡片目录抽屉，竖起两张卡片，其中一张画着歪扭的怪符号 |
| `investigator` | 调查员 | 镇民 | a cracked magnifying glass hovering over two sets of footprints in the mud, one set darker and seeping red | 裂开的放大镜悬在泥地里两串脚印上，其中一串颜色更深、渗出红色 |
| `chef` | 厨师 | 镇民 | a long dinner table seen from above with empty chairs; some chairs are pushed together in pairs, steam rising from a single pot | 俯视一张长餐桌和空椅子，有几把椅子两两挤在一起，一口锅冒着热气 |
| `empath` | 共情者 | 镇民 | an empty chair between two candle flames that both bend inward toward it, as if leaning to listen | 一把空椅子，两侧各一支蜡烛，火苗都往中间弯，像在侧耳倾听 |
| `fortuneteller` | 占卜师 | 镇民 | a crystal ball on a draped table; inside the swirling fog two tiny distant silhouettes stand apart, and one of them casts a long horned shadow across the mist | 铺着桌布的桌上一颗水晶球，雾里站着两个很小很远的人影，其中一个在雾上投下长角的影子 |
| `undertaker` | 送葬者 | 镇民 | a plain coffin with its lid pushed slightly open, a single white lily on top, pale light leaking from the gap | 一口朴素的棺材，棺盖推开一条缝，盖上一朵白百合，缝里透出冷光 |
| `monk` | 僧侣 | 镇民 | a single small candle protected under a glass bell jar, wax dripping, the flame steady while everything around it is dark (the only rust-orange spot) | 玻璃钟罩下护着一小支蜡烛，火苗很稳，四周一片黑（画面里唯一的锈橙色） |
| `ravenkeeper` | 守鸦人 | 镇民 | a black raven perched on the edge of an open pocket watch whose hands have stopped, one feather falling | 一只乌鸦站在停了的怀表边上，一根羽毛正在落下 |
| `virgin` | 贞洁者 | 镇民 | a white lily whose stem turns into a thin silver blade, a single drop of light on its edge | 一朵白百合，花茎延伸成一道细细的银刃，刃口一点亮光 |
| `slayer` | 猎手 | 镇民 | an old flintlock pistol lying on cloth beside one single silver bullet | 布上一把老式燧发枪，旁边只有一颗银子弹 |
| `soldier` | 士兵 | 镇民 | a dented helmet and a cracked shield, a black arrow snapped in two against it | 凹陷的头盔和开裂的盾，一支黑箭撞在盾上折成两截 |
| `mayor` | 镇长 | 镇民 | a heavy chain of office lying on a velvet cushion beside a wooden ballot box with its slot taped shut | 天鹅绒垫上一条沉重的镇长链，旁边一只投票箱，投票口被封住了 |
| `butler` | 管家 | 外来者 | a silver serving tray with a small hand bell and a pair of folded white gloves, a thin leash trailing off the edge of the frame | 银托盘上一只小手铃和一副叠好的白手套，一根细牵绳从托盘拖出画面外 |
| `drunk` | 酒鬼 | 外来者 | a tipped-over bottle spilling liquid across a table; in the spreading puddle the reflection shows a completely different object — a borrowed mask | 倒下的酒瓶淌了一桌，酒渍里的倒影却是一个完全不同的东西——一张借来的面具 |
| `recluse` | 陌客 | 外来者 | a lonely lantern in thick fog at the edge of a path; the shadow it throws on the ground has horns and claws | 小路边浓雾里一盏孤零零的提灯，投在地上的影子却长着角和爪 |
| `saint` | 圣徒 | 外来者 | a thin halo lying on cold stone, cracking like glass, light leaking out of the cracks | 冰冷石板上一圈细光环，正像玻璃一样裂开，光从裂缝里漏出来 |
| `poisoner` | 投毒者 | 爪牙 | a tiny vial tipped over a full wine glass, a single drop falling and spreading into the wine | 一只小药瓶倾在斟满的酒杯上，一滴落下，在酒里晕开 |
| `spy` | 间谍 | 爪牙 | a keyhole in a dark door with light pouring through it; through the keyhole the corner of an open book of names is visible | 黑暗中一扇门的钥匙孔透出光，透过钥匙孔能看到一本摊开的名册的一角 |
| `scarletwoman` | 红唇女郎 | 爪牙 | a lipstick-smeared cracked hand mirror lying face up; in its reflection a pair of small horns is beginning to grow | 一面沾着口红印、裂开的小镜子面朝上放着，镜中的倒影里正长出一对小角 |
| `baron` | 男爵 | 爪牙 | a top hat on a table with puppet strings hanging from its brim down to two small wooden marionettes lying limp | 桌上一顶高礼帽，帽檐垂下提线，下面吊着两个瘫软的小木偶 |
| `imp` | 小恶魔 | 恶魔 | a small horned mask lying on a dark pillow, a single drop of blood beside it, a burnt-out candle in the background | 黑色枕头上一张带小角的面具，旁边一滴血，背后一支烧尽的蜡烛 |

### 卡背 `_back.webp`

> Grungy scratched almost-black canvas, centered: a faint, worn, hand-painted clock face with no numbers and the hands broken off, a thin vertical drip of crimson running down from it. Very dark, minimal, oil paint texture. Vertical 720×1000. No text.

---

## 三、可选人物头像（18 张）

玩家在大厅挑一个当自己的形象，代替 Discord 头像；在地图上、座位圈里都用它。

### 参考图

原作对话里的人物头像（369×512，Wiki 上的原图）：
[主角](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/8/83/Portrait_you.png) · [Kim](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/9/94/Portrait_kitsuragi.png) · [Klaasje](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/6/69/Portrait_klaasje.png) · [Cuno](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/d/d1/Portrait_cuno.png) · [Evrart](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/9/95/Portrait_evrart.png) · [Joyce](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/b/be/Portrait_joyce.png) · [Garte](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/c/c7/Portrait_garte.png) · [Titus](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/8/8c/Portrait_titus.png) · [Measurehead](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/4/4e/Portrait_measurehead.png) · [Lena](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/1/15/Portrait_lena.png) · [Sylvie](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/8/8a/Portrait_sylvie.png) · [Trant](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/5/57/Portrait_trant.png) · [Gary](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/d/df/Portrait_crypto.png) · [René](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/1/15/Portrait_rene.png) · [Siileng](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/2/26/Portrait_siileng.png) · [Plaisance](https://static.wikia.nocookie.net/discoelysium_gamepedia_en/images/0/0c/Portrait_plaisance.png)

**只学画法，不画这些人**：生成的 18 个人物都是原创的，长相、服装、道具都不能和原作人物相同或相似到能认出来。

### 统一风格

1. **头肩像**：头顶接近画面上沿，肩膀被下沿裁掉；人物居中或略偏，视线可以看镜头也可以侧看。
2. **棱角分明的厚涂**：脸由几块明确的色面拼成，鼻梁、颧骨、眼窝用硬边分面；笔触看得见但不脏。
3. **皮肤偏冷**：暗部带灰绿、灰蓝，受光面是暖色；眼窝和法令纹深。
4. **背景是抽象色块**：大块的几何笔刷色块或放射状条纹，取色于下面每个人的"背景色"；可以在头后面放一个浅色圆或斜条，像原作那样把人从背景里托出来。
5. 衣服概括成几大块面，用一两个道具交代身份。
6. 不要文字、徽章字母、边框、水印。

### 通用提示词模板

> Painted character portrait in the style of Disco Elysium's dialogue portraits: head-and-shoulders, angular faceted oil-painting brushwork with hard-edged planes on the face, strong light and shadow, cool grey-green shadows and warm highlights on the skin. Background of bold abstract geometric brush blocks in {背景色}. Original character: {人物}. Vertical 576×800, head near the top edge, shoulders cropped at the bottom. No text, no frame, no watermark.

### 18 个人物

| id | 名字 | 人物（填进 {人物}） | 背景色（填进 {背景色}） |
|---|---|---|---|
| `clockkeeper` | 守钟人 | an old man with a white beard and a worn flat cap, a brass key on a string around his neck, squinting with one eye | ochre and slate blue |
| `innkeeper` | 酒馆老板娘 | a sturdy middle-aged woman with a messy red bun, rolled-up sleeves and a stained apron, a rag over her shoulder, smirking | rust red and cream |
| `blacksmith` | 铁匠 | a broad-shouldered bald man with soot on his face, singed eyebrows and a leather apron, sweat on his brow | burnt orange and charcoal |
| `priest` | 神父 | a gaunt priest in a black cassock with a white collar, round wire spectacles, tired kind eyes | pale cream with a white halo circle |
| `baker` | 面包师 | a plump young man with flour on his cheeks and a white baker's cap, cheerful but nervous | warm yellow and powder blue |
| `gravedigger` | 掘墓人 | a hollow-cheeked man with a wide-brimmed hat and a long scarf, dirt under his fingernails, a shovel handle at his shoulder | moss green and grey |
| `widow` | 寡妇 | an elderly woman in a black mourning veil and pearl earrings, sharp suspicious eyes | deep violet and silver grey |
| `docker` | 码头工 | a stubbly young man in a knit cap and a heavy peacoat, a cigarette behind his ear | navy blue and orange stripes |
| `teacher` | 女教师 | a prim woman with her hair pinned up, glasses hanging on a chain, a high buttoned collar, raised eyebrow | teal and off-white |
| `veteran` | 退伍兵 | a grizzled man with an eye patch, an old military greatcoat with tarnished medals | olive green and red |
| `poet` | 流浪诗人 | a long-haired thin man with a loose scarf and a crumpled hat, dreamy half-closed eyes, ink on his fingers | lilac and dusty pink |
| `apothecary` | 药剂师 | a thin woman with short dark hair, a green apron, holding a small glass vial up to the light | bottle green and amber |
| `inspector` | 警探 | a tired middle-aged detective in a long coat and loosened tie, stubble, heavy-lidded eyes | sodium orange and cold blue |
| `fishergirl` | 渔家少女 | a freckled young woman with two thick braids and a yellow oilskin jacket, wind-blown | sea blue and yellow |
| `merchant` | 商人 | a mustached man in a striped waistcoat with a gold pocket-watch chain, a polite but calculating smile | wine red and gold |
| `flowerseller` | 卖花婆婆 | a wrinkled old woman in a knitted shawl holding a bunch of dried flowers, warm but unreadable smile | faded rose and sage |
| `student` | 学生 | a skinny teenager with messy hair, an oversized sweater and a book satchel strap across the chest, wary eyes | sky blue and brick red |
| `nun` | 修女 | a young nun in a grey habit and white wimple, serene face with a small scar on her chin | ash grey and pale gold |

---

## 四、小屋场景（可选，2 张）

夜里每个玩家看到的是"自己的小屋"。程序里已经用代码画了一版线稿；如果要换成原作那种油画，就生成这两张。

### 参考图

原作开场那间小旅馆房间：斜 45° 俯视，**一个被剖开的房间浮在纯黑里**，只有房间本身被照亮
（[Steam 截图](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/632470/ss_ef8e3eca9fb67d94d8a3fb7b7934de5ccdeed4dd.1920x1080.jpg)）。

### 要求

- **构图**：等距（isometric）视角的一个小房间，两面墙（左后、右后）+ 木地板，墙的上沿被"剖开"，房间四周是**纯黑**（`#000`，便于程序叠在黑底上）。房间居中，占画面 70% 左右。
- **陈设**：左墙边一张窄床（被子是旧的灰蓝色）、右墙一扇窗、窗下一张小木桌（桌上一盏油灯、一个空酒瓶、几张纸）、一把椅子、墙上挂一件外套、地上一块旧地毯。**床上不要画人**（人物由程序叠加）。
- **光**：
  - `cottage-night.webp`：油灯发出暖橙色的光圈照亮桌子周围，窗外透进一道冷蓝色的月光斜铺在地板上，其余部分很暗。
  - `cottage-dawn.webp`：同一个房间，油灯熄了，窗外透进灰白的晨光。
- **笔触**：和原作场景一样的写实油画质感，细节丰富但颜色低饱和。
- 不要文字、不要人物、不要水印。

> Isometric cutaway of a small shabby rented room floating in pure black void, Disco Elysium environment painting style: worn wooden floorboards, two back walls cut open at the top, a narrow bed with an old grey-blue blanket against the left wall, a window on the right wall, a small wooden table under it with an oil lamp, an empty bottle and loose papers, a chair, a coat hanging on a hook, a threadbare rug. {光照}. Low-saturation realistic oil painting, rich detail. Room centered, about 70% of the frame, everything outside the room is solid black. No people, no text. 1600×1200.

光照：
- 夜：`Night: the oil lamp casts a warm orange pool of light around the table, a cold blue beam of moonlight from the window falls diagonally across the floor, everything else in deep shadow`
- 黎明：`Dawn: the lamp is out, grey-white early morning light comes through the window`

---

## 五、白天小镇地图（地块 + 贴图，可选）

白天的小镇用 PixiJS 画成斜视角：地面由 64px 的方块地块拼成（俯视画，程序压扁成斜视角），摆设是单独的贴图。现在全是程序画的占位，想换成手绘就按下面的格式出图。

### 地块图 `tiles.png`
- 放到 `client/src/assets/world/tiles.png`，**512×192 PNG**：8 列 × 3 行，每格 64×64。
- 打开 `http://localhost:3001/?preview=tiles` 能看到每一格的编号和名字，点"保存这张占位图"可以拿到当前占位当模板（发给 Codex 当参考图）。
- 0–15 是"角落拼接"地块：每格四个角各自是雪地或石板，编号 = 左上×1 + 右上×2 + 左下×4 + 右下×8。**每格的四条边必须能和别的格无缝接上**：同一种地形的纹理以 64px 为周期重复，交界线在边的中点穿过。
- 16–23 是整格变体（枯枝、雪堆、灰点、裂纹、残雪、磨损、脚印、冰洼），细节离边缘至少 6px。
- 风格：极乐迪斯科游戏内地图——纸一样的灰白雪地、冷灰色石板、深色墨线路沿；俯视，不要透视、不要阴影方向不一致。

### 摆设贴图（`client/src/assets/world/<名字>.png`）
程序会优先用同名 PNG，没有就用占位。它们在斜视角里是"立着的纸片"，正对镜头：
`lamp.png` `tree.png` `bench.png` `crate.png` `barrel.png` `cart.png` `well.png` `stall.png` `stall_flip.png` `fence.png` `notice.png`，尺寸见 `client/src/world/sprites.jsx` 里 PROPS 的 box × 3。

### 建筑（现在是程序画的体块，之后换手绘）
小镇现在是斜视角（2:1，屏幕 x = x − y，屏幕 y = (x + y)/2 − 高度），1800×1400 逻辑单位，建筑位置在 `src/shared/map.js`（HOUSES 是能进的 6 间，OBSTACLES 是不能进的 17 栋）。
最终方案：Codex 画一整张斜视角小镇大图当背景，再从图里切出会挡住人的前景块（屋檐、墙、树）。到那一步再单独出提示词和切图规格。

地图本身（哪里是路、摆设放哪）在 `client/src/assets/maps/town-*.json`，由 `scripts/gen-map.mjs` 生成（`npm run map`）。也可以直接用 Tiled 打开改，但改完别再跑 `npm run map`，否则会被覆盖。

## 六、验收清单

- [ ] 文件名和 id 一一对应，放在对的目录
- [ ] 尺寸、比例正确；单张大小在限制内
- [ ] 画面里没有文字、字母、数字、水印、边框
- [ ] 技能卡：四个阵营的色系分得清（镇民蓝、外来者紫、爪牙黄、恶魔红），黑底占画面大部分
- [ ] 人物头像：都是原创人物，和原作人物认不出相似；18 张放在一起风格统一
- [ ] 小屋场景：房间外是纯黑，床上没人
