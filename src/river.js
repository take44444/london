import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import {riverWaveGLSL,riverWaveInfo} from './river-waves.mjs';

/** An opaque, turbid river with dielectric Fresnel reflection and small wind ripples. */
export function createRiver(normals,sunPosition,renderer,hasMap,mobile,hasRegion=false){
  const resolution=mobile?384:768;
  const water=new Water(new THREE.PlaneGeometry(hasRegion?20000:hasMap?6000:198,hasRegion?20000:hasMap?6000:2800),{
    textureWidth:resolution,textureHeight:resolution,waterNormals:normals,
    sunDirection:sunPosition.clone().normalize(),sunColor:'#ffe4b0',waterColor:'#5e5d49',
    distortionScale:8.5,fog:true,
  });
  water.rotation.x=-Math.PI/2;water.position.set(8,.05,0);
  const material=water.material;
  const wakes=Array.from({length:5},()=>new THREE.Vector4(100000,100000,0,20));
  material.uniforms.riverIllumination={value:.8};
  material.uniforms.boatWakes={value:wakes};
  material.uniforms.size.value=1;
  // The reflector must retain linear highlights until the final display transform.
  if(renderer.extensions.has('EXT_color_buffer_float'))material.uniforms.mirrorSampler.value.type=THREE.HalfFloatType;
  const shader=material.fragmentShader;
  const noiseStart=shader.indexOf('\t\t\t\tvec4 getNoise('),noiseEnd=shader.indexOf('\n\t\t\t\tvoid sunLight',noiseStart);
  if(noiseStart<0||noiseEnd<0)throw new Error('Water shader changed; update the river material integration.');
  const noise=`
    uniform float riverIllumination;
    uniform vec4 boatWakes[5];
    float riverVariance;
    vec4 getNoise(vec2 uv){
      vec2 detail=texture2D(normalSampler,uv*.8-vec2(.012,.019)*time).xy*2.-1.;
      return vec4(detail*.008,1.,0.);
    }
    vec3 riverNormal(vec3 noise){
      vec2 p=worldPosition.xz;
      float footprint=max(length(dFdx(p)),length(dFdy(p)));
      float micro=1.-smoothstep(.025,.12,footprint);
      vec2 slope=noise.xy*micro;
      riverVariance=0.;
      ${riverWaveGLSL()}
      for(int i=0;i<5;i++){
        vec4 boat=boatWakes[i];
        vec2 rel=p-boat.xy;
        if(dot(rel,rel)>6400.)continue;
        vec2 forward=vec2(sin(boat.z),cos(boat.z));
        vec2 side=vec2(-forward.y,forward.x);
        float behind=-dot(rel,forward)-boat.w*.42;
        float lateral=dot(rel,side);
        if(behind>0.&&behind<65.){
          float edge=abs(lateral)-(.23*behind+boat.w*.12);
          float decay=exp(-behind*.045)*smoothstep(0.,5.,behind);
          float crest=cos(edge*5.-time*1.8)*exp(-abs(edge)*.8)*decay;
          slope+=side*sign(lateral)*crest*.13;
          slope+=forward*sin(behind*3.-time*2.)*exp(-abs(lateral)*.42)*decay*.035;
        }
      }
      return normalize(vec3(slope.x,1.,slope.y));
    }
    float wakeFoam(){
      float foam=0.;
      for(int i=0;i<5;i++){
        vec4 boat=boatWakes[i];
        vec2 rel=worldPosition.xz-boat.xy;
        if(dot(rel,rel)>4900.)continue;
        vec2 forward=vec2(sin(boat.z),cos(boat.z));
        float behind=-dot(rel,forward)-boat.w*.42;
        if(behind>0.&&behind<55.){
          float lateral=abs(dot(rel,vec2(-forward.y,forward.x)));
          float edge=lateral-(.23*behind+boat.w*.12);
          float broken=.5+.5*sin(behind*3.7+lateral*5.3-time*2.);
          foam+=exp(-edge*edge*3.)*exp(-behind*.07)*smoothstep(0.,4.,behind)*broken*.16;
        }
      }
      return min(foam,.2);
    }
  `;
  material.fragmentShader=shader.slice(0,noiseStart)+noise+shader.slice(noiseEnd);
  material.fragmentShader=material.fragmentShader
    .replace('normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) )','riverNormal( noise.xyz )')
    .replace('float rf0 = 0.3;','float rf0 = 0.02037;')
    .replace('float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );',`
      float transmittedCos=sqrt(max(0.,1.-(1.-theta*theta)/(1.333*1.333)));
      float rs=(theta-1.333*transmittedCos)/(theta+1.333*transmittedCos);
      float rp=(1.333*theta-transmittedCos)/(1.333*theta+transmittedCos);
      float reflectance=.5*(rs*rs+rp*rp);
    `)
    .replace('vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );',`
      vec2 reflectionUv=mirrorCoord.xy/mirrorCoord.w+distortion;
      vec2 blur=vec2(.0008,.0006)+vec2(.045,.12)*sqrt(riverVariance);
      vec3 reflectionSample=texture2D(mirrorSampler,reflectionUv).rgb*.4;
      reflectionSample+=texture2D(mirrorSampler,reflectionUv+blur).rgb*.18;
      reflectionSample+=texture2D(mirrorSampler,reflectionUv-blur).rgb*.18;
      reflectionSample+=texture2D(mirrorSampler,reflectionUv+blur*2.).rgb*.12;
      reflectionSample+=texture2D(mirrorSampler,reflectionUv-blur*2.).rgb*.12;
    `)
    .replace('vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);',`
      float sediment=1.+.025*sin(worldPosition.x*.031+worldPosition.z*.013)*sin(worldPosition.z*.017-time*.01);
      vec3 body=waterColor*riverIllumination*(vec3(.65)+diffuseLight*.35)*sediment*getShadowMask();
      vec3 albedo=mix(body,reflectionSample,reflectance)+specularLight*.06*getShadowMask();
      albedo=mix(albedo,vec3(.55,.58,.53)*riverIllumination,wakeFoam());
    `);
  return {
    mesh:water,wakes,
    setIllumination(value){material.uniforms.riverIllumination.value=value;},
    info:{reflectionResolution:resolution,fresnel:.02037,wakeSources:wakes.length,waves:riverWaveInfo,dielectricIOR:1.333},
  };
}
