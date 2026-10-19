import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import * as THREE from 'three';import {createFacadeMaterial} from './src/facade-material.mjs';import {facadeAtlases} from './src/facades.mjs';import {colourRoofSurface} from './src/building-colours.mjs';
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;scene.add(new THREE.HemisphereLight('#ffffff','#ffffff',1));
const atlas=facadeAtlases.stone,data=new Uint8Array(256*256*4);
for(let y=0;y<256;y++)for(let x=0;x<256;x++){const u=(x+.5)/256,v=(y+.5)/256;let glass=false;for(const [l,r]of atlas.columns)for(const [top,bottom]of atlas.windows)if(u>l/atlas.width&&u<r/atlas.width&&v>1-bottom/atlas.height&&v<1-top/atlas.height)glass=true;const p=(y*256+x)*4;data[p]=data[p+1]=data[p+2]=glass?30:150;data[p+3]=255;}
const texture=new THREE.DataTexture(data,256,256);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;
const geometry=new THREE.PlaneGeometry(2,2);geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(12),3));
const mesh=new THREE.Mesh(geometry,createFacadeMaterial(texture,atlas));scene.add(mesh);const gl=renderer.getContext(),pixel=new Uint8Array(4);
function sample(u,v){gl.readPixels(Math.floor(u*256),Math.floor(v*256),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return Array.from(pixel.slice(0,3));}
function paint(rgb){for(let i=0;i<4;i++)geometry.attributes.color.setXYZ(i,...rgb);geometry.attributes.color.needsUpdate=true;renderer.render(scene,camera);}
const results=[];for(const rgb of [[.5,.06,.03],[.03,.06,.5]]){paint(rgb);results.push({wall:sample(.01,.5),glass:sample(159/1254,1-171/1254)});}
mesh.material.userData.night.value=1;paint([.82,.82,.82]);
const paneSamples=()=>atlas.windows.flatMap(([top,bottom])=>atlas.columns.map(([l,r])=>sample((l+r)/2/atlas.width,1-(top+bottom)/2/atlas.height)));
const nightA=paneSamples(),uv=geometry.attributes.uv;
for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)+4);uv.needsUpdate=true;renderer.render(scene,camera);const nightB=paneSamples();
for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)-4);uv.needsUpdate=true;
const grain=new THREE.DataTexture(new Uint8Array([90,90,90,255,150,150,150,255]),2,1);grain.colorSpace=THREE.SRGBColorSpace;grain.needsUpdate=true;mesh.material=colourRoofSurface(new THREE.MeshStandardMaterial({map:grain}),.1);
const roofs=[];for(const rgb of [[.2,.07,.03],[.03,.07,.2]]){paint(rgb);roofs.push({dark:sample(.25,.5),light:sample(.75,.5)});}
for(const atlas of Object.values(facadeAtlases)){mesh.material=createFacadeMaterial(texture,atlas,{continuous:true});paint([.5,.5,.5]);}
window.result={results,roofs,nightA,nightB};renderer.dispose();
`},bundle:true,format:'iife',write:false});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.setContent('<!doctype html><title>Surface colour check</title>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);assert.ok(r.results[0].wall[0]>r.results[0].wall[2]*2&&r.results[1].wall[2]>r.results[1].wall[0]*2,'Mapped paint changes masonry colour');
 for(let i=0;i<3;i++)assert.ok(Math.abs(r.results[0].glass[i]-r.results[1].glass[i])<=1,'Wall paint preserves the glazing colour');
 assert.ok(r.nightA.some((rgb,i)=>Math.abs(rgb[0]-r.nightB[i][0])>30),'Buildings with the same paint retain different night occupancy');
 assert.ok(r.roofs[0].light[0]>r.roofs[0].dark[0]+15,'Photographic grain survives roof tinting');assert.ok(r.roofs[0].dark[0]>r.roofs[0].dark[2]&&r.roofs[1].dark[2]>r.roofs[1].dark[0],'Roof hue follows its own reflectance');
 console.log('Surface colour pixels: masonry changes, glazing stays neutral, and roof colour retains texture grain.');
}finally{await browser.close();}
