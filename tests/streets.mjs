import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {roadWidth,offsetStreet,streetOutline} from '../src/streets.mjs';
const raw=await readFile(new URL('../dist/assets/london-map.json',import.meta.url));
const map=JSON.parse(raw),street=JSON.parse(await readFile(new URL('../dist/assets/london-streets.json',import.meta.url)));
assert.equal(street.mapSha256,createHash('sha256').update(raw).digest('hex'),'The baked streets match the shipping map');
assert.equal(roadWidth({highway:'primary',lanes:'3'}).width,9.3);
const edge=offsetStreet([[0,0],[10,0],[10,10]],2);
assert.deepEqual(edge,[[0,2],[8,2],[8,10]],'Mitered offsets preserve the road width through corners');
assert.ok(streetOutline([[0,0],[0,0],[5,0]],6)[0].flat().every(Number.isFinite),'Duplicate map nodes do not create invalid outlines');
const inRing=(x,z,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
const polygons=street.pavement.map(p=>({p,minX:Math.min(...p[0].map(q=>q[0])),maxX:Math.max(...p[0].map(q=>q[0])),minZ:Math.min(...p[0].map(q=>q[1])),maxZ:Math.max(...p[0].map(q=>q[1]))}));
const paved=(x,z)=>polygons.some(b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ&&inRing(x,z,b.p[0])&&!b.p.slice(1).some(h=>inRing(x,z,h)));
let checked=0;
for(const road of map.roads){
 if(roadWidth(road.t).pedestrian||road.t.bridge==='yes'||road.t.tunnel==='yes'||Math.hypot(...road.p[Math.floor(road.p.length/2)])>2050)continue;
 for(let i=1;i<road.p.length;i+=3){const a=road.p[i-1],b=road.p[i];if(Math.hypot(b[0]-a[0],b[1]-a[1])<2)continue;
 const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;assert.equal(paved(x,z),false,'Raised pavements leave carriageway centres clear');checked++;}
}
assert.ok(checked>5000);assert.ok(polygons.length>1000&&street.kerbRings.length>500);
for(const ring of street.kerbRings)assert.ok(ring.flat().every(Number.isFinite));
console.log(`Streets: mapped geometry, corner widths, finite kerbs and ${checked} clear carriageway samples passed.`);
