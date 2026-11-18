'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async(browser,base,root)=>{
 const context=await browser.newContext({viewport:{width:390,height:560},hasTouch:true,isMobile:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.clock.install({time:new Date('2026-11-17T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-17T12:00:01Z'));
  await page.addInitScript(()=>{
   window.__starts=0;window.__goClicks=0;window.__hidden=false;
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
    getCurrentPosition(ok){ok({timestamp:Date.now(),coords:{latitude:3.139,longitude:101.6869,accuracy:8}});},
    watchPosition(){return 1;},clearWatch(){}
   }});
   window.addEventListener('jalan:journey-start',()=>window.__starts++);
   document.addEventListener('click',e=>{if(e.target.closest?.('#passenger-go'))window.__goClicks++;},true);
  });
  await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  for(const ext of ['js','css'])await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.'+ext,
   r=>r.fulfill({contentType:ext==='js'?'application/javascript':'text/css',
    body:fs.readFileSync(path.join(root,'node_modules/leaflet/dist/leaflet.'+ext))}));
  await page.goto(base+'/index.html?mode=passenger');
  const fixture=()=>page.evaluate(()=>{
   JalanPassengerJourney.stop();document.getElementById('tt-primary').checked=false;
   setStart([3.139,101.6869],'Fixture start');destination=[3.1478,101.6953];destinationName='KLCC';
   const route=duration=>({provider:'osrm',duration,distance:3200,
    geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6953,3.1478]]},
    legs:[{steps:[{name:'Fixture road',distance:3200,routeOffsetInMeters:125,maneuver:{type:'turn',modifier:'left'}}]}]});
   routes=[route(600),route(720)];selectedRoute=0;renderRoutes();
  });
  const starts=()=>page.evaluate(()=>window.__starts);
  await fixture();await page.clock.runFor(200);
  assert.equal(await page.locator('#passenger-go').innerText(),'Go');
  assert.equal(await page.getByRole('button',{name:'Go',exact:true}).count(),1);
  const go=await page.locator('#passenger-go').boundingBox(),cancel=await page.locator('#passenger-route-cancel').boundingBox();
  assert.ok(Math.abs(go.y-cancel.y)<2&&cancel.x>go.x+go.width&&cancel.y+cancel.height<=560,
   'Go and Cancel remain side by side and visible on a short phone viewport');
  await page.evaluate(()=>{document.getElementById('passenger-go-fill').getAnimations()[0].currentTime=3500;});
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-go-drain.png')});
  await page.clock.runFor(5800);assert.equal(await starts(),0);
  await page.locator('#passenger-route-list button').nth(1).click();
  await page.clock.runFor(6000);assert.equal(await starts(),0,'changing route restarts the full wait');
  await page.clock.runFor(1100);assert.equal(await starts(),1,'idle automatically starts once after seven seconds');
  assert.equal(await page.evaluate(()=>JalanGPS.getState().route.duration),720,'starts the latest selected alternative');
  await page.clock.runFor(8000);assert.equal(await starts(),1,'no duplicate journey start');
  await fixture();
  // Cancel before the route's two queued animation frames fit its old bounds.
  await page.evaluate(()=>document.getElementById('passenger-route-cancel').click());
  await page.clock.runFor(200);
  assert.equal(await page.evaluate(()=>!destination&&!routes.length&&!JalanGPS.getState().active),true);
  assert.equal(await page.locator('#jalan-home-sheet').getAttribute('data-state'),'a');
  assert.equal(await page.evaluate(()=>Math.abs(map.getCenter().lat-3.139)<.00001),true);
  await page.clock.runFor(10000);assert.equal(await starts(),1,'Cancel clears any pending auto-start');
  await fixture();await page.clock.runFor(200);
  await page.mouse.move(180,200);await page.mouse.down();
  await page.clock.runFor(12000);assert.equal(await starts(),1,'held pointer never starts the journey');
  await page.mouse.move(210,230,{steps:4});await page.mouse.up();
  await page.clock.runFor(1000); // Let map inertia end before beginning another full wait.
  await page.locator('#passenger-route-list button').first().click();
  await page.clock.runFor(6900);assert.equal(await starts(),1);
  await page.clock.runFor(200);assert.equal(await starts(),2);
  await fixture();await page.locator('#passenger-route-handle').click();
  await page.clock.runFor(10000);assert.equal(await starts(),2,'collapsed panel suspends auto-start');
  await page.locator('#passenger-route-handle').click();
  await page.locator('#jalan-home-menu').click();
  await page.clock.runFor(10000);assert.equal(await starts(),2,'open menu suspends auto-start');
  await page.locator('#jalan-home-menu-panel [data-menu=settings]').click();
  await page.clock.runFor(10000);assert.equal(await starts(),2,'settings suspend auto-start');
  await page.locator('#passenger-setup-close').click();
  await page.clock.runFor(6000);
  await page.evaluate(()=>{window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(20000);assert.equal(await starts(),2,'background tabs never auto-start');
  await page.evaluate(()=>{window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(6900);assert.equal(await starts(),2);
  await page.clock.runFor(200);assert.equal(await starts(),3,'returning starts a fresh full countdown');
  await fixture();
  await page.evaluate(()=>{Object.defineProperty(navigator,'geolocation',{configurable:true,value:null});});
  const clicks=await page.evaluate(()=>window.__goClicks);
  await page.clock.runFor(7200);
  assert.equal(await page.evaluate(()=>window.__goClicks),clicks+1);
  assert.equal(await starts(),3);
  await page.clock.runFor(20000);
  assert.equal(await page.evaluate(()=>window.__goClicks),clicks+1,'failed GPS start does not repeatedly auto-click');
  assert.deepEqual(errors,[]);
  console.log('PASS route actions: Go/Cancel layout, seven-second idle, route reset, held pointer, collapsed/menu/settings/background guards and one attempt on GPS failure');
 }finally{await context.close();}
};
