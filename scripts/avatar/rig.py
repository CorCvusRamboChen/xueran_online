"""AI 生成的人物模型 → 减面 + 骨架 + 权重，导出给游戏用的 glb，并渲染几张检查图。

用法：blender -b -P scripts/avatar/rig.py -- 输入.glb 输出.glb 检查图前缀 正面图 背面图 [目标面数] [身高米]
· 假定模型是 A 字站姿、正面朝 glTF 的 +Z（导进 Blender 后朝 -Y）。不是的话看检查图再改 FACE_ROT。
· 贴图：把正面、背面概念图按人物的外框对齐，朝前的面用正面图、朝后的面用背面图（拼成一张左右两半的图）。
· 骨架按比例摆，手臂的位置从网格里量（每个高度切片上最外侧的点）。
· 权重不用 Blender 的自动权重（AI 网格常常不干净，热扩散会失败），按顶点到骨头线段的距离算，再按左右、上下分区限制。
"""
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, PREVIEW, FRONT_IMG, BACK_IMG = [os.path.abspath(p) for p in argv[:5]]
TARGET_FACES = int(argv[5]) if len(argv) > 5 else 12000
TEX_H = 1024    # 贴图高度（两张图并排，宽 = 2 × 按比例的宽）
FACE_ROT = 0.0  # 绕 Z 额外转多少度，让人物正面朝 -Y
H = float(argv[6]) if len(argv) > 6 else 1.8  # 身高（米，连帽子）：不同体型的人物高矮不同

# ───────────── 导入、合并、摆正 ─────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o is not obj:
        bpy.data.objects.remove(o)

me = obj.data
co = np.array([v.co[:] for v in me.vertices])
if FACE_ROT:
    a = math.radians(FACE_ROT)
    R = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    co = co @ R.T
lo, hi = co.min(0), co.max(0)
s = H / (hi[2] - lo[2])
co = (co - np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])) * s
for v, c in zip(me.vertices, co):
    v.co = c
me.update()
print('raw verts', len(me.vertices), 'faces', len(me.polygons), 'bbox', co.min(0), co.max(0))

# ───────────── 去掉轮廓外的碎片 ─────────────
# AI 网格常带悬空或连着身体的薄片（比如围裙下摆甩出一根刺），绑骨后会乱飞。
# 把每个顶点按高度对齐投到正面、背面概念图上：两张图里都落在人物轮廓（外扩几像素）以外的，删掉。
def _sil(path, mirror):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a)
    px = a.reshape(h, w, 4)[::-1]
    bg = px[4:20, 4:20, :3].reshape(-1, 3).mean(0)
    m = np.abs(px[:, :, :3] - bg).sum(2) > 0.12
    for _ in range(8):  # 外扩 8 像素
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    ys, xs = np.nonzero(m)
    y0, y1, cx = ys.min(), ys.max(), (xs.min() + xs.max()) / 2
    k = (y1 - y0) / H
    X = np.round(cx + (-co[:, 0] if mirror else co[:, 0]) * k).astype(int)
    Y = np.round(y1 - co[:, 2] * k).astype(int)
    ok = (X >= 0) & (X < w) & (Y >= 0) & (Y < h)
    inside = np.zeros(len(co), bool)
    inside[ok] = m[Y[ok], X[ok]]
    return inside
keep = _sil(FRONT_IMG, False) | _sil(BACK_IMG, True)
if (~keep).any():
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(~keep)[0]], context='VERTS')
    bm.to_mesh(me); bm.free(); me.update()
    co = np.array([v.co[:] for v in me.vertices])
print('outside silhouette, removed verts', int((~keep).sum()))

# ───────────── 减面 ─────────────
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
bm.to_mesh(me); bm.free()
if len(me.polygons) > TARGET_FACES:
    m = obj.modifiers.new('dec', 'DECIMATE')
    m.ratio = TARGET_FACES / len(me.polygons)
    bpy.ops.object.modifier_apply(modifier='dec')
for p in me.polygons:
    p.use_smooth = True
co = np.array([v.co[:] for v in me.vertices])
print('decimated verts', len(me.vertices), 'faces', len(me.polygons))

# ───────────── 贴图：正面 / 背面概念图投影 ─────────────
def load_px(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[::-1]  # Blender 的像素从下往上，翻成从上往下

def figure_box(px):
    # 背景是纯浅灰：和左上角颜色差得多的就是人物
    bg = px[4:20, 4:20, :3].reshape(-1, 3).mean(0)
    mask = np.abs(px[:, :, :3] - bg).sum(2) > 0.12
    ys, xs = np.nonzero(mask)
    return (xs.min(), xs.max(), ys.min(), ys.max()), mask

def bleed(px, mask, n=28):
    """把人物边缘的颜色一圈圈往背景里推：模型轮廓比画上的人物稍大，边上采样不会采到灰背景。"""
    px = px.copy(); mask = mask.copy()
    for _ in range(n):
        acc = np.zeros(px.shape[:2] + (3,), np.float32); cnt = np.zeros(px.shape[:2], np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            m = np.roll(mask, (dy, dx), (0, 1)); c = np.roll(px[:, :, :3], (dy, dx), (0, 1))
            acc += c * m[:, :, None]; cnt += m
        grow = (~mask) & (cnt > 0)
        px[grow, :3] = acc[grow] / cnt[grow, None]
        mask |= grow
    return px

fp, bp = load_px(FRONT_IMG), load_px(BACK_IMG)
(fb, fm), (bb, bm) = figure_box(fp), figure_box(bp)
fp, bp = bleed(fp, fm), bleed(bp, bm)
print('figure boxes', fb, bb)
# 拼图：左半正面、右半背面，各自裁到人物外框（留一点边），缩放到 TEX_H 高
def crop(px, box, pad=8):
    x0, x1, y0, y1 = box
    return px[max(0, y0 - pad):y1 + pad + 1, max(0, x0 - pad):x1 + pad + 1], pad
fc, _ = crop(fp, fb); bc, _ = crop(bp, bb)
def resize(px, h):
    w = max(1, round(px.shape[1] * h / px.shape[0]))
    yi = (np.arange(h) * px.shape[0] / h).astype(int); xi = (np.arange(w) * px.shape[1] / w).astype(int)
    return px[yi][:, xi]
fc, bc = resize(fc, TEX_H), resize(bc, TEX_H)
atlas = np.concatenate([fc, bc], 1)
AW = atlas.shape[1]
tex = bpy.data.images.new('skin', AW, TEX_H, alpha=False)
tex.pixels.foreach_set(atlas[::-1].astype(np.float32).ravel())
tex.pack()

def to_uv(x, z, box, x_off, w_px, mirror):
    # 人物外框（像素）↔ 网格外框（米）：高对高，水平按框中心对齐
    x0, x1, y0, y1 = box
    k = (y1 - y0) / H
    cx = (x0 + x1) / 2
    px_x = cx + (-x if mirror else x) * k
    px_y = y1 - z * k
    # 换算到裁剪 + 缩放后的拼图里
    s = TEX_H / (y1 - y0 + 17)
    u = (x_off + (px_x - (x0 - 8)) * s) / AW
    v = 1 - (px_y - (y0 - 8)) * s / TEX_H
    return u, v

uvl = me.uv_layers.new(name='proj')
me.uv_layers.active = uvl
loop_v = np.array([l.vertex_index for l in me.loops])
loop_p = np.empty(len(me.loops), dtype=int)
for p in me.polygons:
    loop_p[p.loop_start:p.loop_start + p.loop_total] = p.index
pn = np.array([p.normal[:] for p in me.polygons])
front_face = pn[loop_p, 1] <= 0          # 正面朝 -Y
lc = co[loop_v].copy()
# 朝侧面、朝上的面：采样点往人物里面收一点（投影到正面图上时它们正好落在轮廓线上）
# 按顶点法线算（按面算的话同一个顶点在每个面上 UV 都不同，导出时顶点会被拆成好几倍）
vn = np.array([v.normal[:] for v in me.vertices])[loop_v]
lc[:, 0] -= vn[:, 0] * 0.014 * H
lc[:, 2] -= np.clip(vn[:, 2], 0, 1) * 0.008 * H
uf = to_uv(lc[:, 0], lc[:, 2], fb, 0, fc.shape[1], False)
ub = to_uv(lc[:, 0], lc[:, 2], bb, fc.shape[1], bc.shape[1], True)
U = np.where(front_face, uf[0], ub[0]); V = np.where(front_face, uf[1], ub[1])
uvl.data.foreach_set('uv', np.stack([U, V], 1).astype(np.float32).ravel())
for other in [l for l in me.uv_layers if l != uvl]:
    me.uv_layers.remove(other)

mat = bpy.data.materials.new('skin'); mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')  # 节点名随界面语言变，按类型找
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = tex; tn.interpolation = 'Linear'
nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 1.0
me.materials.clear(); me.materials.append(mat)

# ───────────── 量手臂 ─────────────
# 每个高度切片取 |x| 最大的点（手臂外沿），左右分开。手臂中心线 ≈ 外沿往里收一个手臂半径。
ARM_R = 0.035 * H
def arm_line(sign):
    pts = []
    for z in np.linspace(0.46 * H, 0.76 * H, 13):
        band = co[(np.abs(co[:, 2] - z) < 0.012 * H) & (co[:, 0] * sign > 0)]
        if len(band) == 0:
            continue
        i = np.argmax(band[:, 0] * sign)
        pts.append((abs(band[i, 0]) - ARM_R, z))
    pts = np.array(pts)
    k, b = np.polyfit(pts[:, 1], pts[:, 0], 1)   # x = k·z + b
    return lambda z: k * z + b
armx = {+1: arm_line(+1), -1: arm_line(-1)}

# 手的最低点（手指尖）：手臂外侧那条带里最低的点
def hand_tip(sign):
    xs = armx[sign](0.5 * H)
    band = co[(co[:, 0] * sign > xs - 0.04 * H)]
    return band[:, 2].min()

# ───────────── 骨架 ─────────────
J = {}
J['hips'] = (0, 0, 0.52 * H)
J['spine'] = (0, 0, 0.62 * H)
J['chest'] = (0, 0, 0.72 * H)
J['neck'] = (0, 0, 0.83 * H)
J['head'] = (0, 0, 0.88 * H)
J['headTop'] = (0, 0, 1.0 * H)
for sign, sd in ((+1, 'L'), (-1, 'R')):
    tip = hand_tip(sign)
    zs, ze, zw = 0.815 * H, 0.655 * H, max(tip + 0.09 * H, 0.47 * H)
    J['shoulder.' + sd] = (sign * 0.045 * H, 0.0, 0.80 * H)
    J['upperArm.' + sd] = (sign * max(0.12 * H, sign * armx[sign](zs) * sign - 0.01 * H), 0.0, zs)
    J['foreArm.' + sd] = (sign * abs(armx[sign](ze)), 0.0, ze)
    J['hand.' + sd] = (sign * abs(armx[sign](zw)), 0.0, zw)
    J['handTip.' + sd] = (sign * abs(armx[sign](tip + 0.01 * H)), 0.0, tip + 0.01 * H)
    J['thigh.' + sd] = (sign * 0.062 * H, 0.0, 0.50 * H)
    J['shin.' + sd] = (sign * 0.062 * H, -0.01 * H, 0.27 * H)
    J['foot.' + sd] = (sign * 0.062 * H, 0.01 * H, 0.055 * H)
    J['toe.' + sd] = (sign * 0.062 * H, -0.075 * H, 0.015 * H)
print({k: tuple(round(x, 3) for x in v) for k, v in J.items()})

# 骨头：名字、头、尾、父
BONES = [('hips', 'hips', 'spine', None), ('spine', 'spine', 'chest', 'hips'), ('chest', 'chest', 'neck', 'spine'),
         ('neck', 'neck', 'head', 'chest'), ('head', 'head', 'headTop', 'neck')]
for sd in 'LR':
    BONES += [
        ('shoulder.' + sd, 'shoulder.' + sd, 'upperArm.' + sd, 'chest'),
        ('upperArm.' + sd, 'upperArm.' + sd, 'foreArm.' + sd, 'shoulder.' + sd),
        ('foreArm.' + sd, 'foreArm.' + sd, 'hand.' + sd, 'upperArm.' + sd),
        ('hand.' + sd, 'hand.' + sd, 'handTip.' + sd, 'foreArm.' + sd),
        ('thigh.' + sd, 'thigh.' + sd, 'shin.' + sd, 'hips'),
        ('shin.' + sd, 'shin.' + sd, 'foot.' + sd, 'thigh.' + sd),
        ('foot.' + sd, 'foot.' + sd, 'toe.' + sd, 'shin.' + sd),
    ]

arm_data = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, parent in BONES:
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = Vector(J[h]), Vector(J[t])
    b.roll = 0
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = (Vector(J[h]) - arm_data.edit_bones[parent].tail).length < 1e-4
bpy.ops.object.mode_set(mode='OBJECT')

# ───────────── 权重 ─────────────
segs = {name: (np.array(J[h]), np.array(J[t])) for name, h, t, _ in BONES}
names = [b[0] for b in BONES]
def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
D = np.stack([seg_dist(co, *segs[n]) for n in names], 1)
x, z = co[:, 0], co[:, 2]
allow = np.ones_like(D, dtype=bool)
for j, n in enumerate(names):
    side = +1 if n.endswith('.L') else -1 if n.endswith('.R') else 0
    if side:
        allow[:, j] &= x * side > -0.01 * H                        # 不过中线
    if n.startswith(('upperArm', 'foreArm', 'hand')):
        # 只给手臂外侧的点：比手臂中心线往里不超过一个半手臂半径
        inner = np.abs(np.array([armx[side](zz) for zz in z])) - 1.5 * ARM_R
        allow[:, j] &= (x * side > inner) & (z > 0.40 * H)
    if n.startswith(('thigh', 'shin', 'foot')):
        allow[:, j] &= z < 0.53 * H
    if n == 'head':
        allow[:, j] &= z > 0.82 * H
W = np.where(allow, 1.0 / (D + 0.01) ** 5, 0.0)
# 每个点只留最大的 3 个
top = np.argsort(-W, 1)[:, 3:]
np.put_along_axis(W, top, 0.0, 1)
W /= W.sum(1, keepdims=True) + 1e-12
for j, n in enumerate(names):
    g = obj.vertex_groups.new(name=n)
    for i in np.nonzero(W[:, j] > 0.01)[0]:
        g.add([int(i)], float(W[i, j]), 'REPLACE')
mod = obj.modifiers.new('rig', 'ARMATURE'); mod.object = rig
obj.parent = rig

# ───────────── 导出 ─────────────
for o in bpy.context.scene.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=True, export_skins=True,
                          export_animations=False, export_yup=True, export_apply=False,
                          export_image_format='WEBP', export_image_quality=85)
print('exported', DST)

# ───────────── 检查图：静止 + 迈步摆手，正面和侧面 ─────────────
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'FLAT'
scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x, scene.render.resolution_y = 600, 900
scene.render.film_transparent = False
world = bpy.data.worlds.new('w'); scene.world = world
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.0

def shot(tag, pos, rot):
    cam.location = pos; cam.rotation_euler = rot
    scene.render.filepath = f'{PREVIEW}-{tag}.png'
    bpy.ops.render.render(write_still=True)

def pose(walk):
    pb = rig.pose.bones
    for b in pb:
        b.rotation_mode = 'XYZ'; b.rotation_euler = (0, 0, 0)
    if walk:
        pb['thigh.L'].rotation_euler = (math.radians(-28), 0, 0)
        pb['shin.L'].rotation_euler = (math.radians(20), 0, 0)
        pb['thigh.R'].rotation_euler = (math.radians(22), 0, 0)
        pb['upperArm.L'].rotation_euler = (math.radians(25), 0, 0)
        pb['upperArm.R'].rotation_euler = (math.radians(-25), 0, 0)
        pb['foreArm.R'].rotation_euler = (math.radians(-30), 0, 0)
    bpy.context.view_layer.update()

for walk in (False, True):
    pose(walk)
    t = 'walk' if walk else 'rest'
    shot(t + '-front', (0, -6, 0.9), (math.radians(90), 0, 0))
    shot(t + '-side', (6, 0, 0.9), (math.radians(90), 0, math.radians(90)))
