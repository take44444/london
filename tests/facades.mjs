import assert from 'node:assert/strict';
import * as THREE from 'three';
import {emitFacade,facadeAtlases} from '../src/facades.mjs';

// Ray-test actual rendered surfaces: a window must be behind its masonry, not
// merely a second plane covering an intact wall. Repeat with a courtyard winding.
for(const atlas of Object.values(facadeAtlases))for(const direction of [1,-1]){
  const coarse=[],fine=[];
  const quad=(out,points,uv)=>{
    assert.ok(points.flat().every(Number.isFinite));
    assert.ok(uv.flat().every(Number.isFinite));
    out.push(...[0,2,1,0,3,2].flatMap(i=>points[i]));
  };
  emitFacade({a:[0,0],c:[direction*13,0],bottom:5,top:19,floors:4,bays:4,seed:0,atlas,color:[1,1,1],coarse,fine,quad});
  const meshFor=positions=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.FrontSide}));
  };
  const near=meshFor(fine),far=meshFor(coarse);
  const hit=(mesh,x,y)=>{
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,-direction*2),new THREE.Vector3(0,0,direction));
    const intersections=ray.intersectObject(mesh);
    assert.ok(intersections.length,'Facade surfaces remain closed');
    return intersections[0];
  };
  const row=atlas.windows.length-1,[x0,x1]=atlas.columns[0],[y0,y1]=atlas.windows[row];
  const x=direction*((x0+x1)/2/atlas.width*13);
  const y=5+(atlas.rows[row+1]-(y0+y1)/2)/(atlas.rows[row+1]-atlas.rows[row])*3.5;
  assert.ok(hit(near,x,y).distance>2.15,'A front ray reaches recessed glass');
  assert.ok(Math.abs(hit(far,x,y).distance-2)<1e-5,'Distant facade stays on the original outline');
  assert.ok(Math.abs(hit(near,direction*.02,y).distance-2)<1e-5,'Masonry remains at the original outline');
  const sillY=5+(atlas.rows[row+1]-y1)/(atlas.rows[row+1]-atlas.rows[row])*3.5-.09;
  assert.ok(hit(near,x,sillY).distance<1.9,'Sill projects in front of the masonry');
  near.geometry.dispose();far.geometry.dispose();near.material.dispose();far.material.dispose();
}
console.log('Facade geometry: recessed glass, intact masonry, projecting sills and courtyard winding passed.');
