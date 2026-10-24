// 3D 小人（极乐迪斯科式：3D 人物 + 手绘背景）。
// · 一个通用底模：骨骼是嵌套的 Object3D（髋 → 脊柱 → 头 / 肩 → 上臂 → 前臂；髋 → 大腿 → 小腿 → 脚），每段身体是挂在骨骼上的网格。
// · 衣服是另外挂到骨骼上的网格（发型、帽子、上衣、下装、鞋、配饰），颜色可调。
// · 画风：自定义着色器——三段色阶 + 冷色阴影 + 笔触噪点 + 边缘光，外加深色描边；烘焙后再过一道油画（Kuwahara）滤镜。
// · 地图上不实时渲染 3D：每套搭配烘焙一张图集（8 个朝向 × [站立 + 8 帧走路]），小人播放图集里的帧。
import * as THREE from 'three';
import { outfitKey } from '../../../src/shared/outfit.js';

THREE.ColorManagement.enabled = false; // 颜色按原样当 sRGB 用（画出来和色板一致）

export const FRAME_W = 96;
export const FRAME_H = 128;
export const DIRS = 8;          // 朝向：第 k 个 = 地图上的角度 k·45°（0 = 地图 +x 方向）
export const WALK_FRAMES = 8;   // 走路一个周期几帧（图集第 0 列是站立）
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

  // 帽子
  const hatC = o.hatColor;
  if (o.hat === 'cap') {
    part(head, G.sphere(0.11, 16, 8, 0, Math.PI * 0.5), hatC, { pos: [0, 0.1, 0], scale: [1.05, 0.75, 1.12] });
    part(head, G.box(0.17, 0.014, 0.08), shade(hatC, -0.1), { pos: [0, 0.115, 0.12], rot: [0.15, 0, 0] });
  } else if (o.hat === 'fedora') {
    part(head, G.cyl(0.24, 0.24, 0.012, 20), hatC, { pos: [0, 0.15, 0] });
    part(head, G.cyl(0.09, 0.108, 0.12, 16), hatC, { pos: [0, 0.21, 0] });
    part(head, G.cyl(0.11, 0.11, 0.025, 16, true), shade(hatC, -0.3), { pos: [0, 0.165, 0], outline: 0 });
  } else if (o.hat === 'tophat') {
    part(head, G.cyl(0.2, 0.2, 0.012, 20), hatC, { pos: [0, 0.155, 0] });
    part(head, G.cyl(0.095, 0.09, 0.24, 16), hatC, { pos: [0, 0.28, 0] });
  } else if (o.hat === 'beanie') {
    part(head, G.sphere(0.113, 16, 10, 0, Math.PI * 0.55), hatC, { pos: [0, 0.085, 0], scale: [1, 1.2, 1.05] });
    part(head, G.torus(0.106, 0.02), shade(hatC, -0.1), { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] });
  }

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

/** 颜色变亮（k>0）或变暗（k<0）。 */
function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + k)));
  return `#${c.getHexString()}`;
}

// ───────────── 渲染器（全局一个，离屏） ─────────────
let renderer = null; let scene = null; let camera = null;
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
  // 等距相机：仰角 30°、从地图的西北方向往东南看（three 的 X = 地图 y，Z = 地图 x）
  const half = 1.22;
  camera = new THREE.OrthographicCamera(-half * FRAME_W / FRAME_H, half * FRAME_W / FRAME_H, half, -half, 0.1, 50);
  const D = 10;
  camera.position.set(-D * Math.SQRT1_2, D * Math.tan(Math.PI / 6), -D * Math.SQRT1_2);
  camera.lookAt(0, 0.9, 0);
  return true;
}

/** 脚底在一帧里的像素位置（贴图锚点用）。 */
function footAnchor() {
  const v = new THREE.Vector3(0, 0, 0).project(camera);
  return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
}

// ───────────── 烘焙 ─────────────
const sheets = new Map(); // outfitKey → Promise<{ canvas, anchor }>

/**
 * 烘焙一套搭配：图集 (1 + WALK_FRAMES) 列 × DIRS 行，每格 FRAME_W × FRAME_H。
 * 第 k 行朝向地图角度 k·45°；第 0 列站立，之后是走路的各帧。同样的搭配只烘焙一次。
 */
export function bakeSheet(outfit) {
  const key = outfitKey(outfit);
  if (!sheets.has(key)) sheets.set(key, (async () => {
    if (!setup()) return null;
    renderer.setSize(FRAME_W, FRAME_H, false);
    const ch = buildCharacter(outfit);
    scene.add(ch.root);
    const cols = 1 + WALK_FRAMES;
    const atlas = document.createElement('canvas');
    atlas.width = cols * FRAME_W; atlas.height = DIRS * FRAME_H;
    const ctx = atlas.getContext('2d');
    for (let d = 0; d < DIRS; d++) {
      // 地图角度 θ 的方向在 three 里是 (X, Z) = (sinθ, cosθ)，模型正面 +Z 转过去就是 rotation.y = θ
      ch.root.rotation.y = d * Math.PI / 4;
      for (let f = 0; f < cols; f++) {
        ch.pose(f === 0 ? 0 : (f - 1) / WALK_FRAMES, f > 0);
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, f * FRAME_W, d * FRAME_H);
      }
      await new Promise((r) => setTimeout(r, 0)); // 让出主线程，别卡住画面
    }
    scene.remove(ch.root);
    oilPaint(ctx, atlas.width, atlas.height);
    return { canvas: atlas, anchor: footAnchor() };
  })());
  return sheets.get(key);
}

/** 油画滤镜（Kuwahara，半径 1）：把边缘清楚的色块抹成一笔一笔的感觉。只动不透明的像素。 */
function oilPaint(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data; const out = new Uint8ClampedArray(src);
  const R = 1;
  for (let y = R; y < h - R; y++) {
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
