import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.londonWorld?.state.ready,null,{timeout:120000});await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
 const initial=await page.evaluate(()=>window.londonWorld.state);assert.equal(initial.rendering.water.waves.components,30);assert.equal(initial.rendering.water.reflectionResolution,384);console.log('Mobile city ready; new water shader loaded.');
 await page.locator('[data-view="river"]').tap();await page.waitForFunction(()=>window.londonWorld.state.view==='river');
 await page.screenshot({path:'test-results/river-mobile.png',timeout:120000});assert.deepEqual(errors,[]);console.log('Mobile river view rendered with no shader or browser errors.');
}finally{await browser.close();}
