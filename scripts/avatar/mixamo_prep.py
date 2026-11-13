"""rig.py 导出的 glb → 给 Mixamo 上传用的 FBX：去掉我们自己的骨架，只留带贴图的网格（贴图嵌在 FBX 里）。

用法：blender -b -P scripts/avatar/mixamo_prep.py -- 输入.glb 输出.fbx
"""
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, DST = [os.path.abspath(p) for p in argv[:2]]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
# 解除骨架：清掉修改器、顶点组和父级，保持当前（静止）形状
for m in list(mesh.modifiers):
    mesh.modifiers.remove(m)
mesh.vertex_groups.clear()
mw = mesh.matrix_world.copy()
mesh.parent = None
mesh.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o is not mesh:
        bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 贴图存成文件再嵌进 FBX（打包在 blend 里的图 FBX 导出器拿不到）
out_dir = os.path.dirname(DST)
for img in bpy.data.images:
    if img.packed_file or not img.filepath:
        path = os.path.join(out_dir, f'{os.path.splitext(os.path.basename(DST))[0]}_tex.png')
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()

bpy.ops.export_scene.fbx(filepath=DST, use_selection=True, path_mode='COPY', embed_textures=True,
                         apply_scale_options='FBX_SCALE_ALL', add_leaf_bones=False)
print('exported', DST)
