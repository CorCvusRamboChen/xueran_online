# 黯月初升 · 地图设计

> **10 月 24 日更新**：下面"沿用现在的可行走布局"那一版已经**作废**。新方向是每张地图有自己的主体、地标和路网（方法见 `.claude/skills/botc-map-design/SKILL.md`）。新布局：`layout.js`（数据）、`blockout.html`（灰盒图，截图在 `design/screens-1024/13-黯月初升地图灰盒（新布局）.png`）。
>
> 新布局一句话：**驿道边的黯月旅店是主体，一条溪谷斜穿全镇把镇子切成两岸，石桥是相遇引擎，东北的吊板桥小路是绕远的闭环，东南山丘上的破烽火台是主地标。** 七间私聊房：黯月旅店、茶馆、溪边磨坊、修道院礼拜堂、乌鸦墓园、钟表工坊、猎人小屋。脚本验证：全部走得到，最远回集合点约 3.7 秒，房门最近相距 301。
>
> 下面的色板、光线、氛围仍然适用；房子清单和布局以新布局为准。
>
> **10 月 24 日傍晚：用图像 AI（Elorian）做了三轮布局验收**，结论"可以交给画师"。第一轮找出 9 处真问题（路压房子、老井和绞刑架堵路口、桥不垂直溪水、烽火台和树挡住房子、屋檐穿插、旅店没路），第二、三轮是扫尾。改动：路只通到门口；绞刑架放到驿站广场正中，老井在路边空地；桥面垂直跨溪；吊板桥两头接上路、和石桥成环；烽火台挪到东边山丘；茶馆、磨坊、几栋民居挪了位置；礼拜堂补了门前路。能写成规则的都进了 `test/map.test.js`（路离墙 ≥8、房子离水 ≥30、建筑间距 ≥40、画面遮挡、地标互叠）。最终底稿：`design/guides/bmr-town-guide.png`（截图 17）。
> 交给画师时附上 AI 的两条美术建议：两个驿道出口加路牌/马桩；贴着广场的三间房（钟表工坊、溪边磨坊、黯月旅店）门脸要做出明显区别，免得玩家认错门。
>
> **10 月 24 日下午：新布局已经接进游戏（灰盒）**。地图数据搬到了 `src/shared/maps/bmr.js`（`layout.js` 只留作设计稿），寻路、进屋、机器人溜达、小地图、画面都按剧本读地图数据（`getMap(剧本)`）。墓园的 id 改成了 `crowyard`，免得和暗流涌动墓园的手绘图串了。等距底稿已导出：`design/guides/bmr-town-guide.png` + `bmr-house-<id>-closed/open.png`，下一步交给 Codex 画。

---

# （旧版）地图雏形

## 一句话

**同一座小镇，换一个季节和时刻**：暗流涌动是"雪夜里的海边小镇"，黯月初升是"入冬前的黄昏，森林边上的小镇，旅人匆匆躲进旅店"。

依据官方百科的背景故事：冬日暮色渐近，太阳被天际线吞没；橙红的枫叶被黑色斑点侵蚀；森林等着第一场雪；小镇边缘的岩缝里传来饿狼的嚎叫，受惊的鸦群四散；旅人匆匆走进旅店，靠热茶、乐曲和麦酒取暖，却没发觉一双双邪恶的眼睛正悄悄逼近。

## 布局：沿用现在的可行走布局

- 地图坐标、道路、广场、6 栋能进的房子的位置和大小**全部不变**。走路、碰撞、寻路、进屋私聊的代码不用动，只换美术。
- 换的是：地面材质、季节、光线、每栋房子的外观和室内、装饰物、南边那一条（海 → 森林边缘的黑湖）。
- 布局参考图还是 `design/guides/town-guide.png`（3280×1760），概念板见 `concept.html`（截图在 `design/screens-1024/07-地图雏形概念板.jpg`）。

## 六栋能进的房子（id 不变，换主题）

| 位置（现 id） | 暗流涌动 | 黯月初升 | 外观要点 | 室内要点 |
|---|---|---|---|---|
| 北边中间（tavern） | 酒馆 | **黯月旅店** | 两层木构旅店，挂着摇晃的招牌（只画图案：月亮和酒杯），门口停着旅人的篷车和马，窗户透暖光 | 炉火、长桌、麦酒杯、楼梯通往客房、墙上挂着鲁特琴（吟游诗人） |
| 东北（church） | 教堂 | **山丘修道院礼拜堂** | 石砌小礼拜堂，尖顶，彩窗暗红，院墙上爬满枯藤；有僧侣的身影在门洞间穿行 | 长椅、祭坛、蜡烛、一只驱魔用的木十字架 |
| 西边中间（smithy） | 铁匠铺 | **修补匠的钟表工坊** | 歪斜的木板房，屋顶上冒出齿轮和烟囱，窗口挂满怀表 | 工作台上拆开的钟表零件、发条、放大镜，满墙钟（修补匠） |
| 南边中间（bakery） | 面包房 | **茶馆** | 暖色的小茶馆，门口支着布篷和两张小桌，蒸汽从窗口冒出 | 茶炉、成排的茶罐、两张挨着的扶手椅（茶艺师护着邻座） |
| 西北（library） | 图书馆 | **教授的书房兼解剖室** | 砖砌窄楼，窗后堆满书，屋顶一个小天文台 | 解剖台、心脏解剖图、电极、书堆（教授） |
| 东南（graveyard） | 墓园 | **乌鸦墓园**（仍是露天、只有一层图） | 歪倒的墓碑、新翻的坟土（僵怖）、一棵光秃的枫树上落满乌鸦 | — |

## 装饰物（散布在空地和路边）

- **枫树**：橙红叶子，叶面上有黑色斑点（"被黑色斑点逐渐侵蚀"），落叶铺在石板路上，和第一层薄雪混在一起。
- **乌鸦**：屋脊、墓园、钟楼顶上。
- **篷车和马**：旅店门口，旅人的箱子。
- **灯笼**：路灯换成挂在木杆上的暖色油灯。
- **广场中央**：钟楼保留（游戏里是个不能走的障碍物），改成被枯藤缠住的旧钟楼，顶上落着乌鸦。
- **南边一条**：原来的结冰海 → **森林边缘的黑湖**，湖面开始结薄冰；湖对岸是黑压压的松林，林间几处岩缝，岩缝里两点黄绿色的狼眼。码头改成伸进黑湖的小木栈桥。
- 地图四周的边缘：森林的剪影渐隐成黑色（沿用之前"颜色往外扩散"的边缘处理）。

## 色板与光线

| | 颜色 | 用在 |
|---|---|---|
| 暮光主光 | `#e07a3c` 橙红 → `#f2b25c` 金 | 从西南方低低地照过来，屋顶和墙的亮面 |
| 冷阴影 | `#2f3a4a` 蓝灰 → `#1a1f2a` | 所有阴影、北面的墙 |
| 枫叶 | `#c4502a` `#e08a3a` + 黑斑 `#2a1a14` | 树、落叶 |
| 初雪 | `#d8d6cf`（很薄，只在背阴处和屋顶边） | 屋顶边缘、路边背阴处 |
| 窗光 | `#ffcf7a` | 旅店、茶馆最亮 |
| 黑湖 | `#141a20` + 冰面 `#5f6a6e` | 南边 |

整体比暗流涌动**暖、暗、低对比的天光 + 强烈的窗光**，像傍晚六点。

## 交付规格（和暗流涌动那套完全一样）

- 底图 `town-base.webp`：高清 6560×3520（2 倍于参考图），对齐 `town-guide.png` 的透视和布局，6 块房子空地留空（画成地面）。
- 每栋房子：`house-<id>-closed.png`（外观，透明底）、`house-<id>-closed-lit.png`（亮灯版）、`house-<id>-open.png`（剖开的室内），尺寸和对齐方式照 `design/guides/house-*.png`。墓园只要 `open`。
- 放到 `client/src/assets/world-bmr/`（程序按剧本切换地图目录）。

## 交给 Codex 的提示词草稿（底图）

> Isometric painted town map in the style of Disco Elysium environment art (oil-painted, loose expressive brushwork, muted but rich colors). Same exact perspective and layout as the attached guide image: streets, central plaza with an old clock tower, empty lots where buildings will go. Season and time: late autumn turning to winter, at dusk — a low orange-red sun from the southwest, long cold blue shadows. Orange-red maple trees whose leaves are blotched with black spots, fallen leaves on cobblestones mixed with the first thin dusting of snow, crows on rooftops. Along the southern edge, instead of sea: a dark forest lake starting to freeze, a small wooden jetty, and a black pine forest with rocky crevices where two yellow-green wolf eyes glint. Warm oil lanterns on wooden poles. Edges of the map fade into darkness with soft color bleed. No text, no UI, no characters. 6560×3520.

## 程序要做的（你确认雏形后）

1. 地图资源按剧本分目录：`assets/world/`（暗流涌动）和 `assets/world-bmr/`（黯月初升），World.js 按 `s.script` 加载。
2. 房子显示名按剧本换（旅店、修道院……），`src/shared/map.js` 加一张剧本 → 名字的对照表。
3. 环境声：黯月初升把海浪换成林间风声 + 远处狼嚎 + 乌鸦。
4. 雪改成"落叶 + 稀疏的初雪"粒子。
