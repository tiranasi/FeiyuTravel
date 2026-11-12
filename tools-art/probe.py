import sys, numpy as np
from PIL import Image
im=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
H,W,_=im.shape
nonwhite=(im.min(axis=2)<235)
cols=nonwhite.sum(0); rows=nonwhite.sum(1)
def runs(v,th):
  out=[];s=None
  for i,x in enumerate(v):
    if x>th and s is None:s=i
    if x<=th and s is not None:out.append((s,i));s=None
  if s is not None:out.append((s,len(v)))
  return out
print(W,H)
print('row runs',runs(rows,3))
for (a,b) in runs(rows,3):
  band=nonwhite[a:b]
  print(a,b,'col runs',[r for r in runs(band.sum(0),2) if r[1]-r[0]>20])
