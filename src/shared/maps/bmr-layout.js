// 黯月初升 7 间能进的房子的手动微调（在 http://localhost:3001/?preview=layout 里拖、拉滑块，点保存就写回这个文件）。
// dx / dy：房子中心挪多少（世界坐标，放大以后的；室内图和能走的地面跟着挪）；cdx / cdy：外观图再单独挪多少；
// closed：外观缩放；open：室内缩放（走得到的地面也跟着缩放）。
export default {
  "teahouse": {
    "dx": -10,
    "dy": -2,
    "cdx": 6,
    "cdy": -9,
    "closed": 1.04,
    "open": 1.12
  },
  "chapel": {
    "dx": 20,
    "dy": 12,
    "cdx": -6,
    "cdy": -16,
    "closed": 1.11,
    "open": 1.19
  },
  "inn": {
    "dx": -30,
    "dy": -31,
    "cdx": -20,
    "cdy": -42,
    "open": 1.13
  },
  "crowyard": {
    "dx": 17,
    "dy": 17,
    "cdx": -806,
    "cdy": 511,
    "closed": 0.99,
    "open": 1.13
  },
  "lodge": {
    "dx": 34,
    "dy": 6,
    "closed": 1.21,
    "open": 1.24
  },
  "mill": {
    "dx": 5,
    "dy": -18,
    "cdx": 17,
    "cdy": -3,
    "closed": 1.09,
    "open": 1.31
  },
  "workshop": {
    "dx": -31,
    "dy": -18,
    "cdx": 2,
    "cdy": -7,
    "closed": 1.02,
    "open": 1.18
  }
};
