// 实时渲染的 3D 小人（设置里「人物：实时 3D」）：每帧把画面里的每个人用 3D 模型真画一遍，不再播烘焙好的几帧图。
// · 动作满帧，动作之间交叉淡入淡出（走 ↔ 跑、停下 → 待机都是平滑过渡），转身是连续转过去的（不再只有 8 个朝向）。
// · 所有人画在同一张小画布上（每人一格），地图（Pixi）把这张画布当一张贴图，每格切给一个小人。
// · 油画滤镜（Kuwahara）挪到显卡上做（后处理的着色器），顺便套上地图的色调（和房子一样）。
// · 显存只要模型本身（每人约 2MB），比烘焙图集（每人 10–20MB）省；也不用等烘焙。
import * as THREE from 'three';
import { buildGlbCharacter, modelInfo, liveWindows, isoCamera, footAnchorOf, FRAME_W, FRAME_H } from './avatar3d.js';

const COLS = 4; const ROWS = 4; // 一张画布 16 格，够 15 人一局
const START_T = 0.3; const RUN_START_T = 0.36; // 和 World.js 一样：起步 / 跑步起步在地图上占几秒
const MAX_RATE = { walk: 2, run: 1.6 };      // 地图上太快时步频最多加快几倍，多出来的让脚滑
const FIDGET_GAP = [6, 9]; const FIDGET_SPEED = 1.4;
const TURN = 9;                              // 转身快慢（越大越快）

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// Kuwahara（半径 1，四个 2×2 象限挑方差最小的那块的均值）：和烘焙时 CPU 上的 oilPaint 一样，再套地图色调（3×3 + 偏移）
const POST_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform mat3 uTone; uniform vec3 uToneOff;
varying vec2 vUv;
vec4 px(vec2 o) { vec4 t = texture2D(tSrc, vUv + o * uTexel); return vec4(t.a > 0.0 ? t.rgb / t.a : vec3(0.0), t.a); }
void quad(vec2 q, inout float best, inout vec3 bc) {
  vec3 s = vec3(0.0); float sl = 0.0; float sl2 = 0.0; float n = 0.0;
  for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
    vec4 t = px(q + vec2(float(dx), float(dy)));
    if (t.a < 0.03) continue;
    float l = dot(t.rgb, vec3(0.3, 0.59, 0.11));
    s += t.rgb; sl += l; sl2 += l * l; n += 1.0;
  }
  if (n < 0.5) return;
  float v = sl2 / n - (sl / n) * (sl / n);
  if (v < best) { best = v; bc = s / n; }
}
void main() {
  vec4 c0 = px(vec2(0.0));
  if (c0.a < 0.03) { gl_FragColor = vec4(0.0); return; }
  float best = 1e9; vec3 bc = c0.rgb;
  quad(vec2(-1.0, -1.0), best, bc); quad(vec2(0.0, -1.0), best, bc);
  quad(vec2(-1.0, 0.0), best, bc); quad(vec2(0.0, 0.0), best, bc);
  gl_FragColor = vec4(clamp(uTone * bc + uToneOff, 0.0, 1.0), c0.a);
}`;

/** 地图色调（{ brightness, contrast, saturate, sepia, hue }，和 CSS filter 一样的意思）→ 3×3 矩阵 + 偏移。 */
export function toneMatrix(t = {}) {
  let M = [1, 0, 0, 0, 1, 0, 0, 0, 1]; let off = [0, 0, 0];
  const apply = (A, b = [0, 0, 0]) => { // 新 = A·旧 + b
    const m = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r * 3 + c] = A[r * 3] * M[c] + A[r * 3 + 1] * M[3 + c] + A[r * 3 + 2] * M[6 + c];
    off = [0, 1, 2].map((r) => A[r * 3] * off[0] + A[r * 3 + 1] * off[1] + A[r * 3 + 2] * off[2] + b[r]);
    M = m;
  };
  if (t.brightness != null) apply([t.brightness, 0, 0, 0, t.brightness, 0, 0, 0, t.brightness]);
  if (t.contrast != null) { const c = t.contrast; apply([c, 0, 0, 0, c, 0, 0, 0, c], [0.5 - 0.5 * c, 0.5 - 0.5 * c, 0.5 - 0.5 * c]); }
  if (t.saturate != null) {
    const s = t.saturate;
    apply([0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]);
  }
  if (t.sepia) {
    const a = t.sepia; const S = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
    apply(S.map((v, i) => (i % 4 === 0 ? 1 - a + a * v : a * v)));
  }
  if (t.hue) {
    const r = (t.hue * Math.PI) / 180; const c = Math.cos(r); const s = Math.sin(r);
    apply([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]);
  }
  return { M, off };
}

/** 一个小人：模型、动作混合器、当前在播的动作、朝向。 */
class LiveChar {
  constructor(g, meta, slot) {
    this.g = g; this.root = g.root; this.mixer = g.mixer; this.slot = slot;
    this.win = liveWindows(meta);
    this.actions = {};
    for (const [name, clip] of Object.entries(g.clips)) this.actions[name] = this.mixer.clipAction(clip);
    this.cur = null; this.heading = Math.PI / 4; this.phase = 0;
    this.fidget = null; this.nextFidget = null; this.t = 0;
    this.play({ name: 'idle', loop: true, ts: 1, fade: 0 });
    this.root.visible = false;
  }

  /** 换到某段动作（同一段只改速度）；走 ↔ 跑切换时按周期的进度对齐，腿不跳。 */
  play(w) {
    const a = this.actions[w.name];
    if (!a) return;
    if (this.cur?.name === w.name && !w.restart) { a.timeScale = w.ts; return; }
    const prev = this.cur;
    a.reset();
    a.setLoop(w.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.timeScale = w.ts;
    a.time = w.t0 ?? 0;
    const cyc = (n) => this.win[n]?.dur;
    if (prev && ['walk', 'run'].includes(prev.name) && ['walk', 'run'].includes(w.name)) a.time = ((prev.action.time / cyc(prev.name)) % 1) * cyc(w.name);
    a.play();
    if (prev && w.fade) prev.action.crossFadeTo(a, w.fade, false);
    else if (prev) prev.action.stop();
    this.cur = { name: w.name, action: a, since: this.t };
  }

  /**
   * 每帧：按地图上的移动选动作、推进动画、转向。inp：{ mv（easedAt 的结果，站着时 null）, run, fromRest, upm, angle（地图角度，弧度）}。
   * 返回走过的步数（踩脚步声用；站着时 null）。
   */
  update(dt, inp) {
    this.t += dt;
    const W = this.win;
    let steps = null;
    if (inp.mv) {
      this.fidget = null; this.nextFidget = null;
      const { e, ts, b, v } = inp.mv;
      const gait = inp.run ? 'run' : 'walk';
      const startT = gait === 'run' ? RUN_START_T : START_T;
      const g = W[gait];
      const ms = v / inp.upm;
      const rate = Math.min(ms / g.stride, (g.speed / g.stride) * MAX_RATE[gait]); // 每秒几个周期
      this.phase += rate * dt;
      steps = Math.floor(this.phase * 2);
      if (e >= ts) this.play({ name: 'stop', t0: W.stop.t0, ts: W.stop.dur / Math.max(0.12, b), fade: 0.16 });
      else if (inp.fromRest && e < startT) {
        const k = gait === 'run' && W.runStart ? 'runStart' : 'start';
        this.play({ name: k, t0: W[k].t0, ts: W[k].dur / startT, fade: 0.1 });
      } else this.play({ name: gait, loop: true, ts: rate / (g.speed / g.stride), fade: 0.22 });
    } else {
      // 站着：待机，隔一阵随机做个小动作，做完淡回待机
      if (this.fidget && this.t - this.fidget.t0 > this.fidget.dur / FIDGET_SPEED - 0.35) { this.fidget = null; this.nextFidget = this.t + FIDGET_GAP[0] + Math.random() * FIDGET_GAP[1]; }
      this.nextFidget ??= this.t + 3 + Math.random() * FIDGET_GAP[1];
      if (!this.fidget && this.t >= this.nextFidget && W.fidgets.length) {
        const f = W.fidgets[Math.floor(Math.random() * W.fidgets.length)];
        this.fidget = { ...f, t0: this.t };
        this.play({ name: f.name, ts: FIDGET_SPEED, fade: 0.4, restart: true });
      }
      if (!this.fidget) this.play({ name: 'idle', loop: true, ts: 1, fade: 0.35 });
    }
    this.mixer.update(dt);
    // 朝向：地图角度 θ → rotation.y = −θ − 90°（见 avatar3d.js 烘焙时的说明），沿最短的方向慢慢转过去
    if (inp.angle != null) {
      let d = inp.angle - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * TURN);
    }
    this.root.rotation.y = -this.heading - Math.PI / 2;
    return steps;
  }
}

export class LiveAvatars {
  /** scale：每格多大（1 = 和烘焙图一样 96×128），按屏幕像素密度给，太小看着糊、太大费显卡。 */
  constructor({ scale = 1 } = {}) {
    this.rs = scale;
    this.sw = Math.round(FRAME_W * scale); this.sh = Math.round(FRAME_H * scale);
    this.w = COLS * this.sw; this.h = ROWS * this.sh;
    this.canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.LinearSRGBColorSpace; // 和烘焙一样：颜色按原样当 sRGB 用
    r.setPixelRatio(1); r.setSize(this.w, this.h, false); r.setClearColor(0x000000, 0);
    r.autoClear = false;
    this.renderer = r;
    this.target = new THREE.WebGLRenderTarget(this.w, this.h, { samples: 4 }); // 多重采样：边缘干净
    this.scene = new THREE.Scene();
    this.camera = isoCamera();
    this.anchor = footAnchorOf(this.camera);
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: this.target.texture }, uTexel: { value: new THREE.Vector2(1 / this.w, 1 / this.h) }, uTone: { value: new THREE.Matrix3() }, uToneOff: { value: new THREE.Vector3() } },
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.postCam = new THREE.Camera();
    this.slots = new Array(COLS * ROWS).fill(null);
    this.chars = new Map();
    this.ms = 0;
  }

  setTone(t) {
    const { M, off } = toneMatrix(t ?? {});
    this.post.uniforms.uTone.value.set(...M);
    this.post.uniforms.uToneOff.value.set(...off);
  }

  /** 第 i 格在画布上的位置（左上角为原点，像素）。 */
  rect(i) { return { x: (i % COLS) * this.sw, y: Math.floor(i / COLS) * this.sh, w: this.sw, h: this.sh }; }

  /** 加一个人（id）：载入他的形象的模型，占一格。返回 { rect, anchor, meta }；格子满了返回 null。 */
  async add(id, char, { hat = null, cloth = null } = {}) {
    if (this.chars.has(id)) return this.chars.get(id).info;
    const slot = this.slots.indexOf(null);
    if (slot < 0) return null;
    this.slots[slot] = id;
    const placeholder = { pending: true };
    this.chars.set(id, placeholder);
    const { url, meta } = modelInfo(char);
    const g = await buildGlbCharacter(url, { hat, cloth });
    if (this.chars.get(id) !== placeholder) return null; // 等模型的时候被移走了
    const c = new LiveChar(g, meta, slot);
    c.info = { rect: this.rect(slot), anchor: this.anchor, meta };
    this.chars.set(id, c);
    this.scene.add(c.root);
    return c.info;
  }

  remove(id) {
    const c = this.chars.get(id);
    this.chars.delete(id);
    const i = this.slots.indexOf(id);
    if (i >= 0) this.slots[i] = null;
    if (c?.root) { this.scene.remove(c.root); c.mixer.stopAllAction(); }
  }

  /** 推进一个人的动画（见 LiveChar.update）。 */
  drive(id, dt, inp) {
    const c = this.chars.get(id);
    return c?.update ? c.update(dt, inp) : null;
  }

  /** 把 ids 里这些人画到画布上（画面外、藏起来的不画，省显卡）。 */
  render(ids) {
    const t0 = performance.now();
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.setScissorTest(false);
    r.clear();
    r.setScissorTest(true);
    for (const id of ids) {
      const c = this.chars.get(id);
      if (!c?.root) continue;
      const { x, y, w, h } = this.rect(c.slot);
      const vy = this.h - y - h; // WebGL 的原点在左下角
      r.setViewport(x, vy, w, h); r.setScissor(x, vy, w, h);
      c.root.visible = true;
      r.render(this.scene, this.camera);
      c.root.visible = false;
    }
    r.setScissorTest(false);
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.w, this.h);
    r.clear();
    r.render(this.postScene, this.postCam);
    this.ms = performance.now() - t0;
  }

  dispose() {
    for (const id of [...this.chars.keys()]) this.remove(id);
    this.target.dispose(); this.post.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
