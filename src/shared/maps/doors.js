// 能进的房子的门在哪：按手绘图对齐（在 http://localhost:3001/?preview=doors&map=<地图> 里拖门，点保存写回这个文件）。
// { 美术套（tb / bmr / snv，变体地图跟着用的那套）: { 房子 id: { side: 门在哪面墙, t: 沿这面墙的位置 0–1（从西 / 北起），
//   in: 画里的门比占地边线往里缩多少（门前有台阶、平台的；人照样从边线进出，开门动画画在缩进去的那扇门上） } } }
// 没写的房子：门在 maps/*.js 里写的那面墙的正中间。
export default {
  "tb": {
    "tavern": {
      "side": "bottom",
      "t": 0.44,
      "in": 8
    },
    "church": {
      "side": "bottom",
      "t": 0.51
    },
    "smithy": {
      "side": "right",
      "t": 0.86,
      "in": 6
    },
    "bakery": {
      "side": "bottom",
      "t": 0.66,
      "in": 47
    },
    "library": {
      "side": "right",
      "t": 0.69,
      "in": 11
    },
    "graveyard": {
      "side": "left",
      "t": 0.71
    }
  },
  "bmr": {
    "chapel": {
      "side": "bottom",
      "t": 0.49,
      "in": 28
    },
    "inn": {
      "side": "bottom",
      "t": 0.38,
      "in": 11
    },
    "lodge": {
      "side": "right",
      "t": 0.7,
      "in": 22
    },
    "mill": {
      "side": "right",
      "t": 0.38,
      "in": 33
    },
    "teahouse": {
      "side": "bottom",
      "t": 0.49,
      "in": 19
    },
    "workshop": {
      "side": "right",
      "t": 0.66,
      "in": 19
    }
  },
  "snv": {
    "bigtop": {
      "side": "right",
      "t": 0.35,
      "in": 18
    },
    "clockshop": {
      "side": "bottom",
      "t": 0.39
    },
    "greenhouse": {
      "side": "bottom",
      "t": 0.43,
      "in": 10
    },
    "sideshow": {
      "side": "right",
      "t": 0.41,
      "in": 34
    },
    "studio": {
      "side": "bottom",
      "t": 0.35,
      "in": 19
    },
    "tavern": {
      "side": "bottom",
      "t": 0.43
    }
  }
};
