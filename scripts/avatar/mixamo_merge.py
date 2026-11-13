"""把 Mixamo 下载的几段 FBX 合成一个带多段动画的 glb，并去掉根位移（原地踏步），位移曲线另存成 JSON。

用法：blender -b -P scripts/avatar/mixamo_merge.py -- 原始目录 贴图.png 输出.glb 输出.json [共用动作目录]
原始目录里要有 idle.fbx（带蒙皮）和 walk / run / start / stop.fbx（只有动画）。
共用动作目录（默认 design/avatar3d/shared-clips/raw）：runStart / runStop.fbx，是在别的人物身上导出的，
按骨头的世界朝向搬过来（胯部位置按胯高缩放），不用每个人物都重新上传 Mixamo。

- 循环动作（walk、run）：减掉向前的匀速分量，保留胯部前后的小起伏；JSON 里记每秒走多少米、一个周期多长。
- 起步、停步：向前的位移整个去掉，JSON 里逐帧记已经走了多少米，地图上按这条曲线挪人，脚不打滑。
Mixamo 的原始文件不能再分发，只放 design/ 下（已 gitignore）；glb 里的动画随游戏一起打包是许可允许的。
"""
import json
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, TEX, DST, META = [os.path.abspath(p) for p in argv[:4]]
SHARED = os.path.abspath(argv[4]) if len(argv) > 4 else os.path.join(os.path.dirname(__file__), '../../design/avatar3d/shared-clips/raw')
FPS = 30
CLIPS = ['idle', 'walk', 'run', 'start', 'stop']
# runStop（Run To Stop）是急刹，刹车时整个人蹲下去，跑停也用普通的停步；文件留着不合进来
SHARED_CLIPS = [k for k in ('runStart', 'shift', 'rub', 'look') if os.path.exists(os.path.join(SHARED, k + '.fbx'))]
ONCE = {'start', 'stop', 'runStart', 'runStop', 'shift', 'rub', 'look'}  # 不循环、逐帧记位移的；shift / rub / look 是站着时偶尔做的小动作（两脚倒换重心、搓肩、四处看）
LOOPS = {'idle', 'walk', 'run'}

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS


def objs():
    return set(bpy.context.scene.objects)


before = objs()
bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, 'idle.fbx'))
arm = next(o for o in objs() - before if o.type == 'ARMATURE')
mesh = next(o for o in objs() - before if o.type == 'MESH')
arm.name = 'townsman'

# 只有动作的 FBX（不带蒙皮）骨架的静止姿势是 T 字，带蒙皮的 idle 是 A 字（绑骨时的姿势）：
# 骨头的旋转是相对静止姿势的，直接搬过来胳膊会全错（走路时小臂端在胸前）。
# 所以按世界空间逐骨复制（COPY_TRANSFORMS）再烘焙成 idle 那副骨架自己的动作。
actions = {'idle': arm.animation_data.action}
hips_rest_z = (arm.matrix_world @ arm.data.bones['mixamorig:Hips'].head_local).z


def bake_from(path, same_rig):
    """把 path 里的动作烘焙到 arm 上，返回新动作。same_rig：同一次绑骨导出的（逐骨复制整个变换）；
    否则是别的人物身上的：只复制骨头的世界朝向，胯部位置按两边胯高的比例缩放。"""
    before = objs()
    bpy.ops.import_scene.fbx(filepath=path)
    new = objs() - before
    src = next(o for o in new if o.type == 'ARMATURE')
    f0, f1 = (int(v) for v in src.animation_data.action.frame_range)
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        if pb.name in src.pose.bones:
            c = pb.constraints.new('COPY_TRANSFORMS' if same_rig else 'COPY_ROTATION')
            c.target = src
            c.subtarget = pb.name
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=False, visual_keying=True,
                     clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    act = arm.animation_data.action
    if not same_rig:
        sh = src.pose.bones['mixamorig:Hips']
        k = hips_rest_z / (src.matrix_world @ src.data.bones['mixamorig:Hips'].head_local).z
        hb = arm.pose.bones['mixamorig:Hips']
        for f in range(f0, f1 + 1):
            sc.frame_set(f)
            want = (src.matrix_world @ sh.matrix).translation * k
            m = hb.matrix.copy()
            m.translation = arm.matrix_world.inverted() @ want
            hb.matrix = m
            bpy.context.view_layer.update()
            hb.keyframe_insert('location', frame=f)
    arm.animation_data.action = None
    for o in new:
        bpy.data.objects.remove(o)
    return act


for k in CLIPS[1:]:
    actions[k] = bake_from(os.path.join(SRC, k + '.fbx'), True)
for k in SHARED_CLIPS:
    actions[k] = bake_from(os.path.join(SHARED, k + '.fbx'), False)
CLIPS += SHARED_CLIPS

hips = arm.pose.bones['mixamorig:Hips']
inv = arm.matrix_world.inverted()
meta = {'fps': FPS, 'clips': {}}

for k in CLIPS:
    act = actions[k]
    act.name = k
    act.use_fake_user = True
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    frames = list(range(f0, f1 + 1))
    pos = []
    for f in frames:
        sc.frame_set(f)
        pos.append((arm.matrix_world @ hips.matrix).translation.copy())
    # 模型面朝 Blender 的 -Y：向前走了多少米
    fwd = [-(p.y - pos[0].y) for p in pos]
    info = {'frames': len(frames), 'loop': k in LOOPS}
    if k in ('walk', 'run'):
        n = len(frames) - 1                      # 最后一帧 = 第一帧往前挪一个步幅
        speed = fwd[-1] / n                      # 每帧米数
        target = [fwd[i] - speed * i for i in range(len(frames))]
        info.update(speed=round(speed * FPS, 4), stride=round(fwd[-1], 4), frames=n)
    elif k in ONCE:
        target = [0.0] * len(frames)
        info.update(dist=[round(v, 4) for v in fwd])
    else:
        target = None
    if target is not None:
        for i, f in enumerate(frames):
            sc.frame_set(f)
            p = pos[i]
            want = Vector((p.x if k in LOOPS else pos[0].x, pos[0].y - target[i], p.z))
            m = hips.matrix.copy()
            m.translation = inv @ want
            hips.matrix = m
            bpy.context.view_layer.update()
            hips.keyframe_insert('location', frame=f)
    meta['clips'][k] = info
    # 每段动作放进一条 NLA 轨道，glb 里就是一段同名动画
    arm.animation_data.action = None
    tr = arm.animation_data.nla_tracks.new()
    tr.name = k
    st = tr.strips.new(k, f0, act)
    st.name = k
    tr.mute = True
    print(k, info.get('speed'), info.get('stride'), len(frames))

# 贴图换回我们自己的原图（Mixamo 回传的那张可能被重新压缩过）
img = bpy.data.images.load(TEX)
for slot in mesh.material_slots:
    for n in slot.material.node_tree.nodes:
        if n.type == 'TEX_IMAGE':
            n.image = img

sc.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=True, export_skins=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_optimize_animation_size=True, export_def_bones=True, export_yup=True,
                          export_image_format='WEBP', export_image_quality=85)
# 身高（米，连帽子 / 头发）：游戏里头像挂多高用
meta['height'] = round(max((mesh.matrix_world @ v.co).z for v in mesh.data.vertices), 3)
with open(META, 'w', encoding='utf-8') as fh:
    json.dump(meta, fh, ensure_ascii=False, indent=1)
print('exported', DST, META)
