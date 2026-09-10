const fs=require('fs');
const F=JSON.parse(fs.readFileSync('frame.json'));
const Z=F.z, WORLD=Math.pow(2,Z)*256, SVG_W=2000, K=SVG_W/F.px_w, SVG_H=+(F.px_h*K).toFixed(2);
const lon2gx=l=>(l+180)/360*WORLD;
const lat2gy=l=>{const r=l*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*WORLD;};
const px=([lon,lat])=>[(lon2gx(lon)-F.org_x)*K,(lat2gy(lat)-F.org_y)*K];
const R=(n,d=1)=>{const p=Math.pow(10,d);return Math.round(n*p)/p;};
const PAD=60; // svg units of slack outside frame
const inFrame=([x,y])=>x>=-PAD&&x<=SVG_W+PAD&&y>=-PAD&&y<=SVG_H+PAD;
function lines(geom){return geom.type==='LineString'?[geom.coordinates]:geom.type==='MultiLineString'?geom.coordinates:[];}
function polys(geom){return geom.type==='Polygon'?[geom.coordinates]:geom.type==='MultiPolygon'?geom.coordinates:[];}
// split a projected line into runs inside the frame, drop near-duplicate points
function runs(pts,minStep){
  const out=[];let cur=[];
  for(let i=0;i<pts.length;i++){
    const p=pts[i], ok=inFrame(p);
    if(ok){
      if(!cur.length) {if(i>0)cur.push(pts[i-1]); cur.push(p);}
      else {const l=cur[cur.length-1]; if(Math.hypot(p[0]-l[0],p[1]-l[1])>=minStep) cur.push(p);}
    } else { if(cur.length){cur.push(p);out.push(cur);cur=[];} }
  }
  if(cur.length)out.push(cur);
  return out.filter(r=>r.length>1);
}
const dOf=(r,d=1)=>r.map((p,i)=>`${i?'L':'M'}${R(p[0],d)} ${R(p[1],d)}`).join('');
function thin(ring,minStep){
  const o=[ring[0]];
  for(let i=1;i<ring.length;i++){const l=o[o.length-1],p=ring[i];
    if(Math.hypot(p[0]-l[0],p[1]-l[1])>=minStep)o.push(p);}
  if(o.length<4)return null;
  return o;
}
// ---------- rivers ----------
const riverLayers=[];
function addRivers(file,minStep,widthFn){
  const j=JSON.parse(fs.readFileSync('ne/'+file+'.geojson'));
  for(const f of j.features){
    if(!f.geometry)continue;
    for(const ls of lines(f.geometry)){
      const pts=ls.map(px);
      for(const r of runs(pts,minStep)){
        const w=widthFn(f.properties);
        if(w>0) riverLayers.push({w,d:dOf(r),n:f.properties.name||''});
      }
    }
  }
}
const sw=p=>{const s=p.strokeweig!==undefined?p.strokeweig:(p.scalerank!==undefined?1/(p.scalerank||1):0.5);return s;};
addRivers('ne_10m_rivers_lake_centerlines',2.0,p=>{
  const n=(p.name||'').toLowerCase();
  if(['mississippi','ohio'].includes(n))return 5.0;
  if(['tennessee','cumberland','kentucky','wabash'].includes(n))return 3.2;
  return 2.2;});
addRivers('ne_10m_rivers_north_america',2.4,p=>1.5);
// ---------- lakes ----------
const lakes=[];
function addLakes(file,minArea){
  const j=JSON.parse(fs.readFileSync('ne/'+file+'.geojson'));
  for(const f of j.features){
    if(!f.geometry)continue;
    for(const poly of polys(f.geometry)){
      const rings=poly.map(r=>r.map(px)).filter(r=>r.some(inFrame));
      if(!rings.length)continue;
      let a=0;const r0=rings[0];
      for(let i=0,j2=r0.length-1;i<r0.length;j2=i++)a+=(r0[j2][0]*r0[i][1]-r0[i][0]*r0[j2][1]);
      if(Math.abs(a/2)<minArea)continue;
      const th=rings.map(r=>thin(r,1.6)).filter(Boolean);
      if(!th.length)continue;
      lakes.push({d:th.map(r=>dOf(r,1)+'Z').join(''),n:f.properties.name||''});
    }
  }
}
addLakes('ne_10m_lakes',3); addLakes('ne_10m_lakes_north_america',3);
// ---------- urban ----------
const urban=[];
{
  const j=JSON.parse(fs.readFileSync('ne/ne_10m_urban_areas.geojson'));
  for(const f of j.features){
    if(!f.geometry)continue;
    for(const poly of polys(f.geometry)){
      const rings=poly.map(r=>r.map(px)).filter(r=>r.some(inFrame));
      if(!rings.length)continue;
      let a=0;const r0=rings[0];
      for(let i=0,j2=r0.length-1;i<r0.length;j2=i++)a+=(r0[j2][0]*r0[i][1]-r0[i][0]*r0[j2][1]);
      if(Math.abs(a/2)<12)continue;
      const th=rings.map(r=>thin(r,4.5)).filter(Boolean);
      if(!th.length)continue;
      urban.push({d:th.map(r=>dOf(r,0)+'Z').join('')});
    }
  }
}
const bytes=o=>JSON.stringify(o).length;
console.log('rivers',riverLayers.length,'segs',bytes(riverLayers),'B');
console.log('lakes',lakes.length,bytes(lakes),'B');
console.log('urban',urban.length,bytes(urban),'B');
fs.writeFileSync('water.json',JSON.stringify({rivers:riverLayers,lakes,urban},null,0));
