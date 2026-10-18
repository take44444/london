import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

let server,browser;
const origin='http://localhost:5173';
try {
  try {await fetch(origin);}catch{
    server=spawn(process.execPath,['serve.mjs'],{cwd:import.meta.dirname+'/..',stdio:'ignore'});
    for(let i=0;i<30;i++){try{await fetch(origin);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  }
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
  page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto(origin);
  await page.waitForFunction(()=>window.londonWorld?.state.ready,null,{timeout:120000});
  await page.locator('#loading').waitFor({state:'hidden'});
  const state=()=>page.evaluate(()=>window.londonWorld.state);
  assert.equal((await state()).models.bigben,true);
  assert.equal((await state()).models.abbey,true);
  assert.ok((await state()).map.buildings>10000,'The rendered city includes the London building extract');
  assert.ok((await state()).map.recordedHeights>4000,'Recorded OSM heights are used');
  assert.ok((await state()).map.trees>5000,'Mapped tree locations are present');
  assert.equal((await state()).map.source,'OpenStreetMap contributors');
  const facades=(await state()).map.facades;
  assert.ok(facades.recessedWindows>10000&&facades.recessedWindows<100000,'Riverfront windows have a bounded geometry budget');
  assert.ok(facades.lodGroups>0&&facades.nearGroups>0,'Nearby facade geometry is selected');
  assert.ok((await state()).triangles>100000,'The city geometry renders in addition to fullscreen effects');
  assert.equal((await state()).rendering.antialias,'SMAA');
  assert.equal((await state()).rendering.contactShading,true);
  assert.equal((await state()).rendering.skyResolution,8192);
  await page.setViewportSize({width:1100,height:700});
  await page.waitForFunction(()=>window.londonWorld.state.rendering.width===1100&&window.londonWorld.state.rendering.height===700);
  await page.setViewportSize({width:1280,height:800});
  await page.waitForFunction(()=>window.londonWorld.state.rendering.width===1280&&window.londonWorld.state.rendering.height===800);
  await page.mouse.move(810,380);await page.mouse.wheel(0,4000);
  await page.waitForFunction(initial=>window.londonWorld.state.map.facades.nearGroups<initial,facades.nearGroups);
  await page.locator('#reset').click();
  await page.screenshot({path:new URL('../test-results/westminster.png',import.meta.url).pathname,timeout:120000});
  let before=await state();
  await page.mouse.move(830,360);await page.mouse.down();await page.mouse.move(960,395);await page.mouse.up();
  await page.waitForTimeout(300);
  assert.notDeepEqual((await state()).camera,before.camera,'Left dragging orbits');
  console.log('Mouse orbit passed');
  before=await state();await page.mouse.move(800,380);await page.mouse.down({button:'right'});await page.mouse.move(850,410);await page.mouse.up({button:'right'});
  await page.waitForTimeout(300);assert.notDeepEqual((await state()).target,before.target,'Right dragging pans');
  const distance=s=>Math.hypot(...s.camera.map((v,i)=>v-s.target[i]));
  console.log('Mouse pan passed');
  before=await state();await page.mouse.wheel(0,-200);await page.waitForTimeout(500);assert.ok(distance(await state())<distance(before),'Wheel zooms closer');
  before=await state();await page.locator('#zoom-in').click();assert.ok(distance(await state())<distance(before),'Zoom button works');
  before=await state();await page.keyboard.press('+');assert.ok(distance(await state())<distance(before),'Keyboard zoom works');
  for(const id of ['bigben','eye','abbey','river']){
    await page.locator(`[data-view="${id}"]`).click();assert.equal((await state()).view,id);
    assert.equal(await page.locator(`[data-view="${id}"]`).getAttribute('aria-pressed'),'true');
    if(id==='abbey')await page.screenshot({path:new URL('../test-results/abbey.png',import.meta.url).pathname,timeout:120000});
    console.log('View passed:',id);
  }
  await page.locator('[data-light="night"]').click();assert.equal((await state()).lighting,'night');assert.ok(await page.locator('body').evaluate(b=>b.classList.contains('night')));
  await page.screenshot({path:new URL('../test-results/blue-hour.png',import.meta.url).pathname,timeout:120000});
  await page.locator('[data-light="day"]').click();assert.equal((await state()).lighting,'day');
  await page.locator('#help-button').click();assert.equal(await page.locator('#help').evaluate(d=>d.open),true);await page.locator('#close-help').click();
  await page.locator('#sound').click();assert.equal((await state()).sound,true);await page.locator('#sound').click();assert.equal((await state()).sound,false);
  await page.locator('#auto-orbit').click();assert.equal((await state()).autoOrbit,true);await page.locator('#auto-orbit').click();assert.equal((await state()).autoOrbit,false);
  await page.locator('#reset').click();assert.equal((await state()).view,'westminster');
  assert.deepEqual(errors,[],'No browser or WebGL errors');
  console.log('Desktop: rendered assets, orbit, pan, wheel, buttons, keyboard, 5 views, lighting, sound and help passed.');
  await page.close();
  const phone=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  phone.setDefaultTimeout(60000);phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(origin);await phone.waitForFunction(()=>window.londonWorld?.state.ready,null,{timeout:120000});await phone.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await phone.evaluate(()=>window.londonWorld.state.rendering.skyResolution),4096);
  assert.equal(await phone.evaluate(()=>window.londonWorld.state.rendering.width),390);
  for(const selector of ['.location-card','.view-nav','.light-controls','.topbar']){
    const b=await phone.locator(selector).boundingBox();assert.ok(b.x>=0&&b.x+b.width<=391,`${selector} fits the phone viewport`);
  }
  await phone.locator('[data-view="eye"]').tap();assert.equal(await phone.evaluate(()=>window.londonWorld.state.view),'eye');
  const phoneBefore=await phone.evaluate(()=>window.londonWorld.state.camera);
  const session=await phone.context().newCDPSession(phone);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:230,y:340}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:290,y:370}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await phone.waitForTimeout(300);assert.notDeepEqual(await phone.evaluate(()=>window.londonWorld.state.camera),phoneBefore,'Touch dragging orbits');
  await phone.screenshot({path:new URL('../test-results/mobile.png',import.meta.url).pathname,timeout:120000});
  assert.deepEqual(errors,[]);console.log('Mobile: layout, landmark navigation and touch orbit passed.');
}finally{if(browser)await browser.close();if(server)server.kill();}
