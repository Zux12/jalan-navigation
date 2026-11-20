'use strict';
const assert=require('node:assert/strict');

module.exports=async function roadDetails(page){
 const home=page.locator('#jalan-home-speed .passenger-speed-limit');
 const driving=page.locator('#passenger-speed-floating .passenger-speed-limit');
 const point=[3.139,101.687],next=[3.139,101.68715],end=[3.139,101.691];
 const fix=point=>page.evaluate(point=>dispatchEvent(new CustomEvent('jalan:free-location',{
  detail:{point,accuracy:5,timestamp:Date.now(),heading:null,speed:0}})),point);
 let lookups=0;
 await page.route('https://api.tomtom.com/search/2/reverseGeocode/**',route=>{
  lookups++;
  const url=new URL(route.request().url());
  assert.equal(url.searchParams.get('returnSpeedLimit'),'true');
  return route.fulfill({json:{addresses:[{position:point.join(','),address:{speedLimit:'80.00KPH'}}]}});
 });
 assert.equal(await home.isVisible(),false);
 await fix(point);await home.waitFor({state:'visible'});
 assert.equal(await home.textContent(),'80');
 assert.deepEqual(await home.evaluate(el=>{
  const css=getComputedStyle(el),box=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();
  return [css.backgroundColor,css.color,css.borderColor,box.right>parent.right&&box.left<parent.right,box.bottom>parent.bottom&&box.top<parent.bottom];
 }),['rgb(255, 255, 255)','rgb(17, 17, 17)','rgb(232, 120, 10)',true,true]);
 await fix(point);assert.equal(lookups,1,'stationary phone reuses the lookup');
 await fix(next);assert.equal(await home.isVisible(),false,'previous road limit clears immediately');

 const coordinates=[point,next,end].map(([latitude,longitude])=>({latitude,longitude}));
 const travel={sectionType:'TRAVEL_MODE',travelMode:'car',startPointIndex:0,endPointIndex:2};
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
 const drive=p=>page.evaluate(point=>window.__roadDetailsFix({
  coords:{latitude:point[0],longitude:point[1],heading:90,speed:8,accuracy:4},timestamp:Date.now()
 }),p);
 await page.waitForFunction(()=>!!window.__roadDetailsFix);
 await drive(point);await driving.waitFor({state:'visible'});
 assert.equal(await driving.textContent(),'80');
 // Use adjacent fixes straddling the sign to avoid a synthetic GPS jump.
 await drive([next[0],next[1]+0.0001]);
 await page.waitForFunction(()=>document.querySelector('#passenger-speed-floating .passenger-speed-limit').textContent==='50');
 await page.evaluate(()=>dispatchEvent(new CustomEvent('jalan:location-quality',{detail:{error:true}})));
 assert.equal(await driving.isVisible(),false);
 assert.equal(lookups,1,'matched route speeds do not need reverse lookups');
 assert.ok(requests>=1);
};
