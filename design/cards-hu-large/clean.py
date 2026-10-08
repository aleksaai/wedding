import cv2, numpy as np
from PIL import Image
# BACK: remove all text, dividers, box and frame
im = np.array(Image.open('HU-BACK.png').convert('RGB')).astype(np.uint8)
bgr = cv2.cvtColor(im, cv2.COLOR_RGB2BGR)
med = cv2.medianBlur(bgr, 51)
diff = np.abs(bgr.astype(int)-med.astype(int)).max(axis=2)
mask = (diff > 28).astype(np.uint8)*255
# explicit regions: inner box (incl. border) and outer frame lines
cv2.rectangle(mask, (100, 790), (1317, 1700), 255, -1)
H,W = mask.shape
frame = np.zeros_like(mask)
cv2.rectangle(frame, (38,38), (W-39,H-39), 255, 9)
mask |= frame
mask = cv2.dilate(mask, np.ones((7,7),np.uint8))
out = cv2.inpaint(bgr, mask, 12, cv2.INPAINT_TELEA)
# smooth the filled area so there are no smears, then add matching grain
soft = cv2.GaussianBlur(out, (0,0), 18)
m = cv2.GaussianBlur(mask.astype(np.float32)/255, (0,0), 6)[...,None]
filled = out*(1-m) + soft*m
rng = np.random.default_rng(1)
grain = rng.normal(0, 3.2, filled.shape[:2])[...,None]
filled = np.clip(filled + grain*m, 0, 255).astype(np.uint8)
Image.fromarray(cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)).save('back-clean.png')
# FRONT: keep the title, clear subtitle + verse + reference
f = Image.open('HU-FRONT.png'); fa = np.array(f)
rgb = cv2.cvtColor(fa[...,:3], cv2.COLOR_RGB2BGR)
fmed = cv2.medianBlur(rgb, 41)
fd = np.abs(rgb.astype(int)-fmed.astype(int)).max(axis=2)
fm = np.zeros(fd.shape, np.uint8)
region = (slice(420, 680), slice(300, 1120))
fm[region] = ((fd[region] > 30)*255).astype(np.uint8)
fm = cv2.dilate(fm, np.ones((9,9),np.uint8))
fo = cv2.inpaint(rgb, fm, 10, cv2.INPAINT_TELEA)
fsoft = cv2.GaussianBlur(fo, (0,0), 8)
fmm = cv2.GaussianBlur(fm.astype(np.float32)/255, (0,0), 4)[...,None]
fo = (fo*(1-fmm) + fsoft*fmm)
fo = np.clip(fo + rng.normal(0,2.5,fo.shape[:2])[...,None]*fmm,0,255).astype(np.uint8)
fa2 = fa.copy(); fa2[...,:3] = cv2.cvtColor(fo, cv2.COLOR_BGR2RGB)
Image.fromarray(fa2).save('front-clean.png')
