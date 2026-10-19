import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const source=await readFile('src/main.js','utf8');
const bundle=await build({stdin:{contents:source+'\nwindow.regionQA={camera,controls,region};',resolveDir:process.cwd()+'/src'},bundle:true,format:'esm',write:false});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/scene.js',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.londonWorld?.state.ready,null,{timeout:120000});await page.locator('#loading').waitFor({state:'hidden',timeout:120000});
 const state=await page.evaluate(()=>window.londonWorld.state);assert.ok(state.context.buildings>100000);assert.ok(state.context.domes>10);assert.ok(state.context.trees>60000);
 await page.locator('[data-light="day"]').click();await page.waitForFunction(()=>window.londonWorld.state.lighting==='day');
 await page.evaluate(()=>{const {camera,controls}=window.regionQA;camera.position.set(700,210,0);controls.target.set(1500,100,-700);controls.update();});
 await page.screenshot({path:'test-results/regional-skyline-day.png',timeout:120000});
 const before=await page.evaluate(()=>window.londonWorld.state.camera);await page.mouse.move(800,380);await page.mouse.down();await page.mouse.move(820,395);await page.mouse.up();await page.waitForTimeout(300);assert.notDeepEqual(await page.evaluate(()=>window.londonWorld.state.camera),before);
 await page.locator('[data-light="night"]').click();await page.waitForTimeout(300);
 await page.waitForFunction(()=>window.londonWorld.state.lighting==='night'&&Object.values(window.regionQA.region.materials).filter(m=>m.userData.night).every(m=>m.userData.night.value>1),null,{timeout:60000});
 assert.ok(await page.evaluate(()=>Object.values(window.regionQA.region.materials).filter(m=>m.userData.night).every(m=>m.userData.night.value>1)),'Regional facade lighting follows the global night mode');
 await page.screenshot({path:'test-results/regional-skyline-night.png',timeout:120000});assert.deepEqual(errors,[]);console.log(JSON.stringify({context:state.context,drawCalls:state.drawCalls,triangles:state.triangles,errors}));
}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages()))console.log(await page.evaluate(()=>({state:window.londonWorld?.state.lighting,uniforms:Object.fromEntries(Object.entries(window.regionQA?.region?.materials||{}).map(([k,m])=>[k,m.userData.night?.value]))})));throw error;}finally{await browser.close();}
