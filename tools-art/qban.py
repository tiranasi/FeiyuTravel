# 把用户确认的黑底绿色 Q 版原画（qban-v2）转换成游戏精灵 lib/qban-data.js。
#
# 原则（2026-11-12 用户确认）：新素材本身就是眼镜上的最终画风，只读亮度，不做任何重绘或分类填色。
#   亮度 = max(R, G, B)，黑色 = 透明；再按 GAIN 线性缩放（默认 1.0 即原样）。
# 尺寸：
#   全身帧（body）全部批次共用一个缩放比（站姿约 126px 高），并按格子里的同一条地面线裁切，
#     这样蹲、跳、坐的高低差与原画一致，游戏里统一以“地面线”为锚绘制。
#   半身帧（bust）共用一个缩放比（约 196px 高），底部做淡出。
#   图标（icon）统一缩放到约 40px 高。
#   识图指认 8 帧（photo-discover-8f）：整组使用同一裁切框（8 帧并集）与同一缩放，不单独裁切，保证对位。
#
# 用法：PYTHONPATH=build/pylibs python tools-art/qban.py
#   输出 lib/qban-data.js 与 build/art/qban2/ 下的绿色预览图。
import os, json, base64, numpy as np
from PIL import Image

ROOT = '../output/references/dafeiyu-20261112/qban-v2'
PD = ROOT + '/extensions/photo-discover-8f'
GAIN = 1.0
NOISE = 18          # 低于此亮度视为黑底噪点
BODY_H = 126        # 标准站姿身高（像素）
BODY_REF = 415      # 原画里标准站姿身高（格子像素，A/B/C/D 各批实测 409–421）
GROUND = 427        # 原画格子里的地面线（站姿脚底最低处 + 1）
BUST_H = 196
BUST_REF = 424
ICON_H = 40
PD_H = 210          # 识图指认整组高度
PAD = 2

def lum(im):
  a = np.asarray(im.convert('RGB')).astype(np.float32)
  L = a.max(axis=2)
  L[L < NOISE] = 0
  return L

def resize(L, w, h):
  return np.asarray(Image.fromarray(L.astype(np.float32), 'F').resize((w, h), Image.LANCZOS))

def finish(L, fade=0):
  g = np.clip(L * GAIN, 0, 255)
  if fade:
    h = g.shape[0]; n = int(h * fade)
    g[h - n:] *= (np.linspace(1, 0, n) ** 1.5)[:, None]
  g[g < 6] = 0
  return np.pad(g.astype(np.uint8), PAD)

def cells(path):
  L = lum(Image.open(path))
  H, W = L.shape; cw, ch = W / 4, H / 2
  return lambda i: L[int(i // 4 * ch):int((i // 4 + 1) * ch), int(i % 4 * cw):int((i % 4 + 1) * cw)]

def xspan(c):
  xs = np.where(c.max(axis=0) > 0)[0]
  return xs.min(), xs.max() + 1

def body(c, s):
  ys = np.where(c.max(axis=1) > 0)[0]
  top, bottom = ys.min(), max(GROUND, ys.max() + 1)
  x0, x1 = xspan(c)
  crop = c[top:bottom, x0:x1]
  g = finish(resize(crop, max(1, round(crop.shape[1] * s)), max(1, round(crop.shape[0] * s))))
  # lift：脚底到地面线的距离（最终像素），蹲跳坐保留原画高低差
  return g, round((bottom - (ys.max() + 1)) * s, 1)

def bust(c, s):
  ys = np.where(c.max(axis=1) > 0)[0]
  x0, x1 = xspan(c)
  crop = c[ys.min():ys.max() + 1, x0:x1]
  return finish(resize(crop, round(crop.shape[1] * s), round(crop.shape[0] * s)), fade=.2)

def icon(c):
  ys = np.where(c.max(axis=1) > 0)[0]
  x0, x1 = xspan(c)
  crop = c[ys.min():ys.max() + 1, x0:x1]
  s = ICON_H / max(crop.shape)
  return finish(resize(crop, max(1, round(crop.shape[1] * s)), max(1, round(crop.shape[0] * s))))

def preview(g, path, zoom=2):
  g = g.astype(np.uint16)
  rgb = np.stack([g * 64 // 255, g, g * 94 // 255], axis=2).astype(np.uint8)
  im = Image.fromarray(rgb)
  im.resize((im.width * zoom, im.height * zoom), Image.NEAREST).save(path)

def main():
  man = json.load(open(ROOT + '/manifest.json', encoding='utf8'))
  over = {o['id']: o for o in man.get('overrides', [])}
  out, meta = {}, {}
  sb, sq = BODY_H / BODY_REF, BUST_H / BUST_REF
  for b in man['batches']:
    get = cells(ROOT + '/' + b['file'])
    for f in b['frames']:
      fid = f['id']
      if fid in over:
        # 单帧替换图：原生分辨率不同，按其站姿高度换算到同一身高
        L = lum(Image.open(ROOT + '/' + over[fid]['file']))
        ys = np.where(L.max(axis=1) > 0)[0]
        k = BODY_REF / (ys.max() + 1 - ys.min())
        c = resize(L, round(L.shape[1] * k), round(L.shape[0] * k))
        ys = np.where(c.max(axis=1) > 0)[0]
        c = c[:ys.max() + 1]
        c = np.pad(c, ((0, GROUND - c.shape[0]), (0, 0))) if c.shape[0] < GROUND else c
      else:
        c = get(f['cell'] - 1)
      kind = b['kind']
      if kind == 'mixed': kind = 'bust' if fid.startswith('bust_') or fid == 'peek_edge' else 'body'
      if kind == 'body':
        g, lift = body(c, sb); meta[fid] = lift
      elif kind == 'bust': g = bust(c, sq)
      else: g = icon(c)
      out[fid] = g
  # 识图指认：8 帧并集裁切，统一缩放
  frames = [lum(Image.open(f'{PD}/frame-{i:02d}.png')) for i in range(1, 9)]
  u = np.maximum.reduce(frames)
  ys = np.where(u.max(axis=1) > 0)[0]; xs = np.where(u.max(axis=0) > 0)[0]
  y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
  s = PD_H / (y1 - y0)
  for i, L in enumerate(frames, 1):
    crop = L[y0:y1, x0:x1]
    out[f'pd{i}'] = finish(resize(crop, round(crop.shape[1] * s), round(crop.shape[0] * s)), fade=.12)
  os.makedirs('build/art/qban2', exist_ok=True)
  lines = ['// 由 tools-art/qban.py 生成：用户确认的黑底绿色 Q 版原画（qban-v2 与识图指认 8 帧），只取亮度 max(R,G,B)，单通道 0–255。',
           '// 全身帧的图片底边就是地面线：蹲、跳、坐的高低差已包含在图里，统一以底边为锚绘制。',
           'export const QBAN={']
  total = 0
  for name, g in out.items():
    h, w = g.shape; total += g.size
    preview(g, f'build/art/qban2/{name}.png')
    lines.append(f'  {name}:{{w:{w},h:{h},d:"{base64.b64encode(g.tobytes()).decode()}"}},')
  lines.append('};')
  open('lib/qban-data.js', 'w', encoding='utf8').write('\n'.join(lines) + '\n')
  print('frames', len(out), 'pixels', total)
  for k in ('body_front', 'bust_neutral', 'icon_shell', 'pd5', 'chase_jump', 'trip_pack'):
    print(k, out[k].shape[::-1], meta.get(k))

if __name__ == '__main__': main()
