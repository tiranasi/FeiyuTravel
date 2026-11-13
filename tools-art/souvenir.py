# 把纪念品图标（J1–J3）与明信片插画（P1–P18）转换成游戏数据。
#
# 原则同 qban.py：素材本身是黑底绿色最终画风，只取亮度 max(R,G,B)，低于 NOISE 视为黑（透明），不重绘。
# 来源与裁切以 souvenir-postcard/manifest.json 为准（selected-work.json 选定的文件、每格 sourceRect、每张 crop）。
#
# 输出：
#   lib/gift-data.js  GIFT_ART：18 个 gift_<id>，各自裁到内容边界，长边缩到 GIFT_PX，8 位亮度（并入后台解码）。
#   lib/card-data.js  CARDS：18 张 card_<dest>_<n>，裁中间横条后缩到 CARD_W×CARD_H，
#                     4 位亮度（两个像素一个字节，高 4 位在前），打开明信片时才解码。
#   build/art/souvenir/ 下的绿色预览图。
#
# 用法：PYTHONPATH=build/pylibs python tools-art/souvenir.py
import os, json, base64, numpy as np
from PIL import Image

ROOT = '../output/references/dafeiyu-20261112/qban-v2/souvenir-postcard'
NOISE = 18
GIFT_PX = 96
CARD_W, CARD_H = 408, 184
PAD = 2

def lum(path):
  a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
  L = a.max(axis=2)
  L[L < NOISE] = 0
  return L

def resize(L, w, h):
  return np.asarray(Image.fromarray(L.astype(np.float32), 'F').resize((w, h), Image.LANCZOS))

def to8(L):
  g = np.clip(L, 0, 255)
  g[g < 6] = 0
  return g.astype(np.uint8)

def preview(g, path, zoom=2):
  g = g.astype(np.uint16)
  rgb = np.stack([g * 64 // 255, g, g * 94 // 255], axis=2).astype(np.uint8)
  im = Image.fromarray(rgb)
  im.resize((im.width * zoom, im.height * zoom), Image.NEAREST).save(path)

def gift(L, r):
  c = L[r['y']:r['y'] + r['height'], r['x']:r['x'] + r['width']]
  ys = np.where(c.max(axis=1) > 0)[0]; xs = np.where(c.max(axis=0) > 0)[0]
  c = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
  s = GIFT_PX / max(c.shape)
  return np.pad(to8(resize(c, max(1, round(c.shape[1] * s)), max(1, round(c.shape[0] * s)))), PAD)

def card(L, crop):
  H, W = L.shape
  # manifest 的 crop 按 1536×1024 写；原生尺寸不同时按比例换算
  sx, sy = W / 1536, H / 1024
  c = L[round(crop['y'] * sy):round((crop['y'] + crop['height']) * sy), round(crop['x'] * sx):round((crop['x'] + crop['width']) * sx)]
  return to8(resize(c, CARD_W, CARD_H))

def pack4(g):
  q = np.clip(np.round(g.astype(np.float32) / 17), 0, 15).astype(np.uint8).ravel()
  if q.size % 2: q = np.append(q, 0)
  return (q[0::2] << 4) | q[1::2], (q.astype(np.uint16) * 17)

def main():
  man = json.load(open(ROOT + '/manifest.json', encoding='utf8'))
  os.makedirs('build/art/souvenir', exist_ok=True)
  gifts = {}
  for sheet in man['souvenirs']:
    L = lum(ROOT + '/' + sheet['file'])
    for item in sheet['items']:
      g = gift(L, item['sourceRect'])
      gifts[item['id']] = g
      preview(g, f"build/art/souvenir/{item['id']}.png")
  cards, stats = {}, {}
  for p in man['postcards']:
    g = card(lum(ROOT + '/' + p['file']), p['crop'])
    packed, back = pack4(g)
    cards[p['id']] = (g.shape[1], g.shape[0], packed)
    preview(back[:g.size].reshape(g.shape).astype(np.uint8), f"build/art/souvenir/{p['id']}.png", 1)
    stats[p['id']] = round(float((g > 179).mean()), 4)
  out = ['// 由 tools-art/souvenir.py 生成：纪念品图标（souvenir-postcard J1–J4，J4 为亲密信物），只取亮度 max(R,G,B)，单通道 0–255。', 'export const GIFT_ART={']
  for name, g in gifts.items():
    out.append(f'  {name}:{{w:{g.shape[1]},h:{g.shape[0]},d:"{base64.b64encode(g.tobytes()).decode()}"}},')
  out.append('};')
  open('lib/gift-data.js', 'w', encoding='utf8').write('\n'.join(out) + '\n')
  out = ['// 由 tools-art/souvenir.py 生成：明信片插画（souvenir-postcard P1–P18），中间横条缩到 408×184。',
         '// 4 位亮度：每字节两个像素，高 4 位在前，值 ×17 还原到 0–255。打开明信片时才解码。', 'export const CARDS={']
  for name, (w, h, packed) in cards.items():
    out.append(f'  {name}:{{w:{w},h:{h},bits:4,d:"{base64.b64encode(packed.tobytes()).decode()}"}},')
  out.append('};')
  open('lib/card-data.js', 'w', encoding='utf8').write('\n'.join(out) + '\n')
  print('gifts', len(gifts), 'bytes', sum(g.size for g in gifts.values()))
  print('cards', len(cards), 'packed bytes', sum(c[2].size for c in cards.values()))
  print('bright>179 ratio max', max(stats.values()))

main()
