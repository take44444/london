/** Shared street dimensions and geometric kerb clipping, in local metres. */
const number=(v,f)=>Number.isFinite(parseFloat(v))?parseFloat(v):f;
export function roadWidth(tags){
  const pedestrian=['footway','path','pedestrian','cycleway'].includes(tags.highway);
  return {pedestrian,width:Math.max(.7,Math.min(45,number(tags.width,pedestrian?(tags.highway==='pedestrian'?6:2.5):number(tags.lanes,['primary','trunk'].includes(tags.highway)?3:2)*3.1)))};
}
export function offsetStreet(points,offset){
  return points.map((p,i)=>{
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    const tangent=(x,y)=>{const d=Math.hypot(y[0]-x[0],y[1]-x[1])||1;return [-(y[1]-x[1])/d,(y[0]-x[0])/d];};
    const n0=tangent(a,p),n1=tangent(p,b);
    if(i===0)return [p[0]+n1[0]*offset,p[1]+n1[1]*offset];
    if(i===points.length-1)return [p[0]+n0[0]*offset,p[1]+n0[1]*offset];
    const sum=[n0[0]+n1[0],n0[1]+n1[1]],len=Math.hypot(...sum);
    if(len<.1)return [p[0]+n1[0]*offset,p[1]+n1[1]*offset];
    const n=sum.map(v=>v/len),scale=offset/Math.max(.55,n[0]*n1[0]+n[1]*n1[1]);
    return [p[0]+n[0]*scale,p[1]+n[1]*scale];
  });
}
/** Closed outline of a road ribbon; duplicate map nodes are removed first. */
export function streetOutline(points,width){
  const clean=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>.001);
  if(clean.length<2)return null;
  const ring=[...offsetStreet(clean,width/2),...offsetStreet(clean,-width/2).reverse()];
  ring.push(ring[0]);return [ring];
}

/** Large-scale weathering breaks up repetitions in the bundled photographic maps. */
export function weatherGround(material,road=false){
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vStreetWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvec4 streetPosition=vec4(position,1.);
      #ifdef USE_INSTANCING
        streetPosition=instanceMatrix*streetPosition;
      #endif
      vStreetWorld=(modelMatrix*streetPosition).xyz;`);
    shader.fragmentShader=`varying vec3 vStreetWorld;
      float streetHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float streetNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(streetHash(i),streetHash(i+vec2(1,0)),f.x),mix(streetHash(i+vec2(0,1)),streetHash(i+vec2(1)),f.x),f.y);}
      \n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float streetWeather=streetNoise(vStreetWorld.xz*.06)*.65+streetNoise(vStreetWorld.xz*.23)*.35;
      diffuseColor.rgb*=mix(${road?'.72,1.08':'.83,1.12'},streetWeather);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+streetWeather*.12,.58,1.);`);
  };
  material.customProgramCacheKey=()=>`street-weather-v1-${road}`;
  return material;
}
