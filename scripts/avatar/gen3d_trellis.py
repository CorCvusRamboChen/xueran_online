"""概念图 → 带贴图的 3D 模型（调 Hugging Face 上微软的 TRELLIS.2 公开空间）。

用法：py -3.12 -I scripts/avatar/gen3d_trellis.py <正面图> <输出.glb> [分辨率 512|1024]
Hunyuan3D-2.1 的一键生成要的 GPU 时长超过匿名额度，这个空间分步跑，每步短一些。
"""
import shutil
import sys

from gradio_client import Client, handle_file

src, out = sys.argv[1], sys.argv[2]
res = sys.argv[3] if len(sys.argv) > 3 else '1024'

c = Client('microsoft/TRELLIS.2', verbose=False)
c.predict(api_name='/start_session')
img = c.predict(input=handle_file(src), api_name='/preprocess_image')
print('preprocessed', img)
c.predict(image=img, seed=0, resolution=res, api_name='/image_to_3d')
print('generated')
r = c.predict(decimation_target=60000, texture_size=2048, api_name='/extract_glb')
print(r)
glb = r[1] if isinstance(r, (list, tuple)) else r
shutil.copy(glb, out)
print('saved', out)
