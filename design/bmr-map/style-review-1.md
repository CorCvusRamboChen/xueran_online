# 黯月初升底图 · 风格一致性审查（第 1 轮）

审查方：图像分析 AI（Elorian），2026-10-24。
对比对象：
- 我们生成的底图 `outputs/bmr/town-base.webp`：整张缩小版，加广场、石桥、烽火台两张原尺寸局部。
- 极乐迪斯科官方图 5 张（`design/refs/de/`）：
  - `de-ref-bmr-overview-artbook.png`
  - `de-ref-whirling-exterior.png`
  - `de-ref-fishing-village.png`
  - `de-ref-bmr-terrain-lands-end.png`
  - `de-ref-church-exterior.png`

**结论**：构图、等距视角、题材方向都对，但画法差得远。我们的图是"干净、柔化、均匀的数字概念图"，原作是"松动的油画厚涂 + 速写式线条 + 强明暗戏剧"。季节和色温的差异是故意的，不算问题，下面只谈画法。

## 差距（从大到小）

1. **明暗结构（差距最大）**
   - 我们：没有真黑，也没有亮高光。99 分位亮度 ≤0.65，1 分位 ≥0.05，灰度直方图单峰挤在 0.2–0.45。阴影只是轻微加深，没有组织画面的大暗块。
   - 原作：先铺大块近黑暗部，再给小面积强光。42% 像素 <0.15，暗部到 0；窗光处 18.8% 像素 >0.8，甚至纯白过曝。
   - 改法：暗部压到近黑但保留冷色，高光允许局部过曝，灰度分成"深暗块 + 中灰 + 少量亮"三层。
2. **笔触与颜料质感**
   - 我们：地面铺满大小、密度一致的点戳笔触，像噪声纹理；交界处全部柔化；没有厚涂、刮刀、干笔。高频能量是原作的约 1/6，画面太滑。
   - 原作：屋顶每块木板是一条方向明确的厚涂笔触，板间用深色硬线；码头是方向性板条 + 冷暖色块补丁 + 近黑缝隙线；地面是大平涂 + 硬边色块 + 写意细线 + 飞溅点。硬边和软晕、厚涂和薄洗、大笔和细线交替出现。
3. **细节密度与概括**
   - 我们：每块地基、每格铺石、每片草地都画到同等程度。局部对比度的变异系数只有 0.33–0.45，广场放射纹规整到没有一笔被省掉。
   - 原作：大片安静、局部密集（变异系数 0.57–0.77）。外围和水面高度概括，细节集中在焦点上。
   - 改法：外围地面、远处树林大幅概括成平涂和大笔；细节留给广场、桥、塔顶火光和房子。
4. **造型语言**
   - 我们：完美的等距菱形岛，地基是精确的平行四边形，房屋直角干净，锈迹均匀成条；塔身石块是均匀网格；土路是光滑缎带；边缘羽化进黑底。整体像 3D 渲染或手游素材。
   - 原作：屋顶层数和坡度故意不齐，竖线倾斜，木板弯曲，栏杆歪斜；海岸线是不规则的有机形状。"歪"是这个风格的核心。
5. **光线与氛围**
   - 我们：漫射平光，看不出主光方向，投影弱而软；没有雾，没有空气透视；水面死平，地面干燥哑光。更像阴天正午，不像黄昏。
   - 原作：每张都有明确的光源；湿路反光；低角度日光有方向性的亮面；远处有雾。
6. **色彩结构**
   - 我们：饱和度均值 0.46–0.48，几乎没有灰调区域；暗部色相偏橙（32–35°），阴影"暖而脏"。
   - 原作：低饱和灰调打底（均值 0.11–0.32），饱和色只给关键物体；暗部偏冷偏灰，色相在绿、青、橄榄一带（62–175°）。
7. **"AI 味"出在六处**：
   - 均匀的纹理密度和柔化过渡；
   - 完美几何形状加羽化黑边；
   - 草和落叶是重复的图章式图案；
   - 没有任何意外笔触；
   - 没有明暗层级和视觉焦点；
   - 风化痕迹分布得太均匀。

## 量化验收标准（重画后用 Python 自测，全图缩到 2000 宽测量）

| 指标 | 现在 | 目标（接近原作） |
|---|---|---|
| 亮度 <0.15 的像素占比 | 很少 | ≥ 20% |
| 亮度 99 分位 | ≤ 0.65 | ≥ 0.85（暖光、塔火、屋脊高光） |
| 饱和度均值 | 0.46–0.48 | ≤ 0.32 |
| 暗部（亮度 <0.25）平均色相 | 32–35°（橙） | 偏冷，≥ 60°（橄榄、灰绿、青灰） |
| 局部对比度变异系数（64px 块的标准差 / 均值） | 0.33–0.45 | ≥ 0.55 |
| 拉普拉斯方差（高频笔触能量） | 0.0035 | 明显提高，接近原作的 0.02 量级 |

## 审查方给出的英文修改提示词

> Repaint this isometric late-autumn forest-station map in the loose, painterly oil style of Disco Elysium concept art, keeping the exact composition, camera angle and layout of all houses, foundation plots, paths, plaza, bridge, river and tower unchanged. Use broad visible brushstrokes with thick impasto on roofs and stone, palette-knife smears and flat paint patches on the ground, dry-brushed wood grain on the bridge and roof planks, and sparse sketchy linework for twigs, cracks and stains; let some edges cut hard and others wet-blend. Restructure value: crushed near-black shadows under eaves, bridge and trees, one strong warm low dusk key light raking across the plaza and bridge, small clipped highlights on the tower brazier and roof ridges, cool green-teal tinted shadows, and atmospheric haze softening the far edge. Lower overall saturation to a muted muddy grey-brown and grey-green base, reserving saturated ochre, rust red, moss green and ember orange only for accents. Vary finish density: tight, specific brushwork on plaza, bridge, tower and houses; large loose washes and abstracted ground toward the margins; replace the feathered black border with a hard painted edge or natural shoreline. Avoid clean 3D rendering, uniform texture noise, mobile-game smoothness and even lighting; introduce warped hand-drawn perspective, tilted verticals, irregular rooflines and asymmetric weathering.

## 对布局的约束（重画时仍然要守）

- "手绘的歪"只能在轮廓内部体现：屋檐、竖线、板条可以歪，但建筑、树林、地标的外轮廓仍要落在底稿轮廓里，宽高不超过一成。游戏要按底稿轮廓把它们切出来做遮挡。
- 7 块空地的位置和边界不变。路、溪岸、桥的位置不变，缩小一半后偏差 ≤2 像素。
- 地图边缘：不要羽化的黑雾，改成一圈"画出来的"不规则硬边颜料边界，像原作区域图那样。边界外仍然是 `#0b0f12` 纯暗色。
