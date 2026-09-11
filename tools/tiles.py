import math, json, os
Z = 10
W, E = -90.30, -81.30
S, N = 34.45, 41.10
def lon2x(lon,z): return (lon+180.0)/360.0*(2**z)
def lat2y(lat,z):
    r=math.radians(lat)
    return (1.0-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2.0*(2**z)
x0,x1 = int(math.floor(lon2x(W,Z))), int(math.floor(lon2x(E,Z)))
y0,y1 = int(math.floor(lat2y(N,Z))), int(math.floor(lat2y(S,Z)))
tiles=[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]
meta=dict(z=Z,x0=x0,x1=x1,y0=y0,y1=y1,W=W,E=E,S=S,N=N,
          px_w=(x1-x0+1)*256, px_h=(y1-y0+1)*256, n=len(tiles))
json.dump(meta,open('dem/meta.json','w'),indent=1)
print(json.dumps(meta,indent=1))
with open('dem/urls.txt','w') as f:
    for x,y in tiles:
        f.write(f"url = https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{x}/{y}.png\noutput = dem/{Z}_{x}_{y}.png\n")
