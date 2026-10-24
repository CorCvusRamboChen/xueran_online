血染钟楼的小镇底图需要一版高清重画，另外 5 张开灯外观的灯光要对准窗户。房子本身不用重画。

## 1. 底图 town-base.webp 高清重画（最重要）
文件：C:\Users\12424\OneDrive\文档\酒桌游戏\botc-bot\client\src\assets\world\town-base.webp（3280×1760，墓园地基已修过的那版）。

现在的问题：整体构图和氛围是对的，但细节不行——
- 生成时就偏糊：石板路的砖缝、积雪、屋顶瓦片、窗框都是一团，放大看像涂抹过。
- 左上角（地图边缘外那片暗处，大约 x 300–1000、y 150–700）有一片半透明的"重影"，像小镇边缘被复制了一份糊在黑底上。
- 有些房子的窗户和灯光有错位、双影。

请按现在这张的布局重新画一张 **6560×3520** 的清晰版：
- 道路、广场、钟楼、码头、海岸线、每块房子地基的位置和形状，都必须和现在这张对齐（缩小一半后叠上去偏差不超过 2 像素）。可以分块重绘再拼接，注意接缝。
- 画风参考极乐迪斯科（Disco Elysium）的场景：厚涂油画质感，但近看笔触里有清楚的结构——砖缝、木纹、雪堆的体积、屋檐下的阴影、生锈铁皮的边缘都要分明；低饱和冷灰蓝底色 + 少量暖橙灯光；地面有明确的明暗和接触阴影，建筑落在地上有影子。
- 参考图（极乐迪斯科原作截图）在这个文件夹，请先逐张看一遍：C:\Users\12424\OneDrive\文档\酒桌游戏\botc-bot\design\refs\de\
  · de-ref-whirling-exterior.png、de-ref-frittte-exterior.png、de-ref-pawnshop-exterior.png、de-ref-bookstore-exterior.png：街道和建筑外观的细节密度
  · de-ref-fishing-village.png、de-ref-sea-fortress.png：海岸、码头、雪和冷色调
  · de-ref-church-exterior.png、de-ref-doomed-commercial.png：破败建筑的材质
- 地图边缘外面是干净的纯暗色（接近 #0b0f12），不要重影。
- 房子地基（那几块方形石台）保留原位置原形状，游戏会在上面叠房子。

画完：
- 存成 outputs/hires/town-base.webp（WebP 质量 92）。
- 把它缩小到 3280×1760 和原图叠在一起检查对齐，偏差超过 2 像素的地方要修；给我一张对齐检查图 outputs/hires/align-check.png（半透明叠加）。
- 给我一张对比图 outputs/hires/compare.png：同一个局部（比如钟楼和广场、码头）原图放大 2 倍 vs 新图，并排。

## 2. 开灯外观的灯光对准窗户
文件：同目录下的 house-tavern-closed-lit.png、house-church-closed-lit.png、house-smithy-closed-lit.png、house-bakery-closed-lit.png、house-library-closed-lit.png。

问题：灯光是后贴上去的，好几扇窗的暖光整块偏了位置——一半落在窗框外面的墙上，一半在窗里（酒馆最明显，图书馆也有）。

请以对应的不开灯版本（house-xxx-closed.png）为底，重新只给窗户玻璃加暖橙色灯光：光严格在窗框里面，可以有一点点往外的光晕，但不能整块挪位。其余像素和不开灯版本完全一样，尺寸、透明背景、对齐都不变。存到 outputs/hires/，文件名不变，再给我一张 5 栋房子改前改后的对比图 outputs/hires/lit-compare.png。
