import cv2, numpy as np
from PIL import Image
im = np.array(Image.open('HU-BACK.png').convert('RGB'))
bgr = cv2.cvtColor(im, cv2.COLOR_RGB2BGR).astype(np.float32)
H,W = bgr.shape[:2]
# 1) box: vertical interpolation between clean rows above and below, per column
y0, y1, x0, x1 = 782, 1708, 96, 1321
top = cv2.GaussianBlur(bgr[y0-14:y0-2].mean(axis=0, keepdims=True), (0,0), sigmaX=160)[0]
bot = cv2.GaussianBlur(bgr[y1+2:y1+14].mean(axis=0, keepdims=True), (0,0), sigmaX=160)[0]
t = np.linspace(0,1,y1-y0)[:,None,None]
fill = top[None]*(1-t) + bot[None]*t
# feather columns at left/right edges into the original
work = bgr.copy()
work[y0:y1, x0:x1] = fill[:, x0:x1]
# 2) everything else (text, dividers, frame): telea
med = cv2.medianBlur(bgr.astype(np.uint8), 51)
diff = np.abs(bgr-med.astype(np.float32)).max(axis=2)
mask = (diff > 28).astype(np.uint8)*255
mask[y0:y1, x0:x1] = 0
frame = np.zeros_like(mask); cv2.rectangle(frame, (38,38), (W-39,H-39), 255, 9); mask |= frame
# box border edges (left/right/top/bottom strips) also need telea
edge = np.zeros_like(mask); cv2.rectangle(edge,(x0,y0),(x1,y1),255,14); mask |= edge
mask = cv2.dilate(mask, np.ones((7,7),np.uint8))
out = cv2.inpaint(work.astype(np.uint8), mask, 12, cv2.INPAINT_TELEA).astype(np.float32)
soft = cv2.GaussianBlur(out, (0,0), 14)
full = mask.copy(); full[y0:y1, x0:x1] = 255
m = cv2.GaussianBlur(full.astype(np.float32)/255, (0,0), 5)[...,None]
res = out*(1-m) + soft*m
# grain matched to original texture
orig_grain = (bgr - cv2.GaussianBlur(bgr,(0,0),3))[300:700,60:280].std()
rng = np.random.default_rng(7)
g = rng.normal(0, orig_grain, (H,W))[...,None]
res = np.clip(res + g*m, 0, 255).astype(np.uint8)
print('grain', orig_grain)
Image.fromarray(cv2.cvtColor(res, cv2.COLOR_BGR2RGB)).save('back-clean.png')
Image.fromarray(cv2.cvtColor(res, cv2.COLOR_BGR2RGB)).resize((708,1063)).save('p_back.png')
