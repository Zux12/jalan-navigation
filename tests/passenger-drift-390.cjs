'use strict';
const assert=require('node:assert/strict');
module.exports=async(page,base)=>{
 await page.goto(base+'/index.html?mode=passenger');
 await page.evaluate(()=>{
  document.getElementById('tt-primary').checked=false;
  window.__motionTime=Date.now();const realDate=Date;
  Date=class extends realDate{constructor(...v){super(...(v.length?v:[window.__motionTime]));}static now(){return window.__motionTime;}};
  setStart([3,101.601],'Fixture start');destination=[3,101.61];
  routes=[{provider:'osrm',duration:600,distance:1000,legs:[],geometry:{type:'LineString',coordinates:[[101.6,3],[101.61,3]]}}];
  selectedRoute=0;renderRoutes();
  window.JalanVectorMap.nearbyRoads=()=>[{coordinates:[[101.601,3],[101.601,3.004]]}];
  window.__motionRequests=[];
  requestDrivingRoutes=(from,to)=>new Promise(resolve=>{window.__motionRequests.push({from,to});window.__finishMotionRoute=resolve;});
  window.__motionFix=(latitude,longitude,heading=90,speed=5)=>{
   window.__motionTime+=1000;
   window.__offlineGPSWatch({timestamp:Date.now(),coords:{latitude,longitude,accuracy:8,speed,heading}});
  };
 });
 await page.locator('#passenger-go').click();
 await page.evaluate(()=>window.__motionFix(3,101.601));
 await page.waitForFunction(()=>!document.getElementById('passenger-vehicle-screen').classList.contains('hidden'));
 await page.evaluate(()=>{window.__motionMarker=document.querySelector('.jalan-vehicle-marker');window.__motionFix(3.00009,101.6011,90,20);});
 await page.waitForFunction(()=>JalanGPS.getState().vehicleMode==='road-aligned');
 assert.equal(await page.evaluate(()=>JalanGPS.getState().vehiclePosition[0]),3,'minor drift displays on the route');
 assert.ok(await page.evaluate(()=>JalanGPS.getState().gpsPosition[0]>3),'raw GPS evidence remains separate');
 assert.equal(await page.evaluate(()=>window.__motionRequests.length),0);
 await page.evaluate(()=>window.__motionFix(3,101.601));
 const liveTriangle=async (latitude,longitude=101.601)=>{
  // Check both the classified position and the marker after animation.
  assert.deepEqual(await page.evaluate(()=>JalanGPS.getState().vehiclePosition),[latitude,longitude]);
  await page.waitForFunction(([lat,lon])=>Object.values(map._layers).some(x=>
   x.options?.icon?.options.className==='jalan-vehicle-marker'&&x.getLatLng().equals(L.latLng(lat,lon),1e-10)),[latitude,longitude]);
  const position=await page.evaluate(()=>{
   const marker=Object.values(map._layers).find(x=>x.options?.icon?.options.className==='jalan-vehicle-marker');
   const screen=document.getElementById('passenger-vehicle-screen').getBoundingClientRect();
   return {gps:JalanGPS.getState().vehiclePosition,point:[marker.getLatLng().lat,marker.getLatLng().lng],
    visible:screen.width>0&&screen.bottom>0&&screen.top<innerHeight,
    sameMarker:window.__motionMarker===marker.getElement()};
  });
  assert.deepEqual(position.gps,[latitude,longitude]);
  assert.ok(Math.hypot(position.point[0]-latitude,position.point[1]-longitude)<1e-9);
  assert.equal(position.visible,true);assert.equal(position.sameMarker,true);
 };
 // Preserve measured positions, but leave the selected road only when
 // successive readings fit the connected street.
 for(const latitude of [3.00012,3.00018,3.00024]){
  await page.evaluate(lat=>window.__motionFix(lat,101.60102,0,5),latitude);
  assert.deepEqual(await page.evaluate(()=>JalanGPS.getState().gpsPosition),[latitude,101.60102]);
  await liveTriangle(latitude===3.00024?latitude:3,latitude===3.00024?101.601:101.60102);
  if(latitude<3.00024)assert.equal(await page.evaluate(()=>window.__motionRequests.length),0);
 }
 await page.waitForFunction(()=>window.__motionRequests.length===1);
 assert.equal(await page.evaluate(()=>JalanGPS.getState().vehicleMode),'road-departure');
 assert.deepEqual(await page.evaluate(()=>window.__motionRequests[0].from),[3.00024,101.60102]);
 for(const latitude of [3.00030,3.00036]){
  await page.evaluate(lat=>window.__motionFix(lat,101.601,0,5),latitude);
  await liveTriangle(latitude);
 }
 await page.evaluate(()=>{
  const from=window.__motionRequests[0].from;
  window.__finishMotionRoute([{provider:'osrm',duration:400,distance:1100,legs:[],
   geometry:{type:'LineString',coordinates:[[from[1],from[0]],[101.61,3]]}}]);
 });
 await page.waitForFunction(()=>JalanGPS.getState().route.duration===400);
 await liveTriangle(3.00036);
 console.log('PASS moving detour: held until a connected turn is confirmed, latest GPS origin, pending request and route swap retain the live triangle');
};
