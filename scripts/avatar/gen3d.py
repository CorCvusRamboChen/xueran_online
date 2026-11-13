"""概念图 → 3D 形体（调 Hugging Face 上腾讯 Hunyuan3D 的公开空间，只要白模）。

用法：py -3.12 -I scripts/avatar/gen3d.py <正面图> [背面图] <输出.glb>
· 有背面图走 Hunyuan3D-2mv（多视角，正 + 背），没有走 Hunyuan3D-2.1（单图）。
· 只要形体：一键带贴图（/generation_all）要 270 秒 GPU，超过匿名额度；贴图在 rig.py 里从概念图投影上去，
  笔触就是概念图原样的。
· 公开空间有排队和每日额度，失败（超时、额度）隔一会儿再跑。
"""
import shutil
import sys

from gradio_client import Client, handle_file

args = sys.argv[1:]
if len(args) not in (2, 3):
    sys.exit(__doc__)
front, back, out = (args[0], args[1], args[2]) if len(args) == 3 else (args[0], None, args[1])

space = 'tencent/Hunyuan3D-2mv' if back else 'tencent/Hunyuan3D-2.1'
c = Client(space, verbose=False, httpx_kwargs={'timeout': 180})
kw = dict(
    steps=30, guidance_scale=5.0, seed=1234, octree_resolution=256,
    check_box_rembg=True, num_chunks=8000, randomize_seed=False,
    api_name='/shape_generation',
)
if back:
    res = c.predict(caption=None, image=None, mv_image_front=handle_file(front), mv_image_back=handle_file(back),
                    mv_image_left=None, mv_image_right=None, **kw)
else:
    res = c.predict(image=handle_file(front), mv_image_front=None, mv_image_back=None,
                    mv_image_left=None, mv_image_right=None, **kw)
# /shape_generation 返回 (白模, 预览 html, 网格统计, 种子)。白模有时是路径，有时是 {value/path/url} 的字典；
# 本地没下载下来（2mv 下载常 500）就按 https://<空间>.hf.space/file=<路径> 自己下
f = res[0]
if isinstance(f, dict):
    f = f.get('value') or f.get('path') or f.get('url') or f
    if isinstance(f, dict):
        f = f.get('path') or f.get('url')
import os
if isinstance(f, str) and os.path.exists(f):
    shutil.copy(f, out)
else:
    import urllib.request
    url = f if str(f).startswith('http') else f"https://{space.replace('/', '-').lower()}.hf.space/file={f}"
    print('downloading', url)
    urllib.request.urlretrieve(url, out)
print('saved', out, res[2])
