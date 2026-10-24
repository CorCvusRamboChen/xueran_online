// 玩家可以挑的人物形象（画像在 client/public/art/people/<id>.webp，见 design/ART_BRIEF.md）。
// 没挑就用 Discord 头像。
export const CHARACTERS = [
  { id: 'clockkeeper', name: '守钟人', hue: 38 },
  { id: 'innkeeper', name: '酒馆老板娘', hue: 12 },
  { id: 'blacksmith', name: '铁匠', hue: 24 },
  { id: 'priest', name: '神父', hue: 45 },
  { id: 'baker', name: '面包师', hue: 50 },
  { id: 'gravedigger', name: '掘墓人', hue: 110 },
  { id: 'widow', name: '寡妇', hue: 270 },
  { id: 'docker', name: '码头工', hue: 215 },
  { id: 'teacher', name: '女教师', hue: 180 },
  { id: 'veteran', name: '退伍兵', hue: 80 },
  { id: 'poet', name: '流浪诗人', hue: 300 },
  { id: 'apothecary', name: '药剂师', hue: 140 },
  { id: 'inspector', name: '警探', hue: 28 },
  { id: 'fishergirl', name: '渔家少女', hue: 200 },
  { id: 'merchant', name: '商人', hue: 350 },
  { id: 'flowerseller', name: '卖花婆婆', hue: 330 },
  { id: 'student', name: '学生', hue: 195 },
  { id: 'nun', name: '修女', hue: 40 },
];

export const CHARACTER_IDS = new Set(CHARACTERS.map((c) => c.id));
