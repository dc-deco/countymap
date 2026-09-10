import math, json, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
S=json.load(open('dem/meta.json')); Z=S['z']
H=(S['y1']-S['y0']+1)*256; W=(S['x1']-S['x0']+1)*256
elev=np.zeros((H,W),np.float32)
for x in range(S['x0'],S['x1']+1):
    for y in range(S['y0'],S['y1']+1):
        a=np.asarray(Image.open(f"dem/{Z}_{x}_{y}.png").convert('RGB'),np.float32)
        elev[(y-S['y0'])*256:(y-S['y0']+1)*256,(x-S['x0'])*256:(x-S['x0']+1)*256]=\
            a[:,:,0]*256.0+a[:,:,1]+a[:,:,2]/256.0-32768.0
print("raw range %.0f..%.0f"%(elev.min(),elev.max()))
def med3_strip(arr):
    p=np.pad(arr,1,mode='edge')
    st=[p[i:i+arr.shape[0],j:j+arr.shape[1]] for i in range(3) for j in range(3)]
    return np.median(np.stack(st,0),axis=0)
# despeckle: replace pixels deviating >150 m from local median
fixed=0
STRIP=512
for r in range(0,H,STRIP):
    r0,r1=max(0,r-1),min(H,r+STRIP+1)
    blk=elev[r0:r1]
    med=med3_strip(blk)
    bad=np.abs(blk-med)>150.0
    blk[bad]=med[bad]
    elev[r0:r1]=blk
    fixed+=int(bad.sum())
print("despeckled px",fixed,"-> range %.0f..%.0f"%(elev.min(),elev.max()))
np.save('elev.npy',elev)
