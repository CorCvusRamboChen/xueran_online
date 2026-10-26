【黯月初升 · 7 间能进的房子，以这一条为准】

底图已经定稿，现在画《黯月初升》7 间能进的房子。要求和《暗流涌动》那批一样：要有独特性，像极乐迪斯科地图里的建筑，不要千篇一律的小木屋。

1. 参考图（极乐迪斯科官方场景截图，只学造型、细节密度、剖面画法，不要照抄）：
C:\Users\12424\OneDrive\文档\xueran_online\design\refs\de\

* 外观：de-ref-church-exterior（木头教堂，尖塔、层层叠叠的屋顶、架空的木平台）、de-ref-whirling-exterior、de-ref-bookstore-exterior、de-ref-pawnshop-exterior、de-ref-frittte-exterior、de-ref-fishing-village、de-ref-sea-fortress、de-ref-doomed-commercial，以及这个剧本专用的 de-ref-bmr-shack-exterior、de-ref-bmr-ramshackle-exterior、de-ref-bmr-church-concept、de-ref-bmr-inn-backyard
* 剖开的室内：de-ref-whirling-interior（最重要：整栋楼被剖开，地板、墙、家具、人物活动的痕迹都看得见）、de-ref-church-interior、de-ref-bookstore-interior、de-ref-pawnshop-interior、de-ref-frittte-interior、de-ref-coalroom-interior、de-ref-bmr-shack-interior、de-ref-bmr-cutaway-interior

2. 造型可以大胆、奇特：可以有尖塔、塔楼、歪斜的加建、外挂楼梯、雨棚、木平台、烟囱群，房子可以超出底稿体块，透视也不必严格 45 度。但要满足三点：

* 镜头方向大体一致（从东南上方往下看），和小镇底图 outputs\bmr\town-base.webp 放在一起不违和：同一个深秋黄昏，低低的橙红夕照从画面左下方照过来，屋顶边和背阴处有一层很薄的初雪，地上有落叶；
* 房子落地的位置就是底稿里那块地基，底部要压在地基上，不能挪走；
* 门（入口）在底稿门的位置附近：黯月旅店、茶馆、修道院礼拜堂的门在南墙中间（画面左下那面墙）；溪边磨坊、钟表工坊、猎人小屋的门在东墙中间（画面右下那面墙）；乌鸦墓园的铁门在西边。

3. 底稿在 C:\Users\12424\OneDrive\文档\xueran_online\design\guides\ ，文件名是 bmr-house-<id>-closed.png 和 bmr-house-<id>-open.png（墓园只有 open）。每张底稿就是输出画布：输出尺寸和底稿完全一样，地基的像素位置不变。房子上方已经留了地方画高的结构。

4. 输出透明背景的 PNG：只要房子本身（可以带一点贴地的软阴影），其他地方全透明。可以先在纯色背景上画，再用 Python 抠掉背景，边缘要干净、没有色边。

* house-<id>-closed.png：完整外观，窗户不亮灯；
* house-<id>-closed-lit.png：和 closed 同一张图，只给窗玻璃加暖光（#ffcf7a 一带），光严格在窗框里，窗外最多一点点光晕，其余像素和 closed 完全一样（游戏里能进的房子用这张）；
* house-<id>-open.png：像 de-ref-whirling-interior 那样剖开：拿掉朝向镜头的墙和屋顶，露出铺满地基的地板、后墙（北墙、西墙）和满屋的家具与故事细节，室内暖光。
* 乌鸦墓园是露天的，只做 open。

5. 每间的造型和故事细节（"故事"只靠摆设讲，不写字）：

| id | 名字 | 外观 closed | 剖开 open |
|---|---|---|---|
| inn | 黯月旅店（全镇最大最显眼） | 两层半木构旅店，外挂楼梯通到二楼回廊，几根烟囱冒烟；门口挂着摇晃的招牌，只画一弯月亮和一只酒杯的图案；门边停着旅人的篷车，拴着一匹马 | 大炉火、长桌、麦酒杯；通往客房的楼梯；墙上挂一把鲁特琴；角落一只水手的海员箱和一卷缆绳；挂钥匙的木板上少了一把；一把椅子翻倒在地，桌上半杯酒还没喝完 |
| teahouse | 茶馆 | 暖色的小茶馆，门口支着布篷，篷下两张小圆桌，窗口冒着蒸汽 | 铜茶炉、整面墙成排的茶罐；两张紧挨着的扶手椅（像在护着两个邻居）；桌上倒好两杯茶，一杯没动过、已经凉了 |
| mill | 溪边磨坊 | 石头底座加歪斜的木头上层，朝溪那面（画面下方）挂着一个大水车，屋顶有个小绞盘房 | 石磨盘、木齿轮、成堆的面粉袋；地上一串沾着面粉的脚印通向一块掀开一半的地板暗门；墙角一个捕鼠夹 |
| chapel | 修道院礼拜堂 | 石砌小礼拜堂，一座细高尖塔，彩窗是暗红色的（只有色块，不画人物），墙上爬满枯藤，侧面一个小钟楼 | 长椅、祭坛、燃到一半的蜡烛；一只驱魔用的木十字架；垂下来的钟绳；地上用盐撒了一个圈，圈中间一把椅子，椅子上挂着断开的铁链 |
| crowyard | 乌鸦墓园（只做 open） | — | 一圈矮铁栅栏，西边是铁门；歪倒的墓碑（碑上不刻字）；一座刚挖开的新坟，土是湿的，铁锹插在土里；旁边一具空棺材，棺盖被推到一边；一棵光秃的枫树，落满乌鸦；石凳上搭着一条织了一半的毛线披肩 |
| workshop | 钟表工坊 | 歪斜的木板房，屋顶上冒出齿轮和一簇细烟囱，橱窗里挂满怀表 | 工作台上拆开的钟表零件、发条、放大镜；满墙的钟，指针全停在同一个位置（表盘只画刻度，不画数字）；台上一只做了一半的机械鸟 |
| lodge | 猎人小屋 | 林子边上的原木小屋，门上钉着鹿角，外墙晾着兽皮，门边一大堆劈好的柴 | 兽皮、捕兽夹、一张木桌、小铁炉；门板内侧有几道很深的爪痕 |

6. 画面里不要任何文字、字母、数字、水印，也不要画小人。全部放到 outputs\bmr\houses\（共 19 张：6 间带屋顶的各 closed / closed-lit / open 三张，加 house-crowyard-open.png）。全部完成后做一张总览 outputs\bmr\houses-sheet.png：每间的 closed、closed-lit、open 并排，放在灰色棋盘格背景上，方便看透明。不要改代码。
