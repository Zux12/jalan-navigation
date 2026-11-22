'use strict';
const assert=require('node:assert/strict');

module.exports=async function laneGuidance(page){
 await page.reload({waitUntil:'load'});
 await page.evaluate(()=>JalanLanguage.set('en',false));
 const longitude=101.687,latitude=3.139;
 const coord=m=>({latitude,longitude:longitude+m/111000});
 const points=[0,100,250,450,650,775,900,1100,1400].map(coord);
 const route={summary:{lengthInMeters:1400,travelTimeInSeconds:90},legs:[{points}],
  sections:[{sectionType:'LANES',startPointIndex:5,endPointIndex:6,lanes:[
   {directions:['SLIGHT_LEFT'],follow:'SLIGHT_LEFT'},{directions:['SLIGHT_LEFT','STRAIGHT'],follow:'SLIGHT_LEFT'},
   {directions:['STRAIGHT']},{directions:['STRAIGHT']}]}],
  guidance:{instructions:[{pointIndex:6,point:points[6],routeOffsetInMeters:900,maneuver:'TAKE_EXIT',
   turnAngleInDecimalDegrees:-45,message:'Take the exit toward Petaling Jaya'},
   {pointIndex:7,point:points[7],routeOffsetInMeters:1100,maneuver:'TURN_RIGHT',message:'Turn right'}]}};
 await page.route('https://api.tomtom.com/routing/1/calculateRoute/**',r=>{
  assert.ok(new URL(r.request().url()).searchParams.getAll('sectionType').includes('lanes'));
  return r.fulfill({json:{routes:[route]}});
 });
 await page.evaluate(async points=>{
  const latlon=p=>[p.latitude,p.longitude];
  startPoint=latlon(points[0]);destination=latlon(points.at(-1));
  await JalanTomTom.calculate();
  navigator.geolocation.watchPosition=cb=>{window.__laneFix=cb;return 987};
  document.getElementById('passenger-go').click();
 },points);
 await page.waitForFunction(()=>!!window.__laneFix);
 const guide=page.locator('#passenger-junction-guide');
 async function drive(m,accuracy=5){
  await page.clock.fastForward(5000);
  await page.evaluate(({position,accuracy})=>window.__laneFix({coords:{...position,heading:90,speed:20,accuracy},timestamp:Date.now()}),{position:coord(m),accuracy});
  await page.clock.runFor(40);
 }
 await drive(0);assert.equal(await guide.isVisible(),false);
 await drive(100);await drive(180);
 await guide.waitFor({state:'visible'});
 assert.equal(await guide.getAttribute('data-view'),'lanes');
 assert.equal(await guide.locator('svg').count(),4);assert.equal(await guide.locator('.recommended').count(),2);
 assert.match(await guide.getAttribute('aria-label'),/1, 2$/);
 await page.evaluate(()=>JalanLanguage.set('ms',false));assert.match(await guide.getAttribute('aria-label'),/^Lorong/);
 await page.locator('#passenger-turn-toggle').click();assert.equal(await guide.isVisible(),false);
 await page.locator('#passenger-tab-directions').click();
 await page.locator('#passenger-turn-toggle').click();await guide.waitFor({state:'visible'});
 for(let m=280;m<=780;m+=100)await drive(m);
 assert.equal(await guide.getAttribute('data-view'),'fork');assert.match(await guide.getAttribute('aria-label'),/kiri/);
 const layout=await page.evaluate(()=>{
  const box=id=>document.getElementById(id).getBoundingClientRect();
  return {banner:box('passenger-turn-toggle').bottom,menu:box('jalan-home-menu').top,
   arrow:box('passenger-vehicle-screen').top,footer:box('passenger-journey-sheet').top};
 });
 assert.ok(layout.menu>=layout.banner && layout.arrow>layout.banner && layout.arrow<layout.footer);
 await drive(790,120);assert.equal(await guide.isVisible(),false);
 await drive(800);await guide.waitFor({state:'visible'});
 await drive(900);await drive(920);
 assert.equal(await guide.isVisible(),false,'passing a fork clears it for an ordinary turn with no lane details');
 await page.evaluate(()=>JalanGPS.stop());assert.equal(await guide.isVisible(),false);
};
