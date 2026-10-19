/** Downsample radiance before RGBE encoding; never average encoded exponents. */
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import * as THREE from 'three';import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';import {encodeReflectionHDR} from './reflection-hdr.mjs';
const loader=new HDRLoader().setDataType(THREE.FloatType);
for(const mode of ['day','golden','night']){
 const metadata=JSON.parse(await fs.readFile('dist/assets/reflections/shard-'+mode+'-source.json','utf8'));
 for(const altitude of [45,230]){
  const path='dist/assets/reflections/shard-'+mode+'-'+altitude,source=await fs.readFile(path+'.hdr'),image=loader.parse(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength)),width=image.width/2,height=image.height/2,pixels=new Float32Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let j=0;j<3;j++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)pixels[(y*width+x)*4+j]+=image.data[((y*2+dy)*image.width+x*2+dx)*4+j]/4;
  const data=encodeReflectionHDR(pixels,width,height),file='shard-'+mode+'-'+altitude+'-mobile.hdr';await fs.writeFile('dist/assets/reflections/'+file,data);metadata.files=metadata.files.filter(f=>f.file!==file);metadata.files.push({file,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,position:[2520.93,altitude,-459.745],panorama:[width,height],downsampledInLinearRadiance:true});console.log(file,data.length);
 }
 await fs.writeFile('dist/assets/reflections/shard-'+mode+'-source.json',JSON.stringify(metadata,null,2));
}
