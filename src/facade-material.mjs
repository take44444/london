import * as THREE from 'three';
import {facadeAtlases,windowMaskGLSL} from './facades.mjs';
import {facadeMeans} from './building-colours.mjs';

export function createFacadeMaterial(map,atlas){
    const m=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.92,side:THREE.DoubleSide,map,vertexColors:true,metalness:.02,envMapIntensity:.75});
    const mean=facadeMeans[atlas===facadeAtlases.brick?'brick':'stone'];
    m.userData.atlas=atlas;
    const night={value:0};m.userData.night=night;
    m.onBeforeCompile=shader=>{
      shader.uniforms.uCityNight=night;
      shader.fragmentShader=`uniform float uCityNight;
        float cityPane(vec2 p,vec4 bounds,vec2 edge){
          vec2 low=smoothstep(bounds.xy-edge,bounds.xy+edge,p);
          vec2 high=1.-smoothstep(bounds.zw-edge,bounds.zw+edge,p);
          return low.x*low.y*high.x*high.y;
        }\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
        float facadeLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        vec2 atlasUv=fract(vMapUv),atlasEdge=max(fwidth(vMapUv)*.6,vec2(.0005));
        float windowMask=0.;
        ${windowMaskGLSL(atlas)}
        float clearGlazing=windowMask*(1.-smoothstep(.12,.32,facadeLuma));
        vec3 masonryColour=min(diffuseColor.rgb*vColor/vec3(${mean.join(',')}),vec3(.88));
        diffuseColor.rgb=mix(masonryColour,diffuseColor.rgb,clearGlazing);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=mix(.94,.25,windowMask);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        vec2 windowCell = floor(vMapUv * vec2(4.,4.));
        windowCell.y=0.;
        ${atlas.rows.slice(1).map(y=>`windowCell.y+=step(${(1-y/atlas.height).toFixed(7)},atlasUv.y);`).join('\n')}
        float windowLight = step(.69,fract(sin(dot(windowCell,vec2(12.9898,78.233))+dot(floor(vColor.rgb*64.),vec3(173.,79.,37.)))*43758.5453));
        float glassMask=1.-smoothstep(.12,.42,facadeLuma);
        totalEmissiveRadiance += vec3(1.,.58,.24)*uCityNight*windowMask*glassMask*windowLight;`);
    };
    m.customProgramCacheKey=()=> 'london-mapped-colour-windows-v3-'+(atlas===facadeAtlases.brick?'brick':'stone');return m;
  }
