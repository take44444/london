import {cp,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {MeshoptSimplifier} from 'meshoptimizer';
import {leafCards} from './tree-leaf-cards.mjs';

const [input,alpha,output]=process.argv.slice(2);
if(!input||!alpha||!output)throw Error('Usage: node scripts/prepare-tree.mjs source.gltf leaves-alpha.jpg output.glb');
const work=await mkdtemp(path.join(tmpdir(),'london-tree-'));
await cp(path.dirname(path.resolve(input)),work,{recursive:true});
const model=JSON.parse(await readFile(input,'utf8'));
const leaves=model.materials.find(m=>m.name==='tree_small_02_leaves');
const image=model.images[model.textures[leaves.pbrMetallicRoughness.baseColorTexture.index].source];
const color=path.join(work,image.uri),packed='textures/leaves-rgba.png';
const rgb=await sharp(color).removeAlpha().raw().toBuffer({resolveWithObject:true});
const opacity=await sharp(alpha).extractChannel(0).raw().toBuffer();
const packedFile=path.join(work,packed);
await sharp(rgb.data,{raw:rgb.info}).joinChannel(opacity,{raw:{width:rgb.info.width,height:rgb.info.height,channels:1}}).png().toFile(packedFile);
if(!(await sharp(packedFile).metadata()).hasAlpha)throw Error('Leaf opacity was lost during channel packing');
image.uri=packed;image.mimeType='image/png';
leaves.alphaMode='MASK';leaves.alphaCutoff=.45;
for(const material of model.materials){material.pbrMetallicRoughness.metallicFactor=0;}
// Global mesh reduction deletes small disconnected leaves. Preserve their coverage
// by fitting each leaf island to a card, and simplify only bark and branches.
const binary=await readFile(path.join(work,model.buffers[0].uri)),chunks=[binary];let byteLength=binary.length;
const components={VEC3:3,VEC2:2,SCALAR:1};
const readAccessor=id=>{
  const a=model.accessors[id],view=model.bufferViews[a.bufferView],types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array},Type=types[a.componentType];
  return new Type(binary.buffer,binary.byteOffset+(view.byteOffset||0)+(a.byteOffset||0),a.count*components[a.type]);
};
const append=(array,type,componentType)=>{
  const padding=(4-byteLength%4)%4;if(padding){chunks.push(Buffer.alloc(padding));byteLength+=padding;}
  const view=model.bufferViews.length;model.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:array.byteLength,target:type==='SCALAR'?34963:34962});
  chunks.push(Buffer.from(array.buffer,array.byteOffset,array.byteLength));byteLength+=array.byteLength;
  const accessor={bufferView:view,componentType,type,count:array.length/components[type]};
  if(type==='VEC3'){
    accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<array.length;i++){
      const k=i%3;accessor.min[k]=Math.min(accessor.min[k],array[i]);accessor.max[k]=Math.max(accessor.max[k],array[i]);
    }
  }
  const index=model.accessors.length;model.accessors.push(accessor);return index;
};
await MeshoptSimplifier.ready;
for(const mesh of model.meshes)for(const primitive of mesh.primitives){
  const positions=readAccessor(primitive.attributes.POSITION),indices=new Uint32Array(readAccessor(primitive.indices));
  if(model.materials[primitive.material]===leaves){
    const cards=leafCards(positions,readAccessor(primitive.attributes.NORMAL),readAccessor(primitive.attributes.TEXCOORD_0),indices);
    primitive.attributes={POSITION:append(cards.positions,'VEC3',5126),NORMAL:append(cards.normals,'VEC3',5126),TEXCOORD_0:append(cards.uv,'VEC2',5126)};
    primitive.indices=append(cards.indices,'SCALAR',5125);
    console.log(`Preserved ${cards.cards} of ${cards.components} leaf islands as textured cards.`);
    if(cards.cards<cards.components*.99)throw Error('Too many leaf islands were lost');
  }else{
    const [reduced]=MeshoptSimplifier.simplify(indices,positions,3,Math.floor(indices.length*.12/3)*3,.002);
    primitive.indices=append(reduced,'SCALAR',5125);
  }
}
model.buffers[0].byteLength=byteLength;await writeFile(path.join(work,model.buffers[0].uri),Buffer.concat(chunks));
const fixed=path.join(work,'tree-fixed.gltf');await writeFile(fixed,JSON.stringify(model));
const cli=new URL('../node_modules/.bin/gltf-transform',import.meta.url).pathname;
const result=spawnSync(cli,['optimize',fixed,path.resolve(output),'--compress','meshopt','--texture-compress','webp','--texture-size','1024','--simplify','false'],{stdio:'inherit'});
if(result.status!==0)throw Error('Tree optimization failed');
