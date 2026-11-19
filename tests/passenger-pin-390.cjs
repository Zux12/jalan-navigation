'use strict';
const assert=require('node:assert/strict');
module.exports=async function pinCard(page,{routing=false}={}){
 const card=page.locator('#jalan-pin-card');
 async function press(x=150,y=320){
   await page.mouse.move(x,y);await page.mouse.down();
   try{await card.waitFor({state:'visible',timeout:4500});}
   finally{await page.mouse.up();}
 }
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
   writeText:async text=>{window.__copiedPin=text;}
 }}));
 await press();
 const coordinates=await card.locator('small').textContent();
 await card.getByRole('button',{name:'Share location'}).click();
 const link=new URL(await page.evaluate(()=>window.__copiedPin));
 assert.equal(link.hostname,'www.google.com');
 assert.equal(link.searchParams.get('query').split(',').map(x=>Number(x).toFixed(5)).join(', '),coordinates);
 assert.equal(await page.locator('#jalan-pin-toast').textContent(),'Location link copied.');
 assert.equal(await card.isVisible(),false);
 if(!routing)return;
 await press();
 await card.waitFor({state:'hidden',timeout:9000});
 // Seed a preview using a known start on the basic map, then exercise actual
 // Go, stop choice, waypoint request and overlay rendering.
 await page.evaluate(()=>{
   window.__pinInitial={start:startPoint,destination,choice:$('start-choice').value};
   window.__pinProvider=$('tt-primary').checked;$('tt-primary').checked=false;
   startPoint=[3.139,101.6869];destination=[3.145,101.697];
   routes=[{duration:200,distance:1500,geometry:{type:'LineString',coordinates:[startPoint,destination].map(p=>[p[1],p[0]])},legs:[]}];
   selectedRoute=0;renderRoutes();
 });
 let directOrigin=null;
 await page.route('https://router.project-osrm.org/route/v1/driving/**',route=>{
   const uri=new URL(route.request().url()),points=uri.pathname.split('/').at(-1).split(';').map(s=>s.split(',').map(Number));
   if(points.length===2){
     directOrigin=points[0];
     return route.fulfill({json:{code:'Ok',routes:[{duration:90,distance:800,legs:[],
       geometry:{type:'LineString',coordinates:points}}]}});
   }
   assert.equal(points.length,3);
   return route.fulfill({json:{code:'Ok',waypoints:points.map(location=>({location})),routes:[
    {duration:210,distance:1700,geometry:{type:'LineString',coordinates:points},legs:[{duration:100,distance:800,steps:[]},{duration:110,distance:900,steps:[]}]}
   ]}});
 });
 await press();
 await card.getByRole('button',{name:'Go',exact:true}).click();
 await card.getByRole('button',{name:'Add as stop'}).click();
 await page.waitForFunction(()=>!!routes[selectedRoute]?.pinnedStop);
 assert.deepEqual(await page.evaluate(()=>destination),[3.145,101.697]);
 assert.ok(await page.locator('.jalan-stop-route').count());
 // Feed the real guidance watcher a stop, then repeat the same route and
 // pass the stop. Both transitions must keep the live watcher and final pin.
 await page.evaluate(()=>{window.__originalStop=routes[0];window.__pinEvents=[];
   window.addEventListener('jalan:route-change',e=>window.__pinEvents.push(e.detail.reason));
   $('passenger-go').click();});
 const feed=async samples=>page.evaluate(samples=>{
   const [lat,lng]=window.__originalStop.pinnedStop.access,now=Date.now();
   for(const [age,offset,speed] of samples)window.__offlineGPSWatch({timestamp:now-age,
     coords:{latitude:lat+offset/111320,longitude:lng,accuracy:4,speed,heading:0}});
 },samples);
 await feed([[8000,0,0],[4500,0,0],[1500,0,0]]);
 await page.waitForFunction(()=>window.__pinEvents.includes('pin-arrived'));
 assert.equal(await page.evaluate(()=>JalanGPS.getState().active&&!JalanGPS.getState().route.pinnedStop),true);
 assert.equal(directOrigin,null,'on arrival the already calculated onward leg is used');
 await page.evaluate(()=>{
   clearRoute(false);routes=[window.__originalStop];selectedRoute=0;renderRoutes();$('passenger-go').click();
 });
 await feed([[9000,-25,15],[7000,0,15],[5000,25,15],[2000,65,15]]);
 await page.waitForFunction(()=>window.__pinEvents.includes('pin-passed'));
 const state=await page.evaluate(()=>({final:destination,gps:JalanGPS.getState().gpsPosition,
   active:JalanGPS.getState().active,stop:!!routes[0].pinnedStop}));
 assert.equal(state.active,true);assert.equal(state.stop,false);
 assert.deepEqual(state.final,[3.145,101.697]);assert.deepEqual(directOrigin,[state.gps[1],state.gps[0]]);
 await page.evaluate(()=>{clearRoute(true);startPoint=window.__pinInitial.start;$('tt-primary').checked=window.__pinProvider;});
 await page.unroute('https://router.project-osrm.org/route/v1/driving/**');
};
