const fs=require('fs'), topo=require('topojson-client'), polylabel=require('polylabel').default;
const F=JSON.parse(fs.readFileSync('frame.json'));
const Z=F.z, WORLD=Math.pow(2,Z)*256, SVG_W=2000, K=SVG_W/F.px_w;
const SVG_H=+(F.px_h*K).toFixed(2);
const lon2gx=l=>(l+180)/360*WORLD;
const lat2gy=l=>{const r=l*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*WORLD;};
const px=([lon,lat])=>[ (lon2gx(lon)-F.org_x)*K, (lat2gy(lat)-F.org_y)*K ];
const us=JSON.parse(fs.readFileSync('package/counties-10m.json'));
const counties=topo.feature(us,us.objects.counties).features.filter(f=>String(f.id).startsWith('21'));
const states=topo.feature(us,us.objects.states).features.filter(f=>String(f.id)==='21');
console.log('KY counties',counties.length,'state',states.length);
const R=(n,d=1)=>{const p=Math.pow(10,d);return Math.round(n*p)/p;};
function ringsOf(g){return g.type==='Polygon'?[g.coordinates]:g.coordinates;}
function toPath(g,d=1){
  let s='';
  for(const poly of ringsOf(g)) for(const ring of poly){
    let prev=null;
    ring.forEach((c,i)=>{
      const [x,y]=px(c), X=R(x,d), Y=R(y,d);
      if(i===0){s+=`M${X} ${Y}`;prev=[X,Y];}
      else if(X!==prev[0]||Y!==prev[1]){s+=`L${X} ${Y}`;prev=[X,Y];}
    });
    s+='Z';
  }
  return s;
}
// largest ring in projected space, for pole-of-inaccessibility
function biggestRing(g){
  let best=null,bestA=-1;
  for(const poly of ringsOf(g)){
    const r=poly[0].map(px);
    let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]);
    a=Math.abs(a/2); if(a>bestA){bestA=a;best=poly.map(rg=>rg.map(px));}
  }
  return {ring:best,area:bestA};
}
function gxy2lonlat(x,y){
  const gx=x/K+F.org_x, gy=y/K+F.org_y;
  const lon=gx/WORLD*360-180;
  const n=Math.PI*(1-2*gy/WORLD);
  return [lon, Math.atan(Math.sinh(n))*180/Math.PI];
}
const out=[];
for(const f of counties){
  const name=f.properties.name;
  const {ring,area}=biggestRing(f.geometry);
  const p=polylabel(ring,0.4);
  const [lon,lat]=gxy2lonlat(p[0],p[1]);
  out.push({name,fips:f.id,d:toPath(f.geometry),x:R(p[0],1),y:R(p[1],1),
            lon:R(lon,4),lat:R(lat,4),area:Math.round(area)});
}
out.sort((a,b)=>a.name.localeCompare(b.name));
const outline=toPath(states[0].geometry,1);
fs.writeFileSync('counties.json',JSON.stringify({svg_w:SVG_W,svg_h:SVG_H,counties:out,outline},null,0));
console.log('svg',SVG_W,'x',SVG_H);
console.log('path bytes',out.reduce((a,c)=>a+c.d.length,0),'outline',outline.length);
console.log('sample',out.slice(0,3).map(c=>`${c.name} @${c.lon},${c.lat}`));
const xs=out.flatMap(c=>[c.x]),ys=out.flatMap(c=>[c.y]);
console.log('label x',Math.min(...xs).toFixed(0),Math.max(...xs).toFixed(0),'y',Math.min(...ys).toFixed(0),Math.max(...ys).toFixed(0));
