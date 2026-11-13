# 把用户的正常色 Q 版素材转换成单绿色显示屏用的单通道亮度精灵（线稿加淡填色）。
#
# 转换规则（v2，2026-11-12）：
#   1. 外轮廓：按角色剪影外缘描一圈固定粗细的亮线（OUTLINE）。
#   2. 内部线：只取原画里本来就有的深色勾线（比周围明显更暗的细线），不把颜色交界当成线；
#      太细的发丝会被过滤掉，避免缩小后变成杂线（INK）。
#   3. 填色：按颜色把像素分成皮肤 / 白布 / 金饰 / 蓝色（头发、衣服、耳鳍、眼睛）几类，
#      每类映射到固定的暗绿亮度（FILL），蓝色类按原亮度在窄范围内分层，让头发和深色衣服分开。
#   4. 高光：白色背景以内的小块纯白（眼睛高光）保留为最亮点（SPARK）。
# 全部参数集中在 PARAMS，戴上眼镜后觉得太亮或太暗，只改这里重新转换即可。
#
# 用法：
#   PYTHONPATH=build/pylibs python tools-art/convert.py              重新生成 lib/sprite-data.js（只含首页成年全息线稿）
#   PYTHONPATH=build/pylibs python tools-art/convert.py --colour     旧的正常色三视图 v2 转换，仅输出 build/art/ 作对照
#   游戏内 Q 版精灵由 tools-art/qban.py 从用户确认的黑底绿色原画生成（lib/qban-data.js）
#   PYTHONPATH=build/pylibs python tools-art/convert.py --legacy     用旧算法生成，仅输出 build/art/legacy/ 作对照
#   PYTHONPATH=build/pylibs python tools-art/convert.py --sheet 路径 --kind body|bust --names a,b,c [--grid 4x2]
#       转换新批次网格图，输出 build/art/qban/<名字>.png 与 build/art/qban/<批次>.json（基线偏移），不改动游戏数据
import sys, os, json, base64, numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = '../output/references/dafeiyu-20261112/character-standard.png'
CROPS = {
  'front': (92, 18, 513, 599), 'side': (583, 18, 997, 599), 'back': (1022, 18, 1484, 599),
  'smug': (12, 607, 398, 996), 'pout': (398, 607, 777, 996), 'wow': (780, 607, 1159, 996), 'think': (1163, 607, 1533, 996),
}
SPEC = {'front': (126, 0), 'side': (126, 0), 'back': (126, 0), 'smug': (196, .22), 'pout': (196, .22), 'wow': (196, .22), 'think': (196, .22)}

PARAMS = {
  'GAIN': 1.25,          # 填色整体增益：佩戴后觉得太暗/太亮，优先只调这一项
  'OUTLINE': 1.00,       # 外轮廓亮度
  'OUTLINE_PX': 1.3,     # 外轮廓在最终尺寸下的粗细（像素）
  'INK': 1.00,           # 内部勾线亮度
  'INK_CONTRAST': 0.06,  # 比周围暗多少才开始算勾线（0–1 亮度）
  'INK_SOFT': 0.08,      # 从开始算勾线到满亮度的过渡
  'INK_RADIUS': 2.5,     # 比较“周围”的半径（工作分辨率像素）
  'SPARK': 1.00,         # 眼睛高光
  'FILL': {               # 各类填色亮度
    'skin': 0.36, 'white': 0.40, 'gold': 0.42, 'blush': 0.55,   # 脸比头发亮一档，表情才认得出
    'blue_lo': 0.07, 'blue_hi': 0.17,   # 蓝色类：最暗处到最亮处
    'other': 0.12,
  },
}

# ---------- 背景 ----------
def bgmask(rgb):
  """从边缘泛洪纯白背景；白色衣物只要有闭合勾线就不会被抠掉。"""
  a = np.asarray(rgb).astype(np.int16)
  white = (a.min(axis=2) >= 232) & ((a.max(axis=2) - a.min(axis=2)) < 18)
  m = Image.fromarray((white * 255).astype(np.uint8)).copy()
  W, H = m.size
  for x in range(0, W, 3):
    for y in (0, H - 1):
      if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
  for y in range(0, H, 3):
    for x in (0, W - 1):
      if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
  return np.asarray(m) == 128

def _blur(arr, r):
  im = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8))
  return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255

def _morph(mask, size, op):
  im = Image.fromarray((mask * 255).astype(np.uint8))
  f = ImageFilter.MinFilter(size) if op == 'erode' else ImageFilter.MaxFilter(size)
  return np.asarray(im.filter(f)) > 127

# ---------- 分类与线条（在原图分辨率下计算） ----------
def classify(rgb, fg):
  P = PARAMS['FILL']
  hsv = np.asarray(rgb.convert('HSV')).astype(np.float32)
  H, S, V = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255   # PIL 色相 0–255
  warm = (H <= 32) | (H >= 236)
  light = (V > 0.72) & (S < 0.30)
  skin = light & warm & (S >= 0.035)
  white = light & ~skin
  blush = warm & (S >= 0.30) & (V > 0.70)
  gold = (H > 18) & (H < 48) & (S > 0.30) & (V > 0.45)
  blue = (H >= 130) & (H <= 200) & (S >= 0.25) & ~white
  fill = np.full(V.shape, P['other'], np.float32)
  vb = np.clip((V - 0.30) / 0.62, 0, 1)
  fill[blue] = (P['blue_lo'] + (P['blue_hi'] - P['blue_lo']) * vb)[blue]
  fill[white] = P['white']; fill[skin] = P['skin']; fill[gold] = P['gold']; fill[blush & ~gold] = P['blush']
  # 平涂：类内做轻微平滑，去掉原画的渐变噪点
  fill = np.clip(_blur(fill, 0.8) * PARAMS['GAIN'], 0, 1)
  # 眼睛高光：剪影内部、被非白色包围的小块纯白
  pure = (V > 0.93) & (S < 0.12) & fg
  big = _morph(_morph(pure, 5, 'erode'), 5, 'dilate')       # 大块白布
  spark = pure & ~big & ~_morph(white & ~pure, 3, 'dilate') # 不贴着白布
  return fill * fg, spark

def ink_lines(rgb, fg):
  """在工作分辨率（目标 3 倍）上找比周围暗的线：缩小时发丝已被平均掉，只剩主要勾线。"""
  a = np.asarray(rgb).astype(np.float32) / 255
  L = 0.30 * a[..., 0] + 0.55 * a[..., 1] + 0.15 * a[..., 2]
  local = _blur(L, PARAMS['INK_RADIUS'])
  d = np.clip((local - L - PARAMS['INK_CONTRAST']) / PARAMS['INK_SOFT'], 0, 1)
  d = np.maximum(d, np.clip((0.16 - L) / 0.10, 0, 1))   # 纯黑勾线
  return d * _morph(fg, 5, 'erode')                      # 外轮廓由剪影负责

# ---------- 合成 ----------
def render(crop, height=None, scale=None, fade=0, pad=4):
  """crop: 正常色 RGB 图（白底）。按 height 或固定 scale 缩放，返回 (亮度数组, 剪影底边相对原图的偏移)。"""
  fg = ~bgmask(crop)
  ys, xs = np.where(fg)
  y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
  c = crop.crop((x0, y0, x1, y1)); fg = fg[y0:y1, x0:x1]
  s = scale if scale else height / c.size[1]
  w, h = max(1, round(c.size[0] * s)), max(1, round(c.size[1] * s))
  # 全部在工作分辨率（目标 3 倍）上计算，线宽才可控
  k = 3; W3, H3 = w * k, h * k
  def down(arr, size):
    return np.asarray(Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8)).resize(size, Image.BOX)).astype(np.float32) / 255
  c3 = c.resize((W3, H3), Image.BOX)
  m3 = down(fg.astype(np.float32), (W3, H3))
  fg3 = m3 > 0.5
  fill3, spark3 = classify(c3, fg3)
  spark3 = spark3.astype(np.float32)
  ink3 = ink_lines(c3, fg3)
  inner = _morph(m3 > 0.5, max(3, round(PARAMS['OUTLINE_PX'] * k) * 2 - 1), 'erode')
  outline = (m3 > 0.5) & ~inner
  g3 = np.maximum.reduce([fill3, ink3 * PARAMS['INK'] * (m3 > 0.5), spark3 * PARAMS['SPARK'], outline * PARAMS['OUTLINE']])
  g = down(g3, (w, h)) * 255
  if fade:
    n = int(h * fade); ramp = np.linspace(1, 0, n) ** 1.5
    g[h - n:] *= ramp[:, None]
  return np.pad(np.clip(g, 0, 255).astype(np.uint8), pad), (y1, crop.size[1])

# ---------- 旧算法（对照用） ----------
def legacy(crop, height, fade=0, pad=4):
  fg = ~bgmask(crop); ys, xs = np.where(fg)
  y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
  c = crop.crop((x0, y0, x1, y1)); fg = fg[y0:y1, x0:x1]
  w = max(1, round(c.size[0] * height / c.size[1])); W2, H2 = w * 2, height * 2
  big = c.resize((W2, H2), Image.LANCZOS)
  mask = Image.fromarray((fg * 255).astype(np.uint8)).resize((W2, H2), Image.LANCZOS)
  a = np.asarray(big).astype(np.float32) / 255
  L = 0.30 * a[..., 0] + 0.55 * a[..., 1] + 0.15 * a[..., 2]
  m = np.asarray(mask).astype(np.float32) / 255
  Ls = _blur(L, 0.8); gx = np.zeros_like(Ls); gy = np.zeros_like(Ls)
  gx[:, 1:-1] = Ls[:, 2:] - Ls[:, :-2]; gy[1:-1] = Ls[2:] - Ls[:-2]
  edge = np.sqrt(gx * gx + gy * gy)
  ms = np.asarray(mask.filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32) / 255
  sx = np.zeros_like(ms); sy = np.zeros_like(ms)
  sx[:, 1:-1] = ms[:, 2:] - ms[:, :-2]; sy[1:-1] = ms[2:] - ms[:-2]
  sil = np.clip(np.sqrt(sx * sx + sy * sy) * 2.2, 0, 1)
  dark = np.clip((0.42 - L) / 0.42, 0, 1)
  inten = np.clip(0.05 + 0.58 * L ** 2.0 + 1.9 * edge + 0.35 * dark * (edge > 0.06), 0, 1)
  inten = np.maximum(inten * m, sil)
  g = np.asarray(Image.fromarray((inten * 255).astype(np.uint8)).resize((w, height), Image.LANCZOS)).astype(np.float32)
  if fade:
    n = int(height * fade); g[height - n:] *= (np.linspace(1, 0, n) ** 1.5)[:, None]
  return np.pad(g.astype(np.uint8), pad)

# 载入页成年全息像：loading-adult-v4 托腮版（黑底，亮绿外轮廓 + 暗绿填色）。
# 同 qban.py 只取亮度 max(R,G,B)，低于 18 视为黑（透明），不重绘。旧的 line-tail-simple-v3 线稿已不再使用。
HOLO_SRC = '../output/references/dafeiyu-20261112/loading-adult-v4/lvfy-loading-chin-rest-v4.png'
def holo(height):
  L = np.asarray(Image.open(HOLO_SRC).convert('RGB')).max(axis=2).astype(np.float32)
  L[L < 18] = 0
  ys = np.where(L.max(axis=1) > 0)[0]; xs = np.where(L.max(axis=0) > 0)[0]
  L = L[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
  w = round(L.shape[1] * height / L.shape[0])
  g = np.asarray(Image.fromarray(L, 'F').resize((w, height), Image.LANCZOS))
  g = np.clip(g, 0, 255); g[g < 6] = 0
  return np.pad(g.astype(np.uint8), 2)

def green_preview(g, path, zoom=3):
  g = g.astype(np.uint16)
  rgb = np.stack([g * 64 // 255, g, g * 94 // 255], axis=2).astype(np.uint8)
  im = Image.fromarray(rgb)
  im.resize((im.width * zoom, im.height * zoom), Image.NEAREST).save(path)

# ---------- 新批次网格图 ----------
BODY_H, BUST_H = 126, 196
def convert_sheet(path, kind, names, grid='4x2'):
  cols, rows = map(int, grid.split('x'))
  sheet = Image.open(path).convert('RGB')
  cw, ch = sheet.width // cols, sheet.height // rows
  cells = [sheet.crop(((i % cols) * cw, (i // cols) * ch, (i % cols + 1) * cw, (i // cols + 1) * ch)) for i in range(len(names))]
  os.makedirs('build/art/qban', exist_ok=True)
  meta = {'source': path, 'kind': kind, 'cells': {}}
  scale = None
  if kind == 'body':
    # 全身用统一比例：以第一格的剪影高度为基准，保证跳、蹲、坐时大小一致
    fg = ~bgmask(cells[0]); ys = np.where(fg)[0]
    scale = BODY_H / (ys.max() + 1 - ys.min())
  for name, cell in zip(names, cells):
    if not (~bgmask(cell)).any(): continue
    if kind == 'body': g, (bottom, cell_h) = render(cell, scale=scale)
    else: g, (bottom, cell_h) = render(cell, height=BUST_H, fade=.22)
    Image.fromarray(g).save(f'build/art/qban/{name}.png')
    green_preview(g, f'build/art/qban/{name}-preview.png')
    # 基线偏移：剪影底边距离格子底部的距离（最终像素），游戏按它把脚落在同一条线上
    meta['cells'][name] = {'w': g.shape[1], 'h': g.shape[0], 'baseline': round((cell_h - bottom) * (scale or 0), 1)}
    print(name, g.shape[1], g.shape[0])
  tag = os.path.splitext(os.path.basename(path))[0]
  json.dump(meta, open(f'build/art/qban/{tag}.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)

def main():
  args = sys.argv[1:]
  opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
  if '--sheet' in args:
    convert_sheet(opt('--sheet'), opt('--kind', 'body'), opt('--names').split(','), opt('--grid', '4x2'))
    return
  sheet = Image.open(SRC).convert('RGB')
  if '--legacy' in args:
    os.makedirs('build/art/legacy', exist_ok=True)
    for name, (h, fade) in SPEC.items():
      g = legacy(sheet.crop(CROPS[name]), h, fade)
      Image.fromarray(g).save(f'build/art/legacy/{name}.png'); green_preview(g, f'build/art/legacy/{name}-preview.png')
    return
  os.makedirs('build/art', exist_ok=True)
  res = {}
  if '--colour' in args:
    # 旧的正常色三视图转换，仅作对照输出，不再写入游戏数据（游戏里的 Q 版改由 tools-art/qban.py 生成）
    for name, (h, fade) in SPEC.items():
      g = render(sheet.crop(CROPS[name]), height=h, fade=fade)[0]
      Image.fromarray(g).save(f'build/art/{name}.png'); green_preview(g, f'build/art/{name}-preview.png')
    return
  res['holo'] = holo(276)
  lines = ['// 由 tools-art/convert.py 生成：载入页成年全息像（loading-adult-v4 托腮版），单通道亮度（0–255），运行时展开为绿色RGBA。Q 版精灵见 qban-data.js。', 'export const SPRITES={']
  total = 0
  for name, g in res.items():
    hgt, wid = g.shape; total += g.size
    Image.fromarray(g).save(f'build/art/{name}.png'); green_preview(g, f'build/art/{name}-preview.png')
    lines.append(f'  {name}:{{w:{wid},h:{hgt},d:"{base64.b64encode(g.tobytes()).decode()}"}},')
    print(name, wid, hgt)
  lines.append('};')
  open('lib/sprite-data.js', 'w', encoding='utf8').write('\n'.join(lines) + '\n')
  print('bytes', total)

if __name__ == '__main__': main()
