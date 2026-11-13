// 3D 小人（极乐迪斯科式：3D 人物 + 手绘背景）。
// · 一个通用底模：骨骼是嵌套的 Object3D（髋 → 脊柱 → 头 / 肩 → 上臂 → 前臂；髋 → 大腿 → 小腿 → 脚），每段身体是挂在骨骼上的网格。
// · 衣服是另外挂到骨骼上的网格（发型、帽子、上衣、下装、鞋、配饰），颜色可调。
// · 画风：自定义着色器——三段色阶 + 冷色阴影 + 笔触噪点 + 边缘光，外加深色描边；烘焙后再过一道油画（Kuwahara）滤镜。
// · 地图上不实时渲染 3D：每套搭配烘焙一张图集（8 个朝向 × [站立 + 8 帧走路]），小人播放图集里的帧。
// · 打样中：AI 生成的模型（glb，Mixamo 自动绑骨 + Mixamo 动作，见 scripts/avatar/）。网址带 ?avatar3d=glb 时所有人都用它，
//   图集按动作分段：待机、走、跑、起步、停步（sheet.anims 记每段在第几列、几帧、步幅多长）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
// 每个人物形象一个模型：assets/avatars/<形象 id>-anim.glb + 同名 .json（动作数据、身高），由 scripts/avatar/mixamo_merge.py 生成。
// 没有专属模型的人（用 Discord 头像的、还没做模型的形象）用 townsman。
const MODEL_URLS = import.meta.glob('../assets/avatars/*-anim.glb', { eager: true, query: '?url', import: 'default' });
const MODEL_META = import.meta.glob('../assets/avatars/*-anim.json', { eager: true, import: 'default' });
const modelId = (path) => path.split('/').pop().replace(/-anim\.(glb|json)$/, '');
const MODELS = Object.fromEntries(Object.entries(MODEL_URLS).map(([path, url]) =>
  [modelId(path), { url, meta: MODEL_META[path.replace(/\.glb$/, '.json')] }]));
export const MODEL_IDS = Object.keys(MODELS);
/** 这个人物形象（大厅里挑的 char）用哪个模型。 */
export const modelFor = (char) => (char && MODELS[char] ? char : 'townsman');
/** 这个形象的模型：{ url, meta }（meta：动作数据、身高）。 */
export const modelInfo = (char) => MODELS[modelFor(char)];
import { outfitKey } from '../../../src/shared/outfit.js';

THREE.ColorManagement.enabled = false; // 颜色按原样当 sRGB 用（画出来和色板一致）

export const FRAME_W = 96;
export const FRAME_H = 128;
export const DIRS = 8;          // 朝向：第 k 个 = 地图上的角度 k·45°（0 = 地图 +x 方向）
export const WALK_FRAMES = 8;   // 程序搭的小人走路一个周期几帧
const INK = 0x1d1b19;

// ───────────── 材质 ─────────────
const VERT = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec3 vP;
void main() {
  vN = normalize(normalMatrix * normal);
  vP = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uLight; uniform float uSeed; uniform float uShine;
varying vec3 vN; varying vec3 vW; varying vec3 vP;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(uLight);
  // 褶皱：竖向拉长的大笔触；细颗粒：画布的质感。用部件自己的坐标，走路时花纹跟着身体走
  float folds = noise(vP * vec3(26.0, 7.0, 26.0) + uSeed);
  float grain = noise(vP * vec3(90.0, 150.0, 90.0) - uSeed);
  // 包裹光：暗部不死黑；过渡柔但对比强
  float l = clamp((dot(n, L) + 0.35) / 1.35, 0.0, 1.0);
  l = smoothstep(0.12, 0.88, l + (folds - 0.5) * 0.38);
  vec3 c = uColor * mix(vec3(0.33, 0.37, 0.50), vec3(1.14, 1.03, 0.88), l);   // 冷暗部 → 暖亮部
  // 手绘高光（皮革、头发更亮），沿着褶皱断断续续
  vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
  c += pow(max(dot(n, h), 0.0), 16.0) * uShine * (0.4 + folds) * 0.4;
  // 下半身略暗（离地近、受光少）
  c *= 0.76 + 0.24 * smoothstep(0.0, 1.5, vW.y);
  c *= 0.93 + 0.14 * grain;
  // 天光勾边（冷色、很淡）
  c += vec3(0.30, 0.40, 0.55) * pow(1.0 - abs(n.z), 4.0) * 0.16;
  gl_FragColor = vec4(c, 1.0);
}`;
const LIGHT = new THREE.Vector3(-0.55, 0.75, 0.65).normalize();

const mats = new Map();
function paint(hex, shine = 0.15) {
  const key = `${hex}/${shine}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uColor: { value: new THREE.Color(hex) }, uLight: { value: LIGHT }, uSeed: { value: Math.random() * 10 }, uShine: { value: shine } },
    }));
  }
  return mats.get(key);
}
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

/** 在 parent 上挂一块网格（带描边）。 */
function part(parent, geom, hex, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], outline = 0, shine } = {}) {
  const m = new THREE.Mesh(geom, paint(hex, shine));
  m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scale);
  if (outline) {
    const o = new THREE.Mesh(geom, inkMat);
    // 描边：把背面放大一点点（按网格大小折算，细的胳膊腿也不会糊成一团）
    geom.computeBoundingSphere();
    const k = 1 + outline / Math.max(0.03, geom.boundingSphere.radius);
    o.scale.setScalar(k);
    m.add(o);
  }
  parent.add(m);
  return m;
}
const bone = (parent, pos = [0, 0, 0]) => { const b = new THREE.Group(); b.position.set(...pos); parent.add(b); return b; };

const G = {
  capsule: (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10),
  sphere: (r, ws = 16, hs = 12, ts = 0, tl = Math.PI, ps = 0, pl = Math.PI * 2) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl),
  // 头发的后脑勺 + 两侧：跳过脸那一块（three 的球面 phi = π/2 是 +Z 正前方）
  hairShell: (r, tl) => new THREE.SphereGeometry(r, 18, 10, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, tl),
  cyl: (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  lathe: (pts, s = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), s),
  torus: (r, t, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, 16, arc),
};

// ───────────── 帽子（程序小人和 AI 模型共用） ─────────────
// 尺寸按程序小人的头做：头骨中心在 (0, HAT_SKULL_Y, 0)、半径 HAT_SKULL_R。挂到 AI 模型上时按它的头宽缩放。
const HAT_SKULL_Y = 0.1; const HAT_SKULL_R = 0.105;
export const HATS = ['cap', 'fedora', 'tophat', 'beanie'];
function addHat(head, kind, hatC) {
  if (kind === 'cap') {
    part(head, G.sphere(0.11, 16, 8, 0, Math.PI * 0.5), hatC, { pos: [0, 0.1, 0], scale: [1.05, 0.75, 1.12] });
    part(head, G.box(0.17, 0.014, 0.08), shade(hatC, -0.1), { pos: [0, 0.115, 0.12], rot: [0.15, 0, 0] });
  } else if (kind === 'fedora') {
    part(head, G.cyl(0.24, 0.24, 0.012, 20), hatC, { pos: [0, 0.15, 0] });
    part(head, G.cyl(0.09, 0.108, 0.12, 16), hatC, { pos: [0, 0.21, 0] });
    part(head, G.cyl(0.11, 0.11, 0.025, 16, true), shade(hatC, -0.3), { pos: [0, 0.165, 0], outline: 0 });
  } else if (kind === 'tophat') {
    part(head, G.cyl(0.2, 0.2, 0.012, 20), hatC, { pos: [0, 0.155, 0] });
    part(head, G.cyl(0.095, 0.09, 0.24, 16), hatC, { pos: [0, 0.28, 0] });
  } else if (kind === 'beanie') {
    part(head, G.sphere(0.113, 16, 10, 0, Math.PI * 0.55), hatC, { pos: [0, 0.085, 0], scale: [1, 1.2, 1.05] });
    part(head, G.torus(0.106, 0.02), shade(hatC, -0.1), { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] });
  }
}

// ───────────── 底模 + 衣服 ─────────────
const SHIRT = '#d6cfbf';
const STOCKING = '#2a2522';

/** 按搭配搭一个小人。返回 { root, pose(phase, walking) }。正面朝 +Z，脚底在 y=0，身高约 1.78。 */
export function buildCharacter(o) {
  const root = new THREE.Group();
  const hips = bone(root, [0, 0.99, 0]);
  const spine = bone(hips, [0, 0.04, 0]);
  const head = bone(spine, [0, 0.6, 0]);
  const legBottom = o.bottom === 'skirt' ? STOCKING : o.bottomColor;
  const wide = o.bottom === 'work' ? 0.016 : 0;

  // 躯干（上衣颜色；马甲款的里面是衬衫，外面单独套马甲）
  const torsoColor = o.top === 'vest' ? SHIRT : o.topColor;
  const leather = o.top === 'jacket' ? 0.9 : 0.15;
  part(spine, G.lathe([[0.001, -0.02], [0.135, 0], [0.128, 0.16], [0.168, 0.36], [0.185, 0.45], [0.12, 0.52], [0.001, 0.53]]), torsoColor, { scale: [1, 1, 0.62], shine: leather });
  part(hips, G.sphere(0.16, 14, 10), o.bottom === 'skirt' ? o.bottomColor : o.bottomColor, { scale: [1, 0.62, 0.72] });
  part(spine, G.cyl(0.045, 0.05, 0.1), o.skin, { pos: [0, 0.56, 0] });
  // 头
  part(head, G.sphere(0.094, 18, 14), o.skin, { pos: [0, 0.07, 0], scale: [1, 1.17, 1.07], shine: 0.25 });
  part(head, G.cyl(0.004, 0.018, 0.045, 6), o.skin, { pos: [0, 0.06, 0.1], rot: [Math.PI / 2, 0, 0] }); // 鼻子
  for (const x of [-0.034, 0.034]) part(head, G.sphere(0.009, 8, 6), '#1d1b19', { pos: [x, 0.085, 0.088] }); // 眼睛

  // 胳膊：肩 → 上臂 → 肘 → 前臂 → 手。袖子按上衣款式
  const sleeve = o.top === 'vest' ? SHIRT : o.topColor;
  const arm = (side) => {
    const sh = bone(spine, [0.215 * side, 0.43, 0]);
    part(sh, G.sphere(0.052, 12, 10), sleeve, { shine: leather, pos: [-0.012 * side, -0.03, 0], scale: [1, 0.9, 0.9] });
    part(sh, G.capsule(0.047, 0.22), sleeve, { shine: leather, pos: [0, -0.15, 0] });
    const el = bone(sh, [0, -0.29, 0]);
    part(el, G.capsule(0.042, 0.2), sleeve, { shine: leather, pos: [0, -0.12, 0] });
    if (o.top === 'coat' || o.top === 'sweater') part(el, G.cyl(0.05, 0.05, 0.04, 12), o.top === 'coat' ? shade(o.topColor, -0.15) : o.topColor, { pos: [0, -0.22, 0] }); // 袖口
    part(el, G.sphere(0.036, 10, 8), o.skin, { pos: [0, -0.26, 0], scale: [0.9, 1.25, 0.75] });
    return { sh, el };
  };
  const armL = arm(1); const armR = arm(-1);

  // 腿：大腿 → 膝 → 小腿 → 脚
  const leg = (side) => {
    const th = bone(hips, [0.085 * side, -0.02, 0]);
    part(th, G.capsule(0.064 + wide, 0.33), legBottom, { pos: [0, -0.22, 0] });
    const kn = bone(th, [0, -0.46, 0]);
    part(kn, G.capsule(0.05 + wide, 0.35), legBottom, { pos: [0, -0.215, 0] });
    if (o.bottom === 'work') part(kn, G.cyl(0.073, 0.073, 0.05, 12), shade(o.bottomColor, -0.12), { pos: [0, -0.4, 0] }); // 卷边
    const ft = bone(kn, [0, -0.47, 0]);
    const bulky = o.shoes === 'work' ? 1.18 : 1;
    part(ft, G.capsule(0.048 * bulky, 0.12 * bulky), o.shoesColor, { pos: [0, -0.012, 0.045], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.72], shine: 1 }); // 圆头鞋
    if (o.shoes === 'boots' || o.shoes === 'work') part(kn, G.cyl(0.062, 0.058, o.shoes === 'boots' ? 0.2 : 0.12, 12), o.shoesColor, { pos: [0, o.shoes === 'boots' ? -0.37 : -0.41, 0], shine: 1 });
    return { th, kn, ft };
  };
  const legL = leg(1); const legR = leg(-1);

  // 上衣款式
  const panels = [];
  if (o.top === 'coat') {
    // 长风衣：翻领 + 腰带 + 三片下摆（前两片跟着腿摆）
    part(spine, G.torus(0.09, 0.025, Math.PI * 1.3), shade(o.topColor, 0.08), { pos: [0, 0.5, 0.02], rot: [Math.PI / 2.2, 0, Math.PI * 0.85] });
    part(spine, G.cyl(0.142, 0.142, 0.035, 16), shade(o.topColor, -0.25), { pos: [0, 0.03, 0], scale: [1, 1, 0.66] });
    for (const [x, z, w, follow] of [[0.075, 0.07, 0.15, legL], [-0.075, 0.07, 0.15, legR], [0, -0.075, 0.3, null]]) {
      const pv = bone(hips, [x, 0.02, z]);
      part(pv, G.box(w, 0.6, 0.025), o.topColor, { pos: [0, -0.3, 0], rot: [z > 0 ? -0.05 : 0.08, 0, 0] });
      panels.push({ pv, follow, back: z < 0 });
    }
  } else if (o.top === 'jacket') {
    part(spine, G.lathe([[0.15, -0.09], [0.17, -0.02], [0.155, 0.06]]), o.topColor, { scale: [1, 1, 0.68] });
    part(spine, G.torus(0.075, 0.022, Math.PI * 1.2), shade(o.topColor, 0.1), { pos: [0, 0.5, 0.02], rot: [Math.PI / 2.2, 0, Math.PI * 0.9] });
  } else if (o.top === 'sweater') {
    part(spine, G.cyl(0.062, 0.066, 0.07, 14), o.topColor, { pos: [0, 0.535, 0] }); // 高领
    part(spine, G.cyl(0.15, 0.15, 0.05, 16), shade(o.topColor, -0.1), { pos: [0, 0.0, 0], scale: [1, 1, 0.66] });
  } else if (o.top === 'vest') {
    part(spine, G.lathe([[0.145, -0.01], [0.14, 0.16], [0.175, 0.36], [0.17, 0.43]], 16), o.topColor, { scale: [1.02, 1, 0.68] });
    part(spine, G.torus(0.055, 0.016, Math.PI * 1.4), SHIRT, { pos: [0, 0.52, 0.015], rot: [Math.PI / 2.1, 0, Math.PI * 0.8] }); // 衬衫领
  }

  // 下装：长裙另外挂一个裙摆（不跟腿走，做宽一点免得穿模）
  if (o.bottom === 'skirt') part(hips, G.lathe([[0.15, 0.04], [0.17, -0.2], [0.22, -0.6], [0.23, -0.66]], 18), o.bottomColor, { pos: [0, 0, 0] });

  // 发型
  const hairC = o.hairColor;
  if (o.hair !== 'bald') {
    const top = o.hair === 'slick' ? 0.27 : 0.33;
    part(head, G.sphere(0.104, 16, 8, 0, Math.PI * top), hairC, { pos: [0, 0.078, -0.006], scale: [1.02, 1.12, 1.08] });             // 顶上
    part(head, G.hairShell(0.105, Math.PI * (o.hair === 'long' ? 0.62 : 0.52)), hairC, { pos: [0, 0.075, -0.004], scale: [1.03, 1.12, 1.08] }); // 后脑和两侧
  }
  if (o.hair === 'long') part(head, G.box(0.21, 0.24, 0.05), hairC, { pos: [0, -0.06, -0.085], rot: [0.12, 0, 0] });
  if (o.hair === 'bun') part(head, G.sphere(0.05, 10, 8), hairC, { pos: [0, 0.16, -0.08] });

  addHat(head, o.hat, o.hatColor);

  // 配饰
  const accC = o.accColor;
  if (o.acc === 'scarf') {
    part(spine, G.torus(0.075, 0.035), accC, { pos: [0, 0.52, 0], rot: [Math.PI / 2, 0, 0] });
    part(spine, G.box(0.06, 0.22, 0.025), accC, { pos: [0.05, 0.38, 0.115], rot: [0.12, 0, -0.1] });
  } else if (o.acc === 'tie') {
    part(spine, G.box(0.035, 0.24, 0.012), accC, { pos: [0, 0.37, 0.118], rot: [0.05, 0, 0] });
  } else if (o.acc === 'glasses') {
    for (const x of [-0.04, 0.04]) part(head, G.torus(0.022, 0.004), "#1d1b19", { pos: [x, 0.085, 0.1], outline: 0 });
  } else if (o.acc === 'satchel') {
    part(spine, G.box(0.03, 0.62, 0.012), shade(accC, -0.2), { pos: [0, 0.24, 0.11], rot: [0, 0, 0.62] });
    part(hips, G.box(0.2, 0.16, 0.07), accC, { pos: [-0.17, -0.06, 0.04] });
  }

  /** 摆姿势：phase ∈ [0,1) 是走路周期里的位置。 */
  const pose = (phase, walking) => {
    const s = Math.sin(phase * Math.PI * 2);
    const c = Math.cos(phase * Math.PI * 2);
    const sw = walking ? 1 : 0;
    legL.th.rotation.x = -s * 0.48 * sw;
    legR.th.rotation.x = s * 0.48 * sw;
    legL.kn.rotation.x = sw * Math.max(0, Math.sin(phase * Math.PI * 2 - 1.2)) * 0.75;
    legR.kn.rotation.x = sw * Math.max(0, -Math.sin(phase * Math.PI * 2 - 1.2)) * 0.75;
    legL.ft.rotation.x = -legL.kn.rotation.x * 0.3;
    legR.ft.rotation.x = -legR.kn.rotation.x * 0.3;
    armL.sh.rotation.set(s * 0.42 * sw, 0, -0.07);
    armR.sh.rotation.set(-s * 0.42 * sw, 0, 0.07);
    armL.el.rotation.x = -0.18 - (walking ? Math.max(0, s) * 0.3 : 0);
    armR.el.rotation.x = -0.18 - (walking ? Math.max(0, -s) * 0.3 : 0);
    hips.position.y = 0.99 + (walking ? Math.abs(c) * 0.03 - 0.02 : 0);
    spine.rotation.set(walking ? 0.06 : 0.02, s * 0.09 * sw, 0);
    head.rotation.set(-0.04, -s * 0.05 * sw, 0);
    for (const p of panels) p.pv.rotation.x = p.follow ? p.follow.th.rotation.x * 0.55 : (walking ? 0.12 + Math.abs(s) * 0.06 : 0.05);
  };
  pose(0, false);
  return { root, pose };
}

// ───────────── AI 生成的模型（glb） ─────────────
// 网格是一整块蒙皮网格，贴图是概念图投影上去的（笔触已经在贴图里），着色器只加一点冷暗部 / 暖亮部。
export const GLB_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('avatar3d') === 'glb';

const SKIN_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SKIN_FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec3 uLight; uniform vec3 uCloth; uniform float uClothAmt;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 base = texture2D(uMap, vUv).rgb;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  // 暖色（皮肤、皮革、头发、红围巾）：R > G > B。这些保留原色，不跟着换衣服颜色、也不压冷
  float warm = clamp((base.r - base.b - 0.03) * 9.0, 0.0, 1.0) * clamp((base.r - base.g) * 14.0 + 0.6, 0.0, 1.0);
  // 每个人的衣服颜色：冷色、灰色的布料（外套、裤子、衬衫）按亮度染成这个人的颜色，一眼分得出谁是谁
  float cl = dot(uCloth, vec3(0.299, 0.587, 0.114));
  vec3 dyed = uCloth * (lum / max(0.08, cl));
  base = mix(base, clamp(dyed, 0.0, 1.0), uClothAmt * (1.0 - warm) * smoothstep(0.03, 0.12, lum));
  vec3 n = normalize(vN);
  float l = clamp((dot(n, uLight) + 0.5) / 1.5, 0.0, 1.0);
  l = smoothstep(0.1, 0.9, l);
  // 贴图本身已经画了明暗，这里只轻轻加一层：暗部微冷、亮部暖（以前暗部压得太蓝，脸发青像僵尸）
  vec3 c = base * mix(vec3(0.88, 0.87, 0.92), vec3(1.16, 1.09, 1.0), l);
  // 皮肤再暖一点、饱和一点：有血色
  vec3 g = vec3(dot(c, vec3(0.299, 0.587, 0.114)));
  c = mix(c, mix(g, c, 1.35) * vec3(1.06, 0.99, 0.93), warm * 0.8);
  c *= 0.92 + 0.08 * smoothstep(0.0, 1.4, vW.y);   // 下半身略暗
  gl_FragColor = vec4(c, 1.0);
}`;
// 描边：背面外扩（在蒙皮之前沿法线推出去，跟着骨骼动）
const skinInk = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
skinInk.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normal * 0.014;');
};

const gltfCache = new Map();
const loadGltf = (url) => {
  if (!gltfCache.has(url)) gltfCache.set(url, new GLTFLoader().loadAsync(url));
  return gltfCache.get(url);
};

/** 加载 glb 搭一个小人：{ root, sample(动作名, 第几秒) }。正面朝 +Z，脚底 y=0。动作是 Mixamo 的，已经去掉了向前的位移。 */
/** cloth：这个人的衣服颜色（'#rrggbb'，不给就用模型原色）。 */
export async function buildGlbCharacter(url, { hat = null, hatColor = '#2a211c', cloth = null, clothAmt = 0.8 } = {}) {
  const gltf = await loadGltf(url);
  const root = new THREE.Group();
  const model = cloneSkinned(gltf.scene);
  root.add(model);
  const skinned = [];
  model.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  for (const m of skinned) {
    const map = m.material.map;
    map.colorSpace = THREE.NoColorSpace;   // 和整个文件一样：颜色按原样当 sRGB 用
    m.material = new THREE.ShaderMaterial({
      vertexShader: SKIN_VERT, fragmentShader: SKIN_FRAG,
      uniforms: { uMap: { value: map }, uLight: { value: LIGHT }, uCloth: { value: new THREE.Color(cloth ?? '#808080') }, uClothAmt: { value: cloth ? clothAmt : 0 } },
    });
    m.frustumCulled = false;
    const ink = new THREE.SkinnedMesh(m.geometry, skinInk);
    ink.frustumCulled = false;
    ink.bind(m.skeleton, m.bindMatrix);
    m.add(ink);
  }
  // 配件：硬的东西挂在骨头上，跟着动作走，所有体型通用。帽子挂头骨：从静止姿势的网格量出头顶和头宽
  if (hat) {
    model.updateMatrixWorld(true);
    const head = [];
    let top = -Infinity;
    const v = new THREE.Vector3();
    for (const m of skinned) {
      const pos = m.geometry.attributes.position;
      // 蒙皮网格的顶点要先过一遍骨骼（getVertexPosition），原始坐标不是摆好的样子
      for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); head.push(v.clone()); if (v.y > top) top = v.y; }
    }
    const cap = head.filter((p) => p.y > top - 0.12);
    const xs = cap.map((p) => p.x); const zs = cap.map((p) => p.z);
    const r = Math.min(0.15, (Math.max(...xs) - Math.min(...xs)) / 2);
    const k = Math.min(1.08, r / HAT_SKULL_R); // 头发蓬的人量出来偏大，帽子别跟着变成大草帽
    const g = new THREE.Group();
    g.scale.setScalar(k);
    // 帽子扣在头顶往下 0.8 个头骨半径处（压一点头发，不遮眼睛）
    g.position.set((Math.max(...xs) + Math.min(...xs)) / 2, top - HAT_SKULL_R * k * 0.8 - HAT_SKULL_Y * k, zs.reduce((a, b) => a + b, 0) / zs.length);
    addHat(g, hat, hatColor);
    root.add(g);
    root.updateMatrixWorld(true);
    let headBone = null;
    model.traverse((o) => { if (o.isBone && /Head$/.test(o.name) && !headBone) headBone = o; });
    if (headBone) headBone.attach(g);
  }
  const mixer = new THREE.AnimationMixer(model);
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  let cur = null;
  const sample = (name, time) => {
    if (!clips[name]) return;
    if (cur !== name) { mixer.stopAllAction(); mixer.clipAction(clips[name]).play(); cur = name; }
    mixer.setTime(time);
    model.updateMatrixWorld(true);
  };
  return { root, sample, model, mixer, clips };
}

/**
 * glb 图集的分段：[动作名, 帧数, 第 i 帧取动作的第几秒]，外加地图上要用的数据（米）。
 * 起步、停步只取中间真正在加速 / 减速的那一段（Mixamo 原片前后各有一秒多站着不动），按速度曲线自动找。
 */
/** 起步、停步、跑步起步里真正在加速 / 减速的那一段（帧号）。实时渲染也用（liveWindows）。 */
function clipWindows(meta) {
  const { fps, clips: M } = meta;
  const speeds = (d) => d.slice(1).map((v, i) => (v - d[i]) * fps);
  const walkV = M.walk.speed;
  const st = speeds(M.start.dist);
  const s0 = st.findIndex((v) => v > 0.1);
  const s1 = st.findIndex((v, i) => i > s0 && v >= 0.9 * walkV);
  const sp = speeds(M.stop.dist);
  const p1 = sp.findIndex((v, i) => i > 10 && v < 0.03);
  const p0 = sp.findLastIndex((v, i) => i < p1 && v >= 0.8 * walkV);
  const rs = M.runStart?.dist ? speeds(M.runStart.dist) : null;
  const r0 = rs ? Math.max(0, rs.findIndex((x) => x > 0.3)) : 0;
  return { s0, s1, p0, p1, r0, r1: rs ? rs.length : 0 };
}

/**
 * 实时渲染用的动作数据（秒）：起步 / 停步 / 跑步起步的片段起点和长度，走 / 跑的步幅和速度，待机、小动作的长度。
 */
export function liveWindows(meta) {
  const { fps, clips: M } = meta;
  const { s0, s1, p0, p1, r0, r1 } = clipWindows(meta);
  const cyc = (k) => M[k].frames / fps;
  return {
    start: { t0: s0 / fps, dur: (s1 - s0) / fps },
    stop: { t0: p0 / fps, dur: (p1 - p0) / fps },
    runStart: M.runStart ? { t0: r0 / fps, dur: (r1 - r0) / fps } : null,
    walk: { dur: cyc('walk'), stride: M.walk.stride, speed: M.walk.speed },
    run: { dur: cyc('run'), stride: M.run.stride, speed: M.run.speed },
    idle: { dur: cyc('idle') },
    fidgets: ['shift', 'rub', 'look'].filter((k) => M[k]).map((k) => ({ name: k, dur: cyc(k) })),
  };
}

function glbLayout(meta) {
  const { fps, clips: M } = meta;
  const { s0, s1, p0, p1 } = clipWindows(meta);
  const cyc = (k) => M[k].frames / fps;
  const win = (a, b, n) => (i) => (a + ((i + 0.5) / n) * (b - a)) / fps;
  // 帧数按显存省着用：一个人物一张图集，15 个人同时在场（34 列 × 8 向 ≈ 3264×1024，约 13MB 显存一张）
  const loop = (k, n) => ({ name: k, n, at: (i) => (i / n) * cyc(k) });
  return [
    { ...loop('idle', 4), dur: cyc('idle') },
    { ...loop('walk', 8), stride: M.walk.stride, speed: M.walk.speed },
    { ...loop('run', 6), stride: M.run.stride, speed: M.run.speed },
    { name: 'start', n: 4, at: win(s0, s1, 4), dur: (s1 - s0) / fps },
    { name: 'stop', n: 4, at: win(p0, p1, 4), dur: (p1 - p0) / fps },
    ...runWindows(M, fps, win),
    // 站着时偶尔做的小动作：两脚倒换重心、搓肩、四处看。单独放第二张图（band 1），主图别超过显卡的最大宽度
    ...['shift', 'rub', 'look'].filter((k) => M[k]).map((k) => ({ name: k, n: 8, band: 1, at: (i) => ((i + 0.5) / 8) * cyc(k), dur: cyc(k) })),
  ];
}

/** 跑步的起步（站着到冲出去）、急停：从开始加速到片尾 / 从片头到停稳。没导出这两段的模型就没有。 */
function runWindows(M, fps, win) {
  const out = [];
  const sp = (d) => d.slice(1).map((v, i) => (v - d[i]) * fps);
  if (M.runStart?.dist) {
    const v = sp(M.runStart.dist);
    const a = Math.max(0, v.findIndex((x) => x > 0.3)); const b = v.length;
    out.push({ name: 'runStart', n: 4, at: win(a, b, 4), dur: (b - a) / fps });
  }
  if (M.runStop?.dist) {
    const v = sp(M.runStop.dist);
    const b = v.findIndex((x, i) => i > 2 && x < 0.35); const e = b > 0 ? b : v.length;
    out.push({ name: 'runStop', n: 4, at: win(0, e, 4), dur: e / fps });
  }
  return out;
}

/** 颜色变亮（k>0）或变暗（k<0）。 */
function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + k)));
  return `#${c.getHexString()}`;
}

// ───────────── 渲染器（全局一个，离屏） ─────────────
let renderer = null; let scene = null; let camera = null;
export const CAM_HALF = 1.22;   // 一帧高 2·CAM_HALF 米

/** 等距相机（一帧 FRAME_W × FRAME_H）：仰角 30°、从地图的东南方向往西北看。烘焙和实时渲染共用。 */
export function isoCamera() {
  const half = CAM_HALF;
  const cam = new THREE.OrthographicCamera(-half * FRAME_W / FRAME_H, half * FRAME_W / FRAME_H, half, -half, 0.1, 50);
  const D = 10;
  cam.position.set(-D * Math.SQRT1_2, D * Math.tan(Math.PI / 6), -D * Math.SQRT1_2);
  cam.lookAt(0, 0.9, 0);
  cam.updateMatrixWorld(); // 马上算好矩阵：实时渲染一建好就要拿它算脚底锚点（烘焙时是渲染过一次才算的）
  return cam;
}
/** 脚底在一帧里的位置（0–1，贴图锚点用）。 */
export function footAnchorOf(cam) {
  const v = new THREE.Vector3(0, 0, 0).project(cam);
  return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
}
function setup() {
  if (renderer) return true;
  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch { return false; }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  // 等距相机：仰角 30°、从地图的东南方向往西北看（地图 +x = three −X，地图 +y = three −Z）
  camera = isoCamera();
  return true;
}

/** 脚底在一帧里的像素位置（贴图锚点用）。 */
function footAnchor() { return footAnchorOf(camera); }

// ───────────── 烘焙 ─────────────
const sheets = new Map(); // outfitKey 或 glb:<模型> → Promise<{ canvas, anchor, … }>
// 烘焙排队：大家共用一个离屏渲染器和场景，两套同时烘焙会把两个人画进同一张图（身上叠着另一个人）
let bakeQueue = Promise.resolve();

/**
 * 烘焙一套搭配：图集 DIRS 行，每格 FRAME_W × FRAME_H，第 k 行朝向地图角度 k·45°。同样的搭配只烘焙一次。
 * 列按动作分段，返回的 anims 记每段 { col, n, band（在第几张图：canvases[band]）, … }：程序搭的小人只有 idle（1 帧）和 walk（8 帧）；glb 见 glbLayout。
 * pxPerMeter：一帧里 1 米多少像素（地图换算步幅用）；height：人物多高（米，头像挂多高用）。
 * glb 模式按人物形象 char 选模型（modelFor），同一个模型只烘焙一次。
 */
export function bakeSheet(outfit, char = null, glb = GLB_MODE) {
  const model = glb ? modelFor(char) : null;
  // 打样：网址带 &hat=cap|fedora|tophat|beanie 时所有 AI 模型都戴上（试配件挂骨头），预览页也能点
  const hat = glb ? (outfit?.glbHat ?? new URLSearchParams(location.search).get('hat')) || null : null;
  const key = glb ? `glb:${model}:${hat}` : outfitKey(outfit);
  if (!sheets.has(key)) sheets.set(key, (bakeQueue = bakeQueue.catch(() => {}).then(async () => {
    if (!setup()) return null;
    // glb 细节多：两倍分辨率渲染再缩小，边缘干净
    const SS = glb ? 2 : 1;
    renderer.setSize(FRAME_W * SS, FRAME_H * SS, false);
    let ch; let layout;
    let height = 1.8;
    if (glb) {
      const { url, meta } = MODELS[model];
      const g = await buildGlbCharacter(url, { hat });
      ch = g; layout = glbLayout(meta).map((s) => ({ ...s, put: (i) => g.sample(s.name, s.at(i)) }));
      height = meta.height ?? 1.85;
    } else {
      ch = buildCharacter(outfit);
      layout = [
        { name: 'idle', n: 1, dur: 1, put: () => ch.pose(0, false) },
        { name: 'walk', n: WALK_FRAMES, stride: 1.3, speed: 1.3 / 0.34, put: (i) => ch.pose(i / WALK_FRAMES, true) },
      ];
    }
    scene.add(ch.root);
    const anims = {};
    const cols = [0, 0];
    for (const s of layout) { const b = s.band ?? 0; anims[s.name] = { col: cols[b], n: s.n, band: b, dur: s.dur, stride: s.stride, speed: s.speed }; cols[b] += s.n; }
    const canvases = cols.filter((n) => n).map((n) => { const c = document.createElement('canvas'); c.width = n * FRAME_W; c.height = DIRS * FRAME_H; return c; });
    const ctxs = canvases.map((c) => c.getContext('2d'));
    for (let d = 0; d < DIRS; d++) {
      // 相机在 (−X, −Z) 那边，对应地图的东南（屏幕下方，离人近）；所以地图 +x = three −X、地图 +y = three −Z。
      // 地图角度 θ 的方向在 three 里是 (X, Z) = (−cosθ, −sinθ)，模型正面 +Z 转过去：rotation.y = −θ − 90°。
      // （以前写成 rotation.y = θ，朝屏幕下方走的人露的是后背，像倒着走）
      ch.root.rotation.y = -d * Math.PI / 4 - Math.PI / 2;
      for (const s of layout) {
        for (let i = 0; i < s.n; i++) {
          s.put(i);
          renderer.render(scene, camera);
          ctxs[anims[s.name].band].drawImage(renderer.domElement, (anims[s.name].col + i) * FRAME_W, d * FRAME_H, FRAME_W, FRAME_H);
        }
      }
      await new Promise((r) => setTimeout(r, 0)); // 让出主线程，别卡住画面
    }
    scene.remove(ch.root);
    for (const c of canvases) await oilPaint(c.getContext('2d'), c.width, c.height);
    return { canvas: canvases[0], canvases, anchor: footAnchor(), anims, pxPerMeter: FRAME_H / (2 * CAM_HALF), height };
  })));
  return sheets.get(key);
}

/** 油画滤镜（Kuwahara，半径 1）：把边缘清楚的色块抹成一笔一笔的感觉。只动不透明的像素。
 * 图集有几百万像素，一口气算完会卡住画面一两秒：每算 64 行让出一次主线程。 */
async function oilPaint(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data; const out = new Uint8ClampedArray(src);
  const R = 1;
  for (let y = R; y < h - R; y++) {
    if (y % 64 === 0) await new Promise((r) => setTimeout(r, 0));
    for (let x = R; x < w - R; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] < 8) continue;
      let best = Infinity; let br = 0; let bg = 0; let bb = 0;
      for (const [qx, qy] of [[-R, -R], [0, -R], [-R, 0], [0, 0]]) {
        let sr = 0; let sg = 0; let sb = 0; let sl = 0; let sl2 = 0; let n = 0;
        for (let dy = 0; dy <= R; dy++) for (let dx = 0; dx <= R; dx++) {
          const j = ((y + qy + dy) * w + (x + qx + dx)) * 4;
          if (src[j + 3] < 8) continue;
          const l = src[j] * 0.3 + src[j + 1] * 0.59 + src[j + 2] * 0.11;
          sr += src[j]; sg += src[j + 1]; sb += src[j + 2]; sl += l; sl2 += l * l; n++;
        }
        if (!n) continue;
        const v = sl2 / n - (sl / n) ** 2;
        if (v < best) { best = v; br = sr / n; bg = sg / n; bb = sb / n; }
      }
      out[i] = br; out[i + 1] = bg; out[i + 2] = bb;
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}

/** 大厅衣柜的实时预览：在 canvas 上转着画这套搭配。返回停止函数。 */
export function previewLoop(canvas, getOutfit) {
  let r;
  try { r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch { return () => {}; }
  r.outputColorSpace = THREE.LinearSRGBColorSpace;
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const sc = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-0.75, 0.75, 1.0, -1.0, 0.1, 50);
  cam.position.set(-7, 7 * Math.tan(Math.PI / 9), -7);
  cam.lookAt(0, 0.92, 0);
  let key = null; let ch = null; let raf = 0; const t0 = performance.now();
  const frame = () => {
    const o = getOutfit();
    const k = outfitKey(o);
    if (k !== key) { if (ch) sc.remove(ch.root); ch = buildCharacter(o); sc.add(ch.root); key = k; }
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * r.getPixelRatio())) { r.setSize(w, h, false); const a = w / h; cam.left = -a; cam.right = a; cam.updateProjectionMatrix(); }
    const t = (performance.now() - t0) / 1000;
    ch.root.rotation.y = t * 0.6;
    ch.pose((t * 1.1) % 1, true);
    r.render(sc, cam);
    raf = requestAnimationFrame(frame);
  };
  frame();
  return () => { cancelAnimationFrame(raf); r.dispose(); };
}
