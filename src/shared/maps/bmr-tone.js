// 黯月初升的色调（在 http://localhost:3001/?preview=layout 的「色调」里调，点保存就写回这个文件）。
// map：手绘底图（连同从底图里切出来的树、普通建筑）和集合广场；square：集合广场单独改的项（盖在 map 上）；houses：7 间能进的房子。没写的项就是不调。
export default {
  "map": {
    "brightness": 0.86,
    "contrast": 1.13,
    "saturate": 1.11,
    "hue": -9
  },
  "square": {
    "saturate": 1
  },
  "houses": {
    "brightness": 0.81,
    "contrast": 1.07,
    "saturate": 0.99,
    "hue": -10
  }
};
