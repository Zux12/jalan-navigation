'use strict';
const assert=require('node:assert/strict');

module.exports=async function roadDetails(page){
 await page.clock.install();
 await page.reload({waitUntil:'load'});
 const home=page.locator('#jalan-home-speed .passenger-speed-limit');
 const driving=page.locator('#passenger-speed-floating .passenger-speed-limit');
 const point=[3.139,101.687],next=[3.139,101.68715],gap=[3.139,101.68733],end=[3.139,101.691];
 const fix=point=>page.evaluate(point=>dispatchEvent(new CustomEvent('jalan:free-location',{
  detail:{point,accuracy:5,timestamp:Date.now(),heading:null,speed:0}})),point);
 let lookups=0;
 await page.route('https://api.tomtom.com/search/2/reverseGeocode/**',route=>{
  lookups++;
  return route.fulfill({json:{addresses:[]}});
 });
 assert.equal(await home.isVisible(),false);
 await page.locator('#jalan-home-menu').click();
 await page.locator('#passenger-about').click();
 assert.equal(await page.locator('#passenger-posted-speed-share').count(),0);
 await page.locator('#passenger-about-ok').click();
 await fix(point);await fix(next);
 assert.equal(await home.isVisible(),false,'free driving has no route speed limit');

 const coordinates=[point,next,gap,end].map(([latitude,longitude])=>({latitude,longitude}));
 const travel={sectionType:'TRAVEL_MODE',travelMode:'car',startPointIndex:0,endPointIndex:3};
 const paid={sectionType:'TOLL',startPointIndex:0,endPointIndex:1};
 const speed=(start,limit)=>({sectionType:'SPEED_LIMIT',startPointIndex:start,endPointIndex:start+1,maxSpeedLimitInKmh:limit});
 const raw=(duration,sections)=>({summary:{lengthInMeters:500,travelTimeInSeconds:duration},
  legs:[{points:coordinates}],sections});
 let requests=0;
 await page.route('https://api.tomtom.com/routing/1/calculateRoute/**',route=>{
  requests++;
  const fields=new URL(route.request().url()).searchParams.getAll('sectionType');
  for(const field of ['speedLimit','toll','tollVignette','traffic','travelMode'])assert.ok(fields.includes(field),'missing '+field+' in route fields '+fields.join(','));
  return route.fulfill({json:{routes:[raw(60,[travel,paid,speed(0,80),speed(1,50)]),raw(70,[travel]),raw(90,undefined)]}});
 });
 await page.evaluate(async([from,to])=>{
  startPoint=from;destination=to;await window.JalanTomTom.calculate();
 },[point,end]);
 const choices=page.locator('#passenger-route-list button');
 assert.deepEqual(await choices.locator('small:last-child').allTextContents(),['Has Tolls','Toll-Free','Toll info unavailable']);
 await page.evaluate(()=>JalanLanguage.set('ms',false));
 await page.getByText('Ada Tol',{exact:true}).waitFor();
 assert.equal(await choices.nth(1).locator('small:last-child').textContent(),'Tanpa Tol');
 await page.evaluate(()=>JalanLanguage.set('en',false));
 // Use the app's actual guidance watcher and measured GPS updates.
 await page.evaluate(()=>{
  navigator.geolocation.watchPosition=ok=>{window.__roadDetailsFix=ok;return 990;};
  document.getElementById('passenger-go').click();
 });
 const drive=(point,speed=8)=>page.evaluate(({point,speed})=>window.__roadDetailsFix({
  coords:{latitude:point[0],longitude:point[1],heading:90,speed,accuracy:4},timestamp:Date.now()
 }),{point,speed});
 await page.waitForFunction(()=>!!window.__roadDetailsFix);
 await drive(point);await driving.waitFor({state:'visible'});
 assert.equal(await driving.textContent(),'80');
 await page.waitForFunction(()=>document.getElementById('passenger-speed').textContent==='29');
 assert.deepEqual(await driving.evaluate(el=>{
  const css=getComputedStyle(el),box=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();
  return [css.backgroundColor,css.color,css.borderColor,box.right>parent.right&&box.left<parent.right,box.bottom>parent.bottom&&box.top<parent.bottom];
 }),['rgb(255, 255, 255)','rgb(17, 17, 17)','rgb(232, 120, 10)',true,true]);
 // Use adjacent fixes straddling the sign to avoid a synthetic GPS jump.
 await drive([next[0],next[1]+0.0001]);
 await page.waitForFunction(()=>document.querySelector('#passenger-speed-floating .passenger-speed-limit').textContent==='50');
 await drive([gap[0],gap[1]+0.00007]);
 await driving.waitFor({state:'hidden'});
 assert.equal(await page.locator('#passenger-speed').textContent(),'29','GPS speed survives a gap in route limits');
 await page.evaluate(()=>dispatchEvent(new CustomEvent('jalan:location-quality',{detail:{error:true}})));
 assert.equal(await driving.isVisible(),false);
 assert.equal(lookups,0,'no extra GPS lookup during free driving or navigation');
 assert.ok(requests>=1);

 // An actual guided trip with no traffic-flow response or engineering history.
 await page.clock.fastForward(1000);
 const ask=page.locator('#smart-prompt'),start=gap[1]+0.00007;
 await drive([point[0],start],1.5);
 for(let i=1;i<=24;i++){
  await page.clock.fastForward(5000);
  await drive([point[0],start+i*0.0000675],1.5);
  if(i===23)assert.equal(await ask.isVisible(),false,'brief slowdowns do not prompt');
 }
 await ask.waitFor({state:'visible'});
 assert.equal(await page.locator('#smart-enable').isChecked(),false,'passenger guidance needs no engineering switch');
 assert.equal(await page.locator('#passenger-nearby-consent').isChecked(),false,'local question needs no location upload');
 await page.evaluate(()=>JalanLanguage.set('ms',false));
 await ask.getByRole('button',{name:'Ya',exact:true}).waitFor();
 await page.clock.fastForward(8100);
 assert.equal(await ask.isVisible(),false,'unanswered question closes after eight seconds');
 assert.equal(await page.evaluate(()=>JalanGPS.getState().active),true);
 assert.equal(lookups,0);
};
