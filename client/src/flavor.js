// 每个角色的"内心声音"：极乐迪斯科式的技能名 + 台词。只渲染气氛，不含任何推理信息。
// skill：像技能检定那样显示在名字旁边；wake：夜里被叫醒时；hear：得到信息时。
import { ROLES } from '../../src/engine/roles.js';

export const ATTR = {
  townsfolk: { name: '智力', color: 'var(--int)' },
  outsider: { name: '精神', color: 'var(--psy)' },
  minion: { name: '运动', color: 'var(--mot)' },
  demon: { name: '体格', color: 'var(--phy)' },
};

export const ROLE_TEAM = Object.fromEntries(Object.entries(ROLES).map(([id, r]) => [id, r.team]));

export const FLAVOR = {
  washerwoman: { skill: '视觉', wake: '晾衣绳在风里晃。你记得每一件衣服属于谁。', hear: '一件衬衫上的污渍，说出了它主人的秘密。' },
  librarian: { skill: '学识', wake: '书架之间有灰尘落下。', hear: '借书卡上有两个名字，其中一个不该在这里。' },
  investigator: { skill: '逻辑', wake: '你翻开笔记本。两份证词对不上。', hear: '线索指向两个人，其中一个在说谎。' },
  chef: { skill: '感知', wake: '锅里的汤还在冒泡。', hear: '你闻得出餐桌旁谁和谁坐得太近了。' },
  empath: { skill: '共情', wake: '黑暗里，你感觉到身边的人在呼吸。', hear: '你闻到了某种熟悉又不对劲的气味。' },
  fortuneteller: { skill: '内陆帝国', wake: '水晶球里的雾气在等你。', hear: '雾气散开了一角。' },
  undertaker: { skill: '悲恸', wake: '今天又有一口棺材要钉上。', hear: '棺材盖合上之前，你看清了那张脸。' },
  monk: { skill: '信仰', wake: '你为某个人点了一根蜡烛。', hear: '烛火很稳。' },
  ravenkeeper: { skill: '内陆帝国', wake: '乌鸦落在你冰冷的胸口。', hear: '乌鸦在你耳边说了一个词。' },
  virgin: { skill: '意志', wake: '你的手指交握在胸前。', hear: '你的纯洁是一把刀。' },
  slayer: { skill: '手眼协调', wake: '银弹在口袋里很沉。', hear: '扳机只扣得动一次。' },
  soldier: { skill: '耐力', wake: '你和衣而睡，靴子都没脱。', hear: '你挺过来了。' },
  mayor: { skill: '权威', wake: '这座镇子是你的。', hear: '人们在看着你。' },
  butler: { skill: '服从', wake: '你需要一位主人。', hear: '你知道明天该跟着谁举手了。' },
  drunk: { skill: '电光石火', wake: '你脑子里一团浆糊。', hear: '……' },
  recluse: { skill: '内陆帝国', wake: '没人愿意靠近你的屋子。', hear: '他们怎么看你，你一清二楚。' },
  saint: { skill: '信仰', wake: '你双手合十。', hear: '愿他们别犯错。' },
  poisoner: { skill: '手眼协调', wake: '药瓶在你手里很轻，轻得危险。', hear: '毒药已经下进了杯子里。' },
  spy: { skill: '视觉', wake: '魔典摊开在你面前。', hear: '每一行字都看得清清楚楚。' },
  scarletwoman: { skill: '戏剧', wake: '你对着镜子补了补口红。', hear: '血是红的，你的嘴唇也是。' },
  baron: { skill: '权威', wake: '镇子里多了几个外人，是你安排的。', hear: '一切都在计划之中。' },
  imp: { skill: '残暴', wake: '今晚，谁该闭上眼睛？', hear: '你的爪牙在黑暗里等你开口。' },
  // ── 黯月初升 ──
  grandmother: { skill: '共情', wake: '炉边的毛线团还没织完。你知道哪个孩子是你的。', hear: '你在人群里认出了那张脸。' },
  sailor: { skill: '电化学', wake: '朗姆酒在舌头上烧。今晚谁陪你喝？', hear: '醉的是谁，明早就知道了。' },
  chambermaid: { skill: '知觉', wake: '走廊里有门开过。你数着脚步。', hear: '今晚开过几扇门，你都听见了。' },
  exorcist: { skill: '意志力', wake: '十字架冰凉。今晚你要指着谁？', hear: '黑暗里有东西缩了回去。' },
  innkeeper: { skill: '镇静', wake: '炉火还旺，客房还空着两间。', hear: '两位客人今晚睡得很安稳。' },
  gambler: { skill: '内陆帝国', wake: '骰子在掌心里发烫。赌一把。', hear: '骰子停了。你不敢看。' },
  gossip: { skill: '修辞', wake: '你有话要说，憋了一整天。', hear: '话一出口，就收不回来了。' },
  courtier: { skill: '暗示', wake: '宫廷的酒杯里，一滴就够。', hear: '有人今晚会喝得烂醉。' },
  professor: { skill: '百科全书', wake: '解剖图摊在桌上。死亡只是一个可逆的过程——理论上。', hear: '心电图上跳了一下。' },
  minstrel: { skill: '戏剧', wake: '琴弦松了一根。', hear: '一首挽歌，全镇都醉了。' },
  tealady: { skill: '团队精神', wake: '茶还温着。坐在你身边的人很安全。', hear: '茶杯里的叶子沉了底。' },
  pacifist: { skill: '权威', wake: '绞绳不该落在好人脖子上。', hear: '绳子断了。' },
  fool: { skill: '敏捷', wake: '你又踩空了——又没摔死。', hear: '运气这东西，用一次少一次。' },
  tinker: { skill: '交互', wake: '齿轮还在转。也许下一秒就卡住。', hear: '咔哒。' },
  moonchild: { skill: '战栗', wake: '月亮知道你会怎么死。', hear: '死之前，你要带走一个人。' },
  goon: { skill: '体能', wake: '谁先碰你，谁就倒霉。', hear: '你换了一边站。' },
  lunatic: { skill: '内陆帝国', wake: '黑暗在召唤你。你是它的主人——你确信。', hear: '你的仆从在黑暗里等你开口。' },
  godfather: { skill: '权威', wake: '家族的生意，外人插不了手。', hear: '有人坏了规矩，今晚要还。' },
  devilsadvocate: { skill: '修辞', wake: '我会为你辩护——在绞刑架下。', hear: '明天的绞绳会打滑。' },
  assassin: { skill: '手眼协调', wake: '一刀。只有一刀。', hear: '刀已经出鞘了。' },
  mastermind: { skill: '概念化', wake: '棋盘比他们看到的更大。', hear: '一切都在计划之中。' },
  zombuul: { skill: '疼痛阈值', wake: '死过一次的人，不怕第二次。', hear: '白天太安静了。' },
  pukka: { skill: '电化学', wake: '毒在血里慢慢走。', hear: '上一个已经撑不住了。' },
  shabaloth: { skill: '半光', wake: '饿。两张嘴还不够。', hear: '有骨头卡在牙缝里。' },
  po: { skill: '镇静', wake: '忍一晚。明天吃个痛快。', hear: '你的胃口越攒越大。' },
};

/** 某个"声音"（角色 id / storyteller / clock）显示成什么样。 */
export function voiceOf(voice, rolesById) {
  if (voice === 'storyteller') return { who: '说书人', color: 'var(--mot)', skill: null };
  if (voice === 'clock' || !voice) return { who: '钟楼', color: 'var(--cream)', skill: null };
  const team = ROLE_TEAM[voice];
  return {
    who: rolesById?.[voice] ?? voice,
    color: ATTR[team]?.color ?? 'var(--cream)',
    skill: FLAVOR[voice]?.skill ?? null,
    flavor: FLAVOR[voice],
  };
}

export const ROLE_NAMES = Object.fromEntries(Object.entries(ROLES).map(([id, r]) => [id, r.name]));
