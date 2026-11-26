'use strict';
const assert=require('node:assert/strict');
module.exports=async(page,context,base)=>{
 let searches=0,routeRequests=[];
 await page.route('https://nominatim.openstreetmap.org/search**',request=>{
  searches++;return request.fulfill({json:[{name:'KLCC',display_name:'KLCC, Kuala Lumpur',lat:'3.1478',lon:'101.6953'}]});
 });
 await page.route('https://router.project-osrm.org/route/v1/driving/**',request=>{
  const url=new URL(request.request().url());
  const points=url.pathname.split('/').at(-1).split(';').map(p=>p.split(',').map(Number));
  routeRequests.push(points);
  return request.fulfill({json:{code:'Ok',routes:[{provider:'osrm',duration:600,distance:3200,
   geometry:{type:'LineString',coordinates:points},legs:[{steps:[{name:'Fixture road',distance:3200,maneuver:{type:'depart'}}]}]}]}});
 });
 await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.getElementById('tt-primary').checked=false;
  document.getElementById('start-choice').value='gps';
  window.__currentPlace=[3.139,101.6869];window.__holdLocation=false;
  navigator.geolocation.getCurrentPosition=(success,error)=>{
   const finish=()=>success({timestamp:Date.now(),coords:{latitude:window.__currentPlace[0],longitude:window.__currentPlace[1],accuracy:8}});
   if(window.__holdLocation)window.__heldLocation=finish;else finish();
  };
 });
 await page.locator('#jalan-search-trigger').click();
 await page.locator('#destination').fill('KLCC');
 await page.locator('#search-form').evaluate(form=>form.requestSubmit());
 await page.locator('#results button').first().click();
 await page.waitForFunction(()=>routes.length===1);
 assert.equal(searches,1);assert.deepEqual(routeRequests[0].at(-1),[101.6953,3.1478]);
 await page.locator('#passenger-go').click();
 const fresh=()=>page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now(),coords:{
  latitude:window.__currentPlace[0],longitude:window.__currentPlace[1],accuracy:8,speed:0,heading:0}}));
 await fresh();
 await page.waitForFunction(()=>document.body.classList.contains('passenger-following-location'));
 assert.equal(await page.locator('#jalan-home-report').isVisible(),true);
 assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),false);
 await page.locator('#jalan-home-report').click();
 assert.equal(await page.locator('#jalan-home-notice').isVisible(),false);
 await page.locator('#passenger-report-cancel').click();
 await page.evaluate(()=>{window.__currentPlace=[3.14,101.687];});
 await page.locator('#passenger-journey-handle').click();
 await page.locator('#passenger-journey-stop').click();
 const currentVehicleInView=()=>{
  if(JalanGPS.getState().active){
   const v=document.getElementById('passenger-vehicle-screen').getBoundingClientRect(),b=document.getElementById('passenger-journey-sheet').getBoundingClientRect();
   return Math.abs(b.top-v.bottom-12)<4&&Math.abs(v.left+v.width/2-innerWidth/2)<4;
  }
  const marker=Object.values(map._layers).find(layer=>layer.options?.icon?.options.className==='passenger-startup-pin');
  if(!marker?.getElement())return false;
  const ring=marker.getElement().getBoundingClientRect(),top=document.getElementById('jalan-home-sheet').getBoundingClientRect().top;
  return marker.getLatLng().distanceTo(L.latLng(window.__currentPlace))<1&&Math.abs(top-ring.bottom-12)<4&&Math.abs(ring.left+ring.width/2-innerWidth/2)<4;
 };
 const atCurrent=()=>page.evaluate(currentVehicleInView);
 await page.waitForFunction(currentVehicleInView);
 assert.equal(await page.evaluate(()=>destination===null&&startMarker===null&&routes.length===0),true);
 assert.equal(await page.locator('#jalan-home-sheet').getAttribute('data-state'),'a');
 assert.equal(await page.locator('.passenger-startup-pin').count(),1);
 await page.locator('#jalan-sheet-handle').click();
 await page.locator('#jalan-recent-list button').first().click();
 await page.waitForFunction(()=>routes.length===1);
 assert.equal(searches,1,'Recent selects saved coordinates without another geocoding request');
 assert.equal(routeRequests.length,2);
 assert.deepEqual(routeRequests[1],[[101.687,3.14],[101.6953,3.1478]],'same exact destination, fresh origin');
 assert.equal(await page.locator('#passenger-overview').isVisible(),true);
 assert.equal(await page.evaluate(()=>destinationName),'KLCC');
 await page.locator('#passenger-go').click();await fresh();
 await page.waitForFunction(()=>document.body.classList.contains('passenger-following-location'));
 const cdp=await context.newCDPSession(page);
 const dragStart=async()=>{
  const y=await page.locator('#passenger-journey-sheet').evaluate(sheet=>Math.floor(sheet.getBoundingClientRect().top)-16);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y,id:1}]});
  for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180+i*15,y:y-i*8,id:1}]});
 };
 const release=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await dragStart();
 assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),true);
 assert.equal(await page.locator('#jalan-home-report').isVisible(),false);
 await page.waitForTimeout(3200);await fresh();
 assert.equal(await atCurrent(),false,'holding a finger longer than three seconds never recenters');
 await release();await page.waitForTimeout(1800);await fresh();
 assert.equal(await atCurrent(),false,'return waits three seconds after release');
 await page.waitForFunction(()=>document.body.classList.contains('passenger-following-location'),null,{timeout:2500});
 assert.equal(await atCurrent(),true);
 assert.equal(await page.locator('#jalan-home-report').isVisible(),true);
 assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),false);
 // No camera jump while GPS is poor. A new trustworthy fix completes return.
 await dragStart();await release();
 await page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now(),coords:{
  latitude:window.__currentPlace[0],longitude:window.__currentPlace[1],accuracy:180,speed:0,heading:0}}));
 await page.waitForTimeout(3200);
 assert.equal(await atCurrent(),false,'automatic return does not use a poor GPS fix');
 assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),true);
 await fresh();await page.waitForFunction(()=>document.body.classList.contains('passenger-following-location'));
 assert.equal(await atCurrent(),true);
 await cdp.detach();
 // Both Stop entry points reset, and a late Stop location cannot steal a new route.
 await page.evaluate(()=>{window.__holdLocation=true;});
 await page.locator('#passenger-journey-handle').click();await page.locator('#passenger-journey-stop').click();
 assert.equal(await page.evaluate(()=>!JalanGPS.getState().active&&routes.length===0&&destination===null),true);
 await page.evaluate(()=>{
  document.getElementById('start-choice').value='map';setStart([3.139,101.6869],'Chosen test start');
 });
 await page.locator('#jalan-sheet-handle').click();await page.locator('#jalan-recent-list button').first().click();
 await page.waitForFunction(()=>routes.length===1);
 await page.waitForTimeout(100);
 const before=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng,map.getZoom()]);
 await page.evaluate(()=>{window.__currentPlace=[3.16,101.70];window.__heldLocation();});
 assert.deepEqual(await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng,map.getZoom()]),before,
  'late Stop fix cannot override a new destination or route overview');
 assert.equal(searches,1);
 console.log('PASS recent exact destination, fresh Stop location, report/Recenter swap, release timer, held/poor GPS guards and late Stop response');
};
