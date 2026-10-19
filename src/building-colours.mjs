import * as THREE from 'three';

// Linear RGB averages of the bundled atlases, excluding their darkest pixels.
// These compensate the source colour while retaining its masonry detail.
export const facadeMeans={stone:[.4188214,.3594386,.3028081],brick:[.3311647,.2552147,.1916563]};
const aliases={lightbrown:'#b08b6a',darkbrown:'#654a35',cream:'#e4d6ad',sandstone:'#c6b58e'};
export function parseMappedColour(value){
  if(typeof value!=='string')return null;
  let name=value.trim().toLowerCase().replace(/[ _-]/g,'');name=aliases[name]||name;
  if(!/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/.test(name)&&!Object.hasOwn(THREE.Color.NAMES,name))return null;
  return new THREE.Color(name);
}
const reflectance=color=>color.toArray().map(v=>THREE.MathUtils.clamp(v,.018,.82));
const vary=(values,seed)=>values.map((v,i)=>v*(.94+.06*((Math.sin(seed*7.13+i*21.4)*437.58)%1+1)/2));
export function buildingColours(tags,type,seed=0){
  const wall=parseMappedColour(tags['building:colour']),roof=parseMappedColour(tags['roof:colour']);
  const wallDefault=type==='glass'?[.85,.9,.92]:reflectance(new THREE.Color(type==='brick'?'#9b745b':'#b5b2a7'));
  const roofDefault=reflectance(new THREE.Color(tags['roof:material']==='copper'?'#77938a':tags['roof:material']==='tile'?'#8d6656':'#686c70'));
  return {wall:wall?reflectance(wall):vary(wallDefault,seed),roof:roof?reflectance(roof):vary(roofDefault,seed+11),wallMapped:!!wall,roofMapped:!!roof};
}

/** Apply a physical colour to the photographic grain without retaining its cast. */
export function colourRoofSurface(material,mean){
  material.color.set('#ffffff');material.vertexColors=true;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float roofGrain=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/${mean.toFixed(7)};
      diffuseColor.rgb=vec3(clamp(roofGrain,.2,2.4));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\ndiffuseColor.rgb=min(diffuseColor.rgb,vec3(.88));`);
  };
  material.customProgramCacheKey=()=> `mapped-roof-colour-v1-${mean}`;return material;
}
