import {readFile,writeFile} from 'node:fs/promises';
const file=new URL('../dist/assets/london-map.json',import.meta.url),map=JSON.parse(await readFile(file));
const keys=['roof:direction','roof:orientation','roof:angle','roof:levels','building:min_level'];
let records;
if(process.argv[2])records=JSON.parse(await readFile(process.argv[2]));
else{
 records=[];const ids=map.buildings.filter(b=>b.roofRect&&b.t['roof:shape']&&b.t['roof:shape']!=='flat'&&b.id.startsWith('w')).map(b=>b.id.slice(1));
 for(let i=0;i<ids.length;i+=200){
  const url=new URL('https://api.openstreetmap.org/api/0.6/ways.json');url.searchParams.set('ways',ids.slice(i,i+200).join(','));
  const response=await fetch(url,{headers:{'User-Agent':'London-local-scene-builder/1.0 (roof tag refresh)','Accept':'application/json'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Roof tag API returned HTTP ${response.status}`);
  const data=await response.json();records.push(...data.elements.map(e=>({id:`w${e.id}`,tags:e.tags||{}})));
 }
}
const byId=new Map(map.buildings.map(b=>[b.id,b]));let added=0,ways=0;
for(const record of records){const building=byId.get(record.id);if(!building)continue;let changed=false;for(const key of keys)if(typeof record.tags?.[key]==='string'&&building.t[key]===undefined){building.t[key]=record.tags[key];added++;changed=true;}if(changed)ways++;}
map.source.roof_metadata={provider:'OpenStreetMap API',endpoint:'https://api.openstreetmap.org/api/0.6/ways.json',fetched_at:new Date().toISOString(),added_tags:added,ways,keys};
await writeFile(file,JSON.stringify(map));console.log({ways,added});
