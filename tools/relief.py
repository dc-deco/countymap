import math, json, os, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
S=json.load(open('dem/meta.json')); Z=S['z']
elev=np.load('elev.npy'); H,W=elev.shape
def med3(a):
    p=np.pad(a,1,mode='edge')
    st=[p[i:i+a.shape[0],j:j+a.shape[1]] for i in range(3) for j in range(3)]
    return np.median(np.stack(st,0),axis=0)
for _ in range(2):
    for r in range(0,H,512):
        r0,r1=max(0,r-1),min(H,r+513); blk=elev[r0:r1]; m=med3(blk)
        bad=(np.abs(blk-m)>110.0)|(blk<55.0); blk[bad]=m[bad]; elev[r0:r1]=blk
elev=np.clip(elev,60.0,2100.0)
def lon2px(l): return (l+180.0)/360.0*(2**Z)*256
def lat2px(l):
    r=math.radians(l); return (1.0-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2.0*(2**Z)*256
ox,oy=S['x0']*256,S['y0']*256
CW,CE,CS,CN=-90.05,-81.55,36.22,39.42
cx0,cx1=int(round(lon2px(CW)-ox)),int(round(lon2px(CE)-ox))
cy0,cy1=int(round(lat2px(CN)-oy)),int(round(lat2px(CS)-oy))
elev=elev[cy0:cy1,cx0:cx1]; h,w=elev.shape
print("crop %dx%d  range %.0f..%.0f"%(w,h,elev.min(),elev.max()))
mpp=156543.03392*math.cos(math.radians((CS+CN)/2))/(2**Z)
def hs(el,az,alt,zf):
    dy,dx=np.gradient(el*zf,mpp)
    slope=np.arctan(np.hypot(dx,dy)); aspect=np.arctan2(-dx,dy)
    a=math.radians(az); z=math.radians(alt)
    return np.clip(math.sin(z)*np.cos(slope)+math.cos(z)*np.sin(slope)*np.cos(a-aspect),0,1)
zf=2.4
shade=(0.42*hs(elev,315,45,zf)+0.25*hs(elev,270,55,zf)+0.20*hs(elev,360,62,zf)+0.13*hs(elev,225,40,zf))
shade=np.clip((shade-0.30)/0.52,0,1)
dy,dx=np.gradient(elev,mpp); steep=np.clip(np.arctan(np.hypot(dx,dy))/math.radians(14),0,1)
e=np.clip((elev-80.0)/(820.0-80.0),0,1)[...,None]
crop_=np.array([188,192,146],np.float32); past=np.array([146,163,112],np.float32)
upl =np.array([ 92,118, 82],np.float32); ridge=np.array([104,112, 78],np.float32)
base=np.where(e<0.30, crop_+(past-crop_)*(e/0.30),
      np.where(e<0.66, past+(upl-past)*((e-0.30)/0.36),
                       upl+(ridge-upl)*((e-0.66)/0.34)))
forest=np.array([ 72,100, 70],np.float32); s=(0.55*steep)[...,None]
base=base*(1-s)+forest*s
img=np.clip(base*(0.50+0.70*shade[...,None]),0,255).astype(np.uint8)
out=Image.fromarray(img)
json.dump(dict(W=CW,E=CE,S=CS,N=CN,px_w=w,px_h=h,z=Z,org_x=ox+cx0,org_y=oy+cy0),
          open('frame.json','w'),indent=1)
for tw in (2400,2048):
    th=int(round(tw*h/w)); r=out.resize((tw,th),Image.LANCZOS)
    for q in (70,78):
        p=f"relief_{tw}_{q}.webp"; r.save(p,"WEBP",quality=q,method=6)
        print(f"  {tw}x{th} q{q}: {os.path.getsize(p)/1024:.0f} KB (b64 {os.path.getsize(p)*4/3/1024:.0f} KB)")
out.resize((1500,int(round(1500*h/w))),Image.LANCZOS).save("preview.png")
print("frame:",json.load(open('frame.json')))
