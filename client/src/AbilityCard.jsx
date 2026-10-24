// 能力牌：主体是能力本身（不画人，人物有单独的头像牌）。
// 版面：上半插画铺满（极乐迪斯科技能卡）+ 行动时机（血染夜晚顺序）+ 白底名字条 + 能力说明 + 提醒标记（血染原作的 reminder token）。
import { ROLES, TEAM_NAME, isEvilRole } from '../../src/engine/roles.js';
import { ATTR, FLAVOR } from './flavor.js';
import { ROLE_ART } from './art.js';

// 每个角色的要点：选几个人、得到什么、魔典里用到的提醒标记（照原作）
const META = {
  washerwoman: { learn: '两人之一的镇民身份', reminders: ['镇民', '错误'] },
  librarian: { learn: '两人之一的外来者身份', reminders: ['外来者', '错误'] },
  investigator: { learn: '两人之一的爪牙身份', reminders: ['爪牙', '错误'] },
  chef: { learn: '相邻邪恶玩家有几对' },
  empath: { learn: '两侧邻座有几个邪恶' },
  fortuneteller: { learn: '其中有没有恶魔', reminders: ['红鲱鱼'] },
  undertaker: { learn: '今天被处决者的角色', reminders: ['今日处决'] },
  monk: { learn: '他今晚不受恶魔伤害', reminders: ['受保护'] },
  ravenkeeper: { when: '夜里死亡时', learn: '一名玩家的角色' },
  virgin: { when: '第一次被提名', learn: '镇民提名你会被处决', reminders: ['失去能力'] },
  slayer: { when: '白天 · 每局一次', learn: '恶魔中枪即死', reminders: ['失去能力'] },
  soldier: { when: '始终', learn: '恶魔杀不死你' },
  mayor: { when: '始终', learn: '三人存活且无处决时获胜' },
  butler: { learn: '明天只能跟着主人投票', reminders: ['主人'] },
  drunk: { when: '始终', learn: '你以为自己是某个镇民', reminders: ['酒鬼'] },
  recluse: { when: '始终', learn: '可能被当作邪恶' },
  saint: { when: '被处决时', learn: '你的阵营落败' },
  poisoner: { learn: '他今晚和明天中毒', reminders: ['中毒'] },
  spy: { learn: '查看整本魔典' },
  scarletwoman: { when: '恶魔死亡时', learn: '你变成恶魔', reminders: ['是恶魔'] },
  baron: { when: '开局', learn: '场上多两名外来者' },
  imp: { learn: '他死亡；自刀则传位', reminders: ['死亡'] },
  // ── 黯月初升 ──
  grandmother: { learn: '一名善良玩家和他的角色', reminders: ['孙子', '死亡'] },
  sailor: { learn: '你或他之一醉酒；你不会死', reminders: ['醉酒'] },
  chambermaid: { learn: '其中几人今晚因能力醒来' },
  exorcist: { learn: '选中恶魔则他今晚不能行动', reminders: ['被选择'] },
  innkeeper: { learn: '两人今晚不死，一人醉酒', reminders: ['不会死亡', '醉酒'] },
  gambler: { learn: '猜错角色你就死', reminders: ['死亡'] },
  gossip: { when: '白天 · 公开声明', learn: '声明为真则今晚有人死', reminders: ['死亡'] },
  courtier: { learn: '该角色醉酒三天三夜', reminders: ['醉酒1', '醉酒2', '醉酒3', '失去能力'] },
  professor: { learn: '死去的镇民复活', reminders: ['复活', '失去能力'] },
  minstrel: { when: '爪牙死于处决时', learn: '其他所有人醉酒到明天黄昏', reminders: ['全员醉酒'] },
  tealady: { when: '始终', learn: '两侧善良邻座不会死', reminders: ['不会死亡'] },
  pacifist: { when: '处决时', learn: '善良玩家可能不死' },
  fool: { when: '第一次将要死亡', learn: '你不会死', reminders: ['失去能力'] },
  tinker: { when: '随时', learn: '你可能突然死亡', reminders: ['死亡'] },
  moonchild: { when: '得知自己死亡时', learn: '选中善良玩家则他今晚死', reminders: ['死亡'] },
  goon: { when: '每晚第一个选中你的人', learn: '他醉酒，你换到他的阵营', reminders: ['醉酒'] },
  lunatic: { when: '始终', learn: '你以为自己是恶魔', reminders: ['被选择'] },
  godfather: { learn: '首夜得知外来者；外来者白天死则杀一人', reminders: ['死于今日', '死亡'] },
  devilsadvocate: { learn: '他明天被处决不会死', reminders: ['处决不死'] },
  assassin: { learn: '他死亡，无视任何保护', reminders: ['死亡', '失去能力'] },
  mastermind: { when: '恶魔死于处决时', learn: '再多一夜一天' },
  zombuul: { learn: '白天没人死才杀人；第一次死亡不死', reminders: ['死于今日', '死亡'] },
  pukka: { learn: '他中毒；上一个中毒者死亡', reminders: ['中毒', '死亡'] },
  shabaloth: { learn: '两人死亡；可能反刍一人', reminders: ['死亡', '复活'] },
  po: { learn: '一人死亡；攒一晚则三人', reminders: ['死亡', '攻击三次'] },
};

/** 选什么：几名玩家 / 一个角色 / 可以不用。 */
function chooseText(c) {
  const who = c.count ? `${c.count} 名${c.notSelf ? '其他' : ''}${c.alive ? '存活' : ''}${c.dead ? '死亡' : ''}玩家` : '';
  return [who, c.role ? '一个角色' : '', c.optional ? '（可以不用）' : ''].filter(Boolean).join(' + ').replace(' + （', '（');
}

export function AbilityCard({ id, compact = false }) {
  const r = ROLES[id];
  const attr = ATTR[r.team];
  const meta = META[id] ?? {};
  const nights = [r.firstNight > 0 && '首夜', r.otherNight > 0 && '其他夜晚'].filter(Boolean);
  const when = meta.when ?? (nights.length ? null : '被动');
  return (
    <article className={`acard ${compact ? 'compact' : ''}`} style={{ '--attr': attr.color }}>
      <div className="acard-art">
        {ROLE_ART[id] ? <img src={ROLE_ART[id]} alt="" /> : <PlaceholderArt id={id} team={r.team} />}
        <div className="acard-when">
          {nights.map((n) => <span key={n} className="night">☾ {n}</span>)}
          {when && <span className="day">{when}</span>}
        </div>
      </div>
      <header className="acard-name">
        <b>{r.name}</b>
        <small>{r.en.toUpperCase()}</small>
      </header>
      <div className="acard-body">
        <p className="acard-kicker">{attr.name} · {TEAM_NAME[r.team]} · {isEvilRole(id) ? '邪恶' : '善良'}</p>
        <p className="acard-text">{r.ability}</p>
        {!compact && (
          <>
            <dl className="acard-facts">
              {r.choose && <><dt>选择</dt><dd>{chooseText(r.choose)}</dd></>}
              {meta.learn && <><dt>{isEvilRole(id) || ['monk', 'butler'].includes(id) ? '效果' : '得知'}</dt><dd>{meta.learn}</dd></>}
            </dl>
            {meta.reminders && (
              <div className="acard-reminders">
                {meta.reminders.map((t) => <span key={t} className="reminder">{t}</span>)}
                <small>魔典提醒</small>
              </div>
            )}
            {FLAVOR[id] && <p className="acard-flavor">「{FLAVOR[id].wake}」</p>}
          </>
        )}
      </div>
    </article>
  );
}

const PAINT = { townsfolk: ['#11151a', '#4f6478', '#9fb3c8'], outsider: ['#0f0d16', '#6d5f9a', '#c4b5ee'], minion: ['#100d06', '#8a6a1f', '#e2b543'], demon: ['#12070a', '#7a1c2a', '#d23c52'] };

/** 没有插画时的占位。占卜师画了一版完整的：水晶球里两个人影，一个投下长角的影子。 */
function PlaceholderArt({ id, team }) {
  const [bg, mid, hi] = PAINT[team] ?? PAINT.townsfolk;
  if (id === 'fortuneteller') {
    return (
      <svg viewBox="0 0 180 200" aria-hidden="true">
        <defs>
          <radialGradient id="ft-glow" cx=".5" cy=".42" r=".6"><stop offset="0" stopColor={hi} stopOpacity=".55" /><stop offset="1" stopColor={hi} stopOpacity="0" /></radialGradient>
          <radialGradient id="ft-ball" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#dbe6ef" /><stop offset=".35" stopColor={hi} /><stop offset="1" stopColor={mid} /></radialGradient>
          <clipPath id="ft-clip"><circle cx="90" cy="92" r="46" /></clipPath>
        </defs>
        <rect width="180" height="200" fill={bg} />
        <rect width="180" height="200" fill="url(#ft-glow)" />
        <g filter="url(#paint)">
          {/* 桌布 */}
          <path d="M10 200 L28 150 Q90 132 152 150 L170 200Z" fill={mid} opacity=".55" />
          <path d="M28 150 Q90 132 152 150" stroke={hi} strokeOpacity=".3" strokeWidth="2" fill="none" />
          {/* 底座 */}
          <path d="M64 148 Q90 132 116 148 L110 160 Q90 154 70 160Z" fill="#2a3440" />
          <path d="M70 160 Q90 154 110 160 L114 168 Q90 162 66 168Z" fill="#c9874a" opacity=".85" />
          {/* 水晶球 */}
          <circle cx="90" cy="92" r="46" fill="url(#ft-ball)" />
        </g>
        <g clipPath="url(#ft-clip)">
          {/* 球里的雾 */}
          <g filter="url(#brush)" opacity=".7" fill="none" stroke="#eef3f7" strokeLinecap="round">
            <path d="M50 104 Q70 92 92 102 T134 96" strokeWidth="6" />
            <path d="M54 82 Q78 74 100 84 T130 78" strokeWidth="4" opacity=".6" />
          </g>
          {/* 两个远远的人影，一高一低；左边那个在雾上投下长角的影子 */}
          <g fill="#151b22">
            <circle cx="72" cy="104" r="3.4" /><path d="M67.5 121 Q72 107 76.5 121Z" />
            <circle cx="106" cy="100" r="2.6" /><path d="M102.5 114 Q106 103 109.5 114Z" />
          </g>
          <path d="M70 121 C64 124 58 126 52 124 L48 116 L53 120 L55 112 L58 121 C62 121 66 120 70 121Z" fill="#7a1c2a" opacity=".9" filter="url(#brush)" />
          <g filter="url(#brush)" opacity=".55" fill="none" stroke="#eef3f7" strokeLinecap="round">
            <path d="M48 126 Q72 118 96 126 T136 120" strokeWidth="8" />
          </g>
        </g>
        <ellipse cx="74" cy="70" rx="12" ry="7" fill="#fff" opacity=".35" transform="rotate(-30 74 70)" />
        <circle cx="90" cy="92" r="46" fill="none" stroke="#0b0e12" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 180 200" aria-hidden="true">
      <rect width="180" height="200" fill={bg} />
      <circle cx="90" cy="96" r="50" fill={mid} filter="url(#paint)" />
      <text x="90" y="114" textAnchor="middle" className="emblem-char">{ROLES[id].name[0]}</text>
    </svg>
  );
}

/** 预览页：22 张能力牌排在一起（地址加 ?preview=cards）。 */
export function CardGallery() {
  // ?preview=cards&script=bmr：只看一个剧本
  const script = new URLSearchParams(location.search).get('script');
  const ids = Object.keys(ROLES).filter((id) => !script || ROLES[id].script === script);
  return (
    <div className="gallery">
      <h1 className="title" style={{ fontSize: 28 }}>能力牌预览</h1>
      <p className="muted">放进 client/src/assets/art/roles/ 的插画重新构建后会出现在这里；没有图的显示占位。</p>
      <div className="gallery-grid">
        {ids.map((id) => <AbilityCard key={id} id={id} />)}
      </div>
    </div>
  );
}
