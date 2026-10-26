# 黯月初升底图 · 风格一致性审查（第 2 轮，审第二版）

审查方：Elorian，2026-10-24。对比：第二版底图（全图 + 广场、烽火台两张局部）vs 第 1 轮同一组极乐迪斯科原图。

**结论：部分可接受。** 画法骨架已经进场，笔触、明暗范围、灰调基底、疏密节奏都进了原作的统计区间，这一版可以作为继续打磨的基底。但光和暖色改过头了：现在像"雪前阴天的灰版本"，还多了一批新的 AI 痕迹（漂浮色块、涂抹糊块、雪点式噪点）。单独看仍会被读成"灰滤镜化的同人图"。

## 上一轮 7 条差距的复检

| # | 项 | 状态 | 依据 |
|---|---|---|---|
| ① | 笔触质感 | 基本解决（有小退步） | 高频能量 0.0035 → 0.012，进入原作区间；刮刀平涂、干笔木纹、硬边高光、速写细线都出现了。退步：烽火台局部中部地面有一团漩涡状涂抹糊块，像滤镜；土路高光是一条条等宽的白缎带 |
| ② | 明暗 | 数值解决，组织仍欠 | 真黑、真白都有了（p1 0.016，p99 1.0，>0.8 的像素 5–7%）。但高光是散点式的，不是由一个主光分配出来的 |
| ③ | 色彩 | 基础饱和解决，强调色改过头 | 饱和度均值 0.48 → 0.23–0.26，对了；但饱和度 >0.45 的像素从 51% 跌到 0.5%，95 分位饱和度 0.43，低于原作的 0.50–0.57。锈红屋顶褪成灰褐，红灌木发闷，塔顶火又小又弱。暗部色相还偏暖黄（61–71°），原作暗部是 114–125° 的冷绿 |
| ④ | 疏密 | 部分解决 | 局部对比变异系数 0.36 → 0.55–0.59（原作 0.62–0.84），出现了安静区和密集区。残留：铺石成了黑白棋盘格；草垛白点和路面缎带是重复图章 |
| ⑤ | 光线氛围 | **未解决（最大缺口）** | 全图没有可辨认的主光：没有长投影，高光全是冷白，河水压黑后没有反光，没有雾和空气透视，地面白点读作雪。从"阴天正午"变成了"阴天 / 月夜" |
| ⑥ | 造型 | 部分解决，引入新伪影 | 岛缘改成了硬边破口笔触（好）；但建筑还是同一套规整几何，没有歪斜透视、不齐的屋檐、倾斜的竖线 |
| ⑦ | AI 味 | 部分减少，性质变了 | 从"生成感"（太干净太匀）变成"滤镜 + 拼接感"（漂浮色块、糊块、雪点、棋盘格、重复缎带） |

## 新问题（具体位置）

- **漂浮色块**：全图左上方，岛体外面的黑色区域里漂着一块平行四边形色板；左缘还有一小块灰斑。必须删掉或并入岛体。
- **拖尾碎片**：底部尖端垂着一个水滴状的拖尾，右缘的黑色区域里有灰色碎片。
- **涂抹糊块**：烽火台局部中部的地面有一团椭圆形的漩涡涂抹。
- **雪点式白噪点**：左下草垛、地面、岛缘都有，读作落雪，和"深秋"冲突，也显得脏。
- **棋盘格铺石**：广场铺石亮的纯白、缝全黑，交替得太规律，像滤镜阈值。
- **太灰太暗**：亮度中位数 0.44 → 0.30，失去了秋天的透光感。
- **右侧民居白墙**：亮灰色块浮在墙上，和环境光不衔接。

## 怎样在极乐迪斯科的画法里留住秋色和夕照（对照原作）

- **冷暖分置，而不是整体降饱和**：原作渔村里，暖的是受光的沙地、红棚、黄船，冷的是蓝篷和阴影，暖色是"被光选中"的。把锈红屋顶、赭黄草垛、橙红灌木的饱和度重新提回 0.45–0.6，只提被光照到的部分。
- **一个低角度的暖主光**：夕照从左侧斜掠广场和桥，拉出明确的长投影；塔顶余烬给一圈暖光晕，作为第二光源。
- **湿面反光**：河面和车辙要带暖色高光，不是纯黑。
- **冷阴影要通透**：暗部是冷绿、青灰色，但要透明，不能是泥灰。
- **秋意靠点缀**：成簇的落叶色块、几株红树就够，不用满铺暖色。

## 第三版的验收标准（在第 1 轮的基础上补充）

| 指标 | 第二版 | 第三版目标 |
|---|---|---|
| 饱和度均值（地形内） | 0.24 | 0.24–0.32（保持灰调底） |
| 饱和度 >0.45 的像素占比（地形内） | 0.5% | 4–10%（强调色回来，但只在受光处） |
| 饱和度 95 分位 | 0.43 | ≥ 0.50 |
| 亮度中位数（地形内） | 0.30 | 0.36–0.42 |
| 暗部（亮度 <0.25）色相 | 61–71° | 偏冷，≥ 90°（冷绿、青灰） |
| 局部对比变异系数（地形内） | 0.28 | 继续提高 |
| 漂浮色块、拖尾、涂抹糊块、雪点、棋盘格 | 有 | 全部没有 |

## 审查方给出的英文修改提示词（第 2 轮）

> Keep the current composition, layout and loose painterly oil treatment of this isometric map; only refine light, color and artifacts. Establish one motivated low warm dusk sun raking from the left: long soft shadows from houses, tower and trees, warm pools of light on the plaza and bridge approach, golden rim light on roof ridges and cobblestones, and a small ember-orange glow from the tower brazier spilling onto its top. Restore autumn saturation exactly where the light touches: rust-red and ochre roof planks, red-orange shrub clusters, golden ochre grass tufts, fallen leaf patches; keep shaded ground in muted grey-brown and grey-green but transparent, never muddy. Add wet warm highlights on the river surface and ruts, thin warm haze at the far shore for air perspective. Remove the floating detached parallelogram paint patches in the void at upper left and the grey fragments and teardrop drip along the bottom and right island edges; close the island silhouette into one continuous painted landmass with hard broken paint edges. Replace the swirled smudge blob on the ground mid-right with directional broad brushstrokes; break the checkerboard cobblestones into light and dark clusters instead of alternating white and black stones; delete snow-like white specks and replace them with warm leaf flecks; vary the repeated white path streaks. Slightly warp building geometry: tilted verticals, irregular rooflines, asymmetric rust and moss.
