import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ClipperLib from 'clipper-lib';
import {roadWidth,streetOutline} from '../src/streets.mjs';
const input=new URL('../dist/assets/london-map.json',import.meta.url),raw=await readFile(input),map=JSON.parse(raw);
const roads=map.roads.filter(r=>r.p.length>1&&!roadWidth(r.t).pedestrian&&r.t.bridge!=='yes'&&r.t.tunnel!=='yes'&&Math.hypot(...r.p[Math.floor(r.p.length/2)])<=2050);
const integer=ring=>ring.map(p=>({X:Math.round(p[0]*1000),Y:Math.round(p[1]*1000)}));
const fromInteger=ring=>ring.map(p=>[p.X/1000,p.Y/1000]);
function operation(subject,clip=[],type=ClipperLib.ClipType.ctUnion){
 const c=new ClipperLib.Clipper(),tree=new ClipperLib.PolyTree();
 c.AddPaths(subject,ClipperLib.PolyType.ptSubject,true);
 if(clip.length)c.AddPaths(clip,ClipperLib.PolyType.ptClip,true);
 if(!c.Execute(type,tree,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero))throw Error('Street clipping failed');
 return tree;
}
function roadUnion(extra){
 const included=extra?map.roads.filter(r=>r.p.length>1&&r.t.bridge!=='yes'&&r.t.tunnel!=='yes'&&Math.hypot(...r.p[Math.floor(r.p.length/2)])<=2050):roads;
 const paths=included.map(r=>streetOutline(r.p,roadWidth(r.t).width+(roadWidth(r.t).pedestrian?0:extra))).filter(Boolean).map(p=>integer(p[0]));
 for(const p of paths)if(!ClipperLib.Clipper.Orientation(p))p.reverse();
 return operation(paths);
}
console.time('Street geometry');
const inner=roadUnion(0),outer=roadUnion(3.6);
const innerPaths=ClipperLib.Clipper.PolyTreeToPaths(inner),water=map.water.flatMap(p=>p.map((ring,i)=>{const path=integer(ring);if(ClipperLib.Clipper.Orientation(path)!==(i===0))path.reverse();return path;}));
const result=operation(ClipperLib.Clipper.PolyTreeToPaths(outer),[...innerPaths,...water],ClipperLib.ClipType.ctDifference);
const pavement=ClipperLib.JS.PolyTreeToExPolygons(result).map(p=>[fromInteger(p.outer),...p.holes.map(fromInteger)]);
const asset={source:'OpenStreetMap contributors',mapSha256:createHash('sha256').update(raw).digest('hex'),pavement,kerbRings:innerPaths.map(fromInteger),roadCount:roads.length};
await writeFile(new URL('../dist/assets/london-streets.json',import.meta.url),JSON.stringify(asset));
console.timeEnd('Street geometry');console.log({roads:roads.length,pavements:pavement.length,kerbRings:asset.kerbRings.length});
