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
 // A road-supported low-speed turn must still escape the old route.
 for(const latitude of [3.00012,3.00018,3.00024])await page.evaluate(lat=>window.__motionFix(lat,101.601,0,5),latitude);
 await page.waitForFunction(()=>window.__motionRequests.length===1);
 assert.equal(await page.evaluate(()=>JalanGPS.getState().vehicleMode),'road-departure');
 assert.ok(await page.evaluate(()=>JalanGPS.getState().vehiclePosition[0]>3.0002));
 assert.equal(await page.evaluate(()=>window.__motionMarker===document.querySelector('.jalan-vehicle-marker')),true);
 assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),true,'triangle remains visible while rerouting');
 await page.evaluate(()=>{
  const from=window.__motionRequests[0].from;
  window.__finishMotionRoute([{provider:'osrm',duration:400,distance:1100,legs:[],
   geometry:{type:'LineString',coordinates:[[from[1],from[0]],[101.61,3]]}}]);
 });
 await page.waitForFunction(()=>JalanGPS.getState().route.duration===400);
 assert.equal(await page.evaluate(()=>window.__motionMarker===document.querySelector('.jalan-vehicle-marker')),true);
 console.log('PASS motion matching: drift stays on road, measured evidence retained, connected slow turn releases and reroute retains triangle');
};
