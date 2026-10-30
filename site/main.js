// 血染钟楼 Online · 官网脚本：邀请链接、入场动画、宣传片，以及六个章节里能动手的部分（语音示意、角色速查、村规开关、小魔典）。

// Discord 开发者后台 → 你的应用 → OAuth2 → Client ID。填上以后页面上所有「添加到 Discord」都直接打开授权页。
const CLIENT_ID = '';
// 查看频道、发消息、连接语音、管理频道、管理身份组、移动成员、闭麦、闭耳（和 README 一致）
const PERMISSIONS = '298847248';

if (CLIENT_ID) {
  const url = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=${PERMISSIONS}`;
  document.querySelectorAll('[data-invite]').forEach((a) => {
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const PEOPLE = 'media/people';

// ── 入场：每个章节里的东西依次出现 ──
const staged = new Map();
$$('.reveal').forEach((el) => {
  const box = el.closest('section, footer') ?? document.body;
  const i = staged.get(box) ?? 0;
  staged.set(box, i + 1);
  el.style.setProperty('--d', `${Math.min(i, 6) * 70}ms`);
});
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('is-in');
    io.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -6% 0px' });
$$('.reveal').forEach((el) => io.observe(el));

// 顶栏：滚到哪个章节，哪个标签亮
const tabs = $$('.tabs a');
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    tabs.forEach((a) => a.classList.toggle('on', a.hash === `#${e.target.id}`));
  }
}, { rootMargin: '-45% 0px -50% 0px' });
tabs.forEach((a) => { const s = $(a.hash); if (s) spy.observe(s); });

// ── 宣传片：静音循环；离开屏幕暂停，减少动效时不自动播 ──
const trailer = $('[data-trailer]');
const playBtn = $('[data-trailer-play]');
const fullBtn = $('[data-trailer-full]');
let userPaused = reduced;
if (reduced) {
  trailer.removeAttribute('autoplay');
  trailer.pause();
}
function syncPlay() {
  const paused = trailer.paused;
  $('use', playBtn).setAttribute('href', paused ? '#i-play' : '#i-pause');
  $('small', playBtn).textContent = paused ? '播放' : '暂停';
  playBtn.setAttribute('aria-label', paused ? '播放宣传片' : '暂停宣传片');
}
trailer.addEventListener('play', syncPlay);
trailer.addEventListener('pause', syncPlay);
playBtn.hidden = false;
syncPlay();
playBtn.addEventListener('click', () => {
  userPaused = !trailer.paused;
  if (userPaused) trailer.pause();
  else trailer.play().catch(() => {});
});
if (trailer.requestFullscreen || trailer.webkitEnterFullscreen) {
  fullBtn.hidden = false;
  fullBtn.addEventListener('click', () => {
    trailer.controls = true; // 全屏里要有进度条
    if (trailer.requestFullscreen) trailer.requestFullscreen().catch(() => {});
    else trailer.webkitEnterFullscreen();
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) trailer.controls = false; });
  trailer.addEventListener('webkitendfullscreen', () => { trailer.controls = false; });
}
new IntersectionObserver(([e]) => {
  if (!e.isIntersecting) trailer.pause();
  else if (!userPaused) trailer.play().catch(() => {});
}).observe(trailer);

// ── 2 · Discord 语音示意：走进哪间房子，就进哪间的语音 ──
const FACES = { 阿澈: 'docker', 小满: 'teacher', 老格: 'blacksmith', 卢卡: 'poet', 汉娜: 'widow', 你: 'innkeeper' };
const SQUARE = '钟楼广场';
const where = { 你: SQUARE, 老格: SQUARE, 卢卡: SQUARE, 汉娜: SQUARE, 阿澈: '教堂', 小满: '教堂' };
let rooms = ['教堂']; // 机器人建出来的房子频道，按建的先后
const locked = new Set(['教堂']);
let fresh = '';
const dcList = $('[data-dc]');
const lockBtn = $('[data-lock]');
const voiceStatus = $('[data-voice-status]');
const houseBtns = $$('[data-house]');

function renderVoice() {
  dcList.innerHTML = [SQUARE, ...rooms].map((ch) => {
    const who = Object.keys(where).filter((n) => where[n] === ch);
    const cls = ['dc-ch', where.你 === ch && 'is-here', ch === fresh && 'dc-new'].filter(Boolean).join(' ');
    return `<li class="${cls}">
      <div class="dc-name"><svg class="ico" aria-hidden="true"><use href="#i-speaker"/></svg>${ch}${
        locked.has(ch) ? '<span class="dc-lock"><svg class="ico" aria-hidden="true"><use href="#i-lock"/></svg>锁门私聊中</span>' : ''}</div>
      <ul class="dc-mem">${who.map((n) => `<li${n === '你' ? ' class="me"' : ''}><img src="${PEOPLE}/${FACES[n]}.webp" width="200" height="278" alt="">${n}</li>`).join('')}</ul></li>`;
  }).join('');
  fresh = '';
  houseBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.house === where.你)));
  lockBtn.disabled = where.你 === SQUARE;
  lockBtn.setAttribute('aria-pressed', String(locked.has(where.你)));
  $('span', lockBtn).textContent = locked.has(where.你) ? '开门' : '锁门';
}
houseBtns.forEach((b) => b.addEventListener('click', () => {
  const to = b.dataset.house;
  const from = where.你;
  if (to === from) return;
  where.你 = to;
  const said = [];
  if (to === SQUARE) said.push('你回到了钟楼广场。');
  else if (!rooms.includes(to)) {
    rooms.push(to);
    fresh = to;
    said.push(`机器人新建了「${to}」语音频道，把你拉了进去。频道只有屋里的人看得到。`);
  } else said.push(`你走进了${to}。`);
  if (from !== SQUARE && !Object.values(where).includes(from)) {
    rooms = rooms.filter((r) => r !== from);
    locked.delete(from);
    said.push(`「${from}」没人了，频道自动删掉。`);
  }
  voiceStatus.textContent = said.join('');
  renderVoice();
}));
lockBtn.addEventListener('click', () => {
  const h = where.你;
  if (locked.has(h)) { locked.delete(h); voiceStatus.textContent = '门开了，谁都能走进来。'; }
  else { locked.add(h); voiceStatus.textContent = '门锁上了。别人走到门口只能敲门：让他进来，或者假装没人。'; }
  renderVoice();
});
renderVoice();

// ── 4 · 按照百科：角色速查（数据来自 src/engine/roles.js 和 client/src/roleShort.js）──
// id, 名字, 英文名, 阵营, 剧本, 首夜醒, 其他夜晚醒, 一句话
const ROLES = [
  ['washerwoman','洗衣妇','Washerwoman','townsfolk','tb',1,0,'首夜：两人里有一个是某个镇民'],
  ['librarian','图书管理员','Librarian','townsfolk','tb',1,0,'首夜：两人里有一个是某个外来者'],
  ['investigator','调查员','Investigator','townsfolk','tb',1,0,'首夜：两人里有一个是某个爪牙'],
  ['chef','厨师','Chef','townsfolk','tb',1,0,'首夜：有几对邪恶的人挨着坐'],
  ['empath','共情者','Empath','townsfolk','tb',1,1,'每晚：两边活着的邻座有几个邪恶'],
  ['fortuneteller','占卜师','Fortune Teller','townsfolk','tb',1,1,'每晚选两人：里面有没有恶魔'],
  ['undertaker','送葬者','Undertaker','townsfolk','tb',0,1,'每晚*：今天被处决的人是什么角色'],
  ['monk','僧侣','Monk','townsfolk','tb',0,1,'每晚*护一个人：恶魔杀不死他'],
  ['ravenkeeper','守鸦人','Ravenkeeper','townsfolk','tb',0,0,'夜里死了：查一个人的角色'],
  ['virgin','贞洁者','Virgin','townsfolk','tb',0,0,'第一次被镇民提名：提名的人当场处决'],
  ['slayer','猎手','Slayer','townsfolk','tb',0,0,'一次：白天开枪，打中恶魔他就死'],
  ['soldier','士兵','Soldier','townsfolk','tb',0,0,'恶魔杀不死你'],
  ['mayor','镇长','Mayor','townsfolk','tb',0,0,'剩 3 人且当天没处决：好人赢；夜里可能有人替你死'],
  ['butler','管家','Butler','outsider','tb',1,1,'每晚选主人：主人投票你才能投'],
  ['drunk','酒鬼','Drunk','outsider','tb',0,0,'以为自己是某个镇民，能力其实无效'],
  ['recluse','陌客','Recluse','outsider','tb',0,0,'可能被当成邪恶、爪牙或恶魔'],
  ['saint','圣徒','Saint','outsider','tb',0,0,'被处决：好人输'],
  ['poisoner','投毒者','Poisoner','minion','tb',1,1,'每晚毒一人：他的能力失效、信息可能是假的'],
  ['spy','间谍','Spy','minion','tb',1,1,'每晚看魔典；可能被当成好人'],
  ['scarletwoman','红唇女郎','Scarlet Woman','minion','tb',0,0,'活人 5 个以上时恶魔死了：你变恶魔'],
  ['baron','男爵','Baron','minion','tb',0,0,'场上多 2 个外来者'],
  ['imp','小恶魔','Imp','demon','tb',0,1,'每晚*杀一人；杀自己就让一个爪牙接班'],
  ['grandmother','祖母','Grandmother','townsfolk','bmr',1,1,'首夜：知道一个好人（孙子）；他被恶魔杀，你也死'],
  ['sailor','水手','Sailor','townsfolk','bmr',1,1,'每晚选一人：你或他醉酒；你不会死'],
  ['chambermaid','侍女','Chambermaid','townsfolk','bmr',1,1,'每晚选两人：今晚有几个人醒过'],
  ['exorcist','驱魔人','Exorcist','townsfolk','bmr',0,1,'每晚*选一人：选中恶魔，他今晚不醒'],
  ['innkeeper','旅店老板','Innkeeper','townsfolk','bmr',0,1,'每晚*选两人：他们不会死，其中一人醉酒'],
  ['gambler','赌徒','Gambler','townsfolk','bmr',0,1,'每晚*猜一个人的角色：猜错你死'],
  ['gossip','造谣者','Gossip','townsfolk','bmr',0,1,'白天公开说一句：说对了今晚死一人'],
  ['courtier','侍臣','Courtier','townsfolk','bmr',1,1,'一次：选一个角色，它醉三天三夜'],
  ['professor','教授','Professor','townsfolk','bmr',0,1,'一次：复活一个死了的镇民'],
  ['minstrel','吟游诗人','Minstrel','townsfolk','bmr',0,0,'爪牙被处决：其他人全醉到明天黄昏'],
  ['tealady','茶艺师','Tea Lady','townsfolk','bmr',0,0,'两边活着的邻座都是好人：他们不会死'],
  ['pacifist','和平主义者','Pacifist','townsfolk','bmr',0,0,'被处决的好人可能不死'],
  ['fool','弄臣','Fool','townsfolk','bmr',0,0,'第一次要死时不会死'],
  ['tinker','修补匠','Tinker','outsider','bmr',0,1,'随时可能死'],
  ['moonchild','月之子','Moonchild','outsider','bmr',0,1,'死时公开指一人：他是好人就今晚死'],
  ['goon','莽夫','Goon','outsider','bmr',0,0,'每晚第一个选你的人醉酒，你变成他的阵营'],
  ['lunatic','疯子','Lunatic','outsider','bmr',1,1,'以为自己是恶魔，其实不是'],
  ['godfather','教父','Godfather','minion','bmr',1,1,'首夜知道在场的外来者；外来者白天死了，今晚杀一人'],
  ['devilsadvocate','魔鬼代言人',"Devil's Advocate",'minion','bmr',1,1,'每晚选一人：他明天被处决也不会死'],
  ['assassin','刺客','Assassin','minion','bmr',0,1,'一次：夜里杀一人，什么都挡不住'],
  ['mastermind','主谋','Mastermind','minion','bmr',0,0,'恶魔被处决时游戏不结束，再多一夜一天：那天处决谁，谁的阵营输'],
  ['zombuul','僵怖','Zombuul','demon','bmr',0,1,'白天没人死，晚上才杀一人；第一次死后假装死了'],
  ['pukka','普卡','Pukka','demon','bmr',1,1,'每晚毒一人；上一个中毒的人死'],
  ['shabaloth','沙巴洛斯','Shabaloth','demon','bmr',0,1,'每晚*杀两人；可能把一个吐回来（复活）'],
  ['po','珀','Po','demon','bmr',0,1,'每晚*可以杀一人；空过一晚，下次杀三人'],
];
const TEAMS = [['townsfolk', '镇民'], ['outsider', '外来者'], ['minion', '爪牙'], ['demon', '恶魔']];
const TEAM_NAME = Object.fromEntries(TEAMS);
const SCRIPT_NAME = { tb: '暗流涌动', bmr: '黯月初升' };
const riTeams = $('[data-ri-teams]');
const riDetail = $('[data-ri-detail]');
const riSearch = $('[data-ri-search]');
const scriptTabs = $$('[data-script]');
let script = 'tb';
let picked = 'empath';

function renderChips() {
  const q = riSearch.value.trim().toLowerCase();
  const pool = ROLES.filter((r) => (q ? (r[1] + r[2] + r[7]).toLowerCase().includes(q) : r[4] === script));
  if (!pool.length) {
    riTeams.innerHTML = '<p class="ri-empty"></p>';
    riTeams.firstChild.textContent = `没有找到「${riSearch.value.trim()}」。`;
    return;
  }
  riTeams.innerHTML = TEAMS.map(([team, label]) => {
    const list = pool.filter((r) => r[3] === team);
    if (!list.length) return '';
    return `<div class="ri-team t-${team}"><span class="ri-tlabel">${label}</span><div class="ri-chips">${
      list.map((r) => `<button type="button" class="ri-chip${r[0] === picked ? ' on' : ''}" data-role="${r[0]}" aria-pressed="${r[0] === picked}">${r[1]}</button>`).join('')
    }</div></div>`;
  }).join('');
}
function renderDetail() {
  const [id, name, en, team, sc, f, o, line] = ROLES.find((r) => r[0] === picked);
  const nights = [f && '首夜', o && '其他夜晚'].filter(Boolean);
  riDetail.className = `ri-detail t-${team}`;
  riDetail.innerHTML = `
    <figure class="ri-art"><img src="media/roles/${id}.webp" width="360" height="500" alt="${name}的能力牌插画"></figure>
    <div class="ri-body">
      <header><b>${name}</b><small>${en}</small></header>
      <div class="ri-tags"><span class="ri-tag">${TEAM_NAME[team]}</span>${
        nights.length ? nights.map((n) => `<span class="ri-tag night">☾ ${n}醒</span>`).join('') : '<span class="ri-tag night">夜里不醒</span>'
      }<span class="ri-tag script">${SCRIPT_NAME[sc]}</span></div>
      <p>${line.replace('每晚*', '首夜之后每晚')}</p>
    </div>`;
}
function showScript(sc) {
  script = sc;
  riSearch.value = '';
  scriptTabs.forEach((x) => { x.classList.toggle('on', x.dataset.script === sc); x.setAttribute('aria-selected', String(x.dataset.script === sc)); });
  if (!ROLES.some((r) => r[0] === picked && r[4] === sc)) {
    picked = sc === 'tb' ? 'empath' : 'grandmother';
    renderDetail();
  }
  renderChips();
}
riTeams.addEventListener('click', (e) => {
  const b = e.target.closest('[data-role]');
  if (!b) return;
  picked = b.dataset.role;
  renderChips();
  renderDetail();
  if (matchMedia('(max-width: 960px)').matches) riDetail.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
});
scriptTabs.forEach((t) => t.addEventListener('click', () => showScript(t.dataset.script)));
riSearch.addEventListener('input', renderChips);
renderChips();
renderDetail();

// 1 · 地图上的房子和下面的列表：指到哪个，两边一起亮
$$('[data-map]').forEach((map) => {
  const card = map.closest('.script');
  const light = (n) => $$('[data-pin], [data-house-chip]', card).forEach((el) =>
    el.classList.toggle('is-on', (el.dataset.pin ?? el.dataset.houseChip) === n));
  $$('[data-house-chip]', card).forEach((chip) => {
    chip.addEventListener('pointerenter', () => light(chip.dataset.houseChip));
    chip.addEventListener('pointerleave', () => light(null));
  });
});

// 3 · AI 说书人：一局里的几个时刻，切换实机截图
const SHOTS = [
  { img: 'lobby', alt: '游戏大厅：座位上坐了 6 个人，房间设置里说书人选了「AI 房主」',
    cap: '大厅里说书人选「AI 房主」，配置用推荐预设；人数对不上，就由 AI 来配。' },
  { img: 'night', alt: '夜里在自己的小屋：右上角轮到占卜师，从 8 个人里选两名玩家',
    cap: '入夜，每个人回自己的小屋。轮到你醒来，就在右上角选人，右下角是倒计时。' },
  { img: 'info', alt: '天亮前收到信息：占卜师得知 3 号小满与 6 号卢卡之中有恶魔',
    cap: '结果直接送到你手上，也记进「你得到的信息」：3 号和 6 号之中有恶魔。' },
];
const shotFig = $('[data-shots]');
if (shotFig) {
  const img = $('[data-shot-img]', shotFig);
  const open = $('.shot-open', shotFig);
  const cap = $('[data-shot-cap]', shotFig);
  const tabs = $$('[data-shot]', shotFig);
  tabs.forEach((t) => t.addEventListener('click', () => {
    const s = SHOTS[Number(t.dataset.shot)];
    tabs.forEach((x) => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', String(x === t)); });
    img.src = `media/shots/${s.img}-960.webp`;
    img.srcset = `media/shots/${s.img}-960.webp 960w, media/shots/${s.img}-1920.webp 1920w`;
    img.alt = s.alt;
    open.dataset.full = `media/shots/${s.img}-1920.webp`;
    cap.lastChild.textContent = s.cap;
  }));
}

// 截图点开看大图
const box = document.createElement('dialog');
box.className = 'lightbox';
box.innerHTML = '<img alt=""><button class="btn btn-secondary lightbox-x" type="button">关闭</button>';
document.body.append(box);
$$('.shot-open').forEach((b) => b.addEventListener('click', () => {
  const big = $('img', box);
  big.src = b.dataset.full;
  big.alt = $('img', b).alt;
  box.showModal();
}));
box.addEventListener('click', () => box.close());

// 1 · 剧本卡上的「看这个剧本的角色」→ 跳到按照百科，切到那个剧本
$$('[data-goto-script]').forEach((b) => b.addEventListener('click', () => {
  showScript(b.dataset.gotoScript);
  $('#rules').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}));

// ── 5 · 村规开关（和大厅「房间设置」里的一样，默认值见 src/server/room.js）──
const RULES = [
  { label: '提名者自动投一票', on: true,
    off: '提名的人要自己举手，才算一票。', yes: '提名的人自动算一票，票数从 1 开始。' },
  { label: '投票时隐藏票型（投完公开）', on: true,
    off: '谁举了手实时公开，所有人都看得到。', yes: '投票时只看得到自己举没举手，投完再公开票型。' },
  { label: '小局也互认、发伪装', on: false,
    off: '6 人及以下，恶魔和爪牙互相不知道身份，恶魔也不拿伪装。', yes: '小局也在首夜互认，恶魔拿 3 个伪装。' },
  { label: '爪牙共用恶魔的 3 个伪装', on: true,
    off: '伪装只给恶魔，恶魔再私下告诉队友。', yes: '爪牙和恶魔一起看到那 3 个伪装。' },
  { label: '7 人以下不发男爵', script: '暗流涌动', on: true,
    off: '男爵照常随机出现，小局也会多出两个外来者。', yes: '7 人以下不随机发男爵，免得小局太难打；房主指定的照给。' },
  { label: '夜里死了仍拿信息（醉酒）', on: false,
    off: '夜里死了就没有能力，当晚不再醒。', yes: '夜里被杀的信息角色照样拿当晚的信息，但按醉酒处理：可能是假的。' },
  { label: '疯子（以为是僵怖）死后照样醒', script: '黯月初升', on: false,
    off: '疯子死了就失去能力，不再醒。', yes: '没人死的夜里照样叫醒他，让他以为自己只是「假死」。' },
];
const rulesList = $('[data-rules]');
rulesList.innerHTML = RULES.map((r, i) => `<li class="setting${r.on ? ' is-on' : ''}">
  <div class="setting-top"><span id="rule-${i}">房规：${r.label}</span>${r.script ? `<small>${r.script}</small>` : ''}${r.on ? '<small>默认开</small>' : ''}
    <button type="button" class="switch" role="switch" aria-checked="${r.on}" aria-labelledby="rule-${i}" data-rule="${i}"><i></i></button></div>
  <p></p></li>`).join('');
function renderRule(i) {
  const li = rulesList.children[i];
  $('p', li).innerHTML = li.classList.contains('is-on') ? `<b>打开后</b>${RULES[i].yes}` : `<b>官方</b>${RULES[i].off}`;
}
RULES.forEach((_, i) => renderRule(i));
rulesList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rule]');
  if (!b) return;
  const li = b.closest('.setting');
  const on = !li.classList.contains('is-on');
  li.classList.toggle('is-on', on);
  b.setAttribute('aria-checked', String(on));
  renderRule(Number(b.dataset.rule));
});

// ── 6 · 连线标记：小魔典（颜色和 client/src/marks.jsx 一致）──
const SEATS = [
  ['阿澈', 'docker'], ['小满', 'teacher'], ['老格', 'blacksmith'], ['卢卡', 'poet'],
  ['汉娜', 'widow'], ['你', 'innkeeper'], ['阿梨', 'veteran'], ['老钟', 'clockkeeper'],
];
const TAGS = { townsfolk: ['镇民', 'var(--int)'], outsider: ['外来者', 'var(--psy)'], minion: ['爪牙', 'var(--mot)'], demon: ['恶魔', 'var(--phy)'] };
const LINKS = { trust: ['信任', '#5fb8cf'], sus: ['怀疑', '#e2b52c'], ally: ['同伙', '#db5444'], counter: ['对跳', '#b06adf'], info: ['信息', '#9ad08a'] };
const square = $('.square');
const seatList = $('[data-seats]');
const svg = $('[data-links]');
const marksStatus = $('[data-marks-status]');
let tool = 'sus';
let from = null;
let tags = { 2: 'minion' };
let links = [{ a: 6, b: 2, type: 'info' }, { a: 1, b: 2, type: 'sus' }];
const seatName = (i) => `${i + 1} 号${SEATS[i][0]}`;

seatList.innerHTML = SEATS.map(([name, img], i) => {
  const a = ((i / SEATS.length) * 360 - 90) * (Math.PI / 180);
  return `<li class="seat" style="--x:${(50 + Math.cos(a) * 36).toFixed(2)}%;--y:${(50 + Math.sin(a) * 36).toFixed(2)}%">
    <button type="button" class="seat-btn" data-seat="${i}" aria-label="${i + 1} 号 ${name}"><img src="${PEOPLE}/${img}.webp" width="200" height="278" alt="" loading="lazy"><b class="seat-no">${i + 1}</b></button>
    <span class="seat-name">${name}</span></li>`;
}).join('');
const seatEls = [...seatList.children];

$('[data-tools-tag]').innerHTML = Object.entries(TAGS).map(([k, [label, c]]) =>
  `<button type="button" class="tool" style="--attr:${c}" data-tool="${k}" aria-pressed="false">${label}</button>`).join('');
$('[data-tools-link]').innerHTML = Object.entries(LINKS).map(([k, [label, c]]) =>
  `<button type="button" class="tool" style="--attr:${c}" data-tool="${k}" aria-pressed="false">${label}</button>`).join('');
const toolBtns = $$('[data-tool]');

function center(i) {
  const s = square.getBoundingClientRect();
  const r = $('.seat-btn', seatEls[i]).getBoundingClientRect();
  return [((r.left + r.width / 2 - s.left) / s.width) * 100, ((r.top + r.height / 2 - s.top) / s.height) * 100];
}
function drawLinks() {
  if (!square.getBoundingClientRect().width) return; // 还没排版（比如藏在入场动画后面）就先不画
  const defs = Object.entries(LINKS).map(([k, [, c]]) =>
    `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="${c}"/></marker>`).join('');
  svg.innerHTML = `<defs>${defs}</defs>` + links.map(({ a, b, type }) => {
    const [x1, y1] = center(a);
    const [x2, y2] = center(b);
    // 线停在头像边上，箭头才看得见
    const k = 6.5 / (Math.hypot(x2 - x1, y2 - y1) || 1);
    return `<line x1="${x1 + (x2 - x1) * k}" y1="${y1 + (y2 - y1) * k}" x2="${x2 - (x2 - x1) * k}" y2="${y2 - (y2 - y1) * k}" stroke="${LINKS[type][1]}" marker-end="url(#arrow-${type})"/>`;
  }).join('');
}
function renderMarks() {
  seatEls.forEach((el, i) => {
    const t = tags[i];
    el.classList.toggle('is-from', from === i);
    if (t) { el.dataset.tag = t; el.style.setProperty('--attr', TAGS[t][1]); } else { delete el.dataset.tag; el.style.removeProperty('--attr'); }
    let chip = $('.seat-tag', el);
    if (t && !chip) { chip = document.createElement('span'); chip.className = 'seat-tag'; el.append(chip); }
    if (chip) { if (t) chip.textContent = TAGS[t][0]; else chip.remove(); }
  });
  toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  drawLinks();
}
toolBtns.forEach((b) => b.addEventListener('click', () => {
  tool = b.dataset.tool;
  from = null;
  marksStatus.textContent = TAGS[tool] ? `点一个人，把他标成「${TAGS[tool][0]}」。` : `「${LINKS[tool][0]}」：先点起点的人，再点终点的人。`;
  renderMarks();
}));
seatList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-seat]');
  if (!b) return;
  const i = Number(b.dataset.seat);
  if (TAGS[tool]) {
    if (tags[i] === tool) { delete tags[i]; marksStatus.textContent = `去掉了 ${seatName(i)} 的标记。`; }
    else { tags[i] = tool; marksStatus.textContent = `你把 ${seatName(i)} 标成了「${TAGS[tool][0]}」。`; }
  } else if (from === null) {
    from = i;
    marksStatus.textContent = `从 ${seatName(i)} 连到谁？再点一个人。`;
  } else if (from === i) {
    from = null;
    marksStatus.textContent = '取消了。';
  } else {
    const same = links.some((l) => l.a === from && l.b === i && l.type === tool);
    links = links.filter((l) => !(l.a === from && l.b === i));
    if (!same) links.push({ a: from, b: i, type: tool });
    marksStatus.textContent = same ? `删掉了 ${from + 1} 号 → ${i + 1} 号的连线。` : `${from + 1} 号 → ${i + 1} 号：${LINKS[tool][0]}`;
    from = null;
  }
  renderMarks();
});
$('[data-marks-clear]').addEventListener('click', () => {
  tags = {};
  links = [];
  from = null;
  marksStatus.textContent = '清空了。游戏里每一局开始也会自动清空。';
  renderMarks();
});
new ResizeObserver(drawLinks).observe(square);
renderMarks();
