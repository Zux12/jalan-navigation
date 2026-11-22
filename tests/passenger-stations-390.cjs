'use strict';
const assert=require('node:assert/strict');
async function openingArea(page){
 const original=page.url(),url=new URL(original),calls=[];
 url.searchParams.set('stationCoverageTest','1');url.searchParams.set('renderer','raster');
 await page.addInitScript(()=>{
   if(!new URLSearchParams(location.search).has('stationCoverageTest'))return;
   // Install after the context's permission-denied stub, before the load callback.
   document.addEventListener('DOMContentLoaded',()=>{
     navigator.geolocation.getCurrentPosition=ok=>{window.__firstStationFix=ok;};
     navigator.geolocation.watchPosition=()=>1;
   });
 });
 const local=[3.158,101.711],town=[2.196,102.249];
 const petrol=(id,p)=>({id,position:{lat:p[0],lon:p[1]},poi:{name:id,categorySet:[{id:7311}]}});
 const charger=(id,p)=>({id,position:{lat:p[0]+.001,lon:p[1]},poi:{name:id,categorySet:[{id:7309}]}});
 let oldRequest,release;
 const held=new Promise(resolve=>{release=resolve;});
 const handle=async route=>{
   const q=new URL(route.request().url()).searchParams,lat=+q.get('lat'),lon=+q.get('lon'),radius=+q.get('radius');
   calls.push({lat,lon,radius});
   const near=p=>Math.abs(lat-p[0])<.007&&Math.abs(lon-p[1])<.007&&radius<1100;
   let rows=[];
   if(near(local))rows=[petrol('Local petrol',local),charger('Local EV',local)];
   else if(near(town))rows=[petrol('Melaka petrol',town),charger('Melaka EV',town)];
   else if(!oldRequest){oldRequest=true;await held;rows=[petrol('Old city station',[3.139,101.6869])];}
   else return route.fulfill({status:503,body:'simulated outage'}).catch(()=>{});
   await route.fulfill({json:{summary:{totalResults:rows.length},results:rows}}).catch(()=>{});
 };
 const pattern='**/nearbySearch/**';
 await page.route(pattern,handle);
 try{
   await page.goto(url.href,{waitUntil:'load'});await page.waitForFunction(()=>!!window.__firstStationFix);
   await page.clock.runFor(650);assert.equal(calls.length,0,'opening KL view waits for startup GPS');
   const overviewRequest=page.waitForRequest(r=>r.url().includes('/nearbySearch/'));
   await page.evaluate(()=>map.fire('dragstart'));
   await page.clock.runFor(650);await overviewRequest;
   const arrive=point=>page.evaluate(p=>window.__firstStationFix({timestamp:Date.now(),coords:{latitude:p[0],longitude:p[1],accuracy:6}}),point);
   const pin=name=>page.locator('#map .jalan-station-pin[title="'+name+'"]');
   await arrive(local);await pin('Local petrol').waitFor({timeout:6500});await pin('Local EV').waitFor();
   release();await page.clock.runFor(400);
   assert.equal(await pin('Old city station').count(),0,'late KL result cannot replace the local map');
   await page.evaluate(p=>{map.fire('dragstart');map.setView(p,17,{animate:false});},town);
   await pin('Melaka petrol').waitFor({timeout:6500});await pin('Melaka EV').waitFor();
   assert.equal(await pin('Local petrol').count(),0,'panning away discards the old view');
 }finally{release();await page.unroute(pattern,handle);await page.goto(original,{waitUntil:'load'});}
}
module.exports=async function stations(page){
 await openingArea(page);
 await page.route('**/nearbySearch/**',route=>route.fulfill({json:{summary:{totalResults:4},results:[
   {id:'pump',position:{lat:3.139,lon:101.686},poi:{name:'Shell Test',categorySet:[{id:7311}]}},
   {id:'charger',position:{lat:3.139,lon:101.68601},poi:{name:'Shell Recharge HPC',categorySet:[{id:7309}]},
    chargingPark:{connectors:[{connectorType:'IEC62196Type2CCS',currentType:'DC',ratedPowerKW:180},
     {currentType:'DC',ratedPowerKW:50},{currentType:'AC3',ratedPowerKW:22}]}},
   {id:'petrol',position:{lat:3.138,lon:101.687},poi:{name:'PETRONAS Test',brands:[{name:'PETRONAS'}],categorySet:[{id:7311}]}},
   {id:'ac',position:{lat:3.14,lon:101.685},poi:{name:'AC Test',categorySet:[{id:7309}]},
    chargingPark:{connectors:[{currentType:'AC3',ratedPowerKW:11}]}}
 ]}}));
 await page.reload({waitUntil:'load'});
 await page.evaluate(()=>{JalanLanguage.set('en',false);map.setView([3.139,101.686],16);});
 const input=page.locator('#passenger-stations'),pin=page.locator('#map .jalan-station-pin.combined').first();
 assert.ok(await input.isChecked());await pin.waitFor({state:'attached',timeout:7000});
 assert.deepEqual(await pin.locator('.station-pin-label>span').allTextContents(),['Shell Test','HPC · 180 kW','DC · 50 kW','AC · 22 kW']);
 assert.equal(await page.locator('#map .jalan-station-pin.petrol:not(.combined) .station-pin-label').textContent(),'PETRONAS');
 assert.equal(await page.locator('#map .jalan-station-pin.ev .station-pin-label').textContent(),'AC · 11 kW');
 assert.equal(await pin.locator('.station-drop > svg').count(),2,'a shared forecourt carries both symbols on one pin');
 const art=await pin.evaluate(el=>{
   const color=selector=>getComputedStyle(el.querySelector(selector)).fill;
   const rect=el.getBoundingClientRect(),label=el.querySelector('.station-pin-label').getBoundingClientRect();
   return [color('.station-ev-fill'),color('.station-petrol-fill'),rect.height>rect.width,label.right>rect.right];
 });
 assert.deepEqual(art,['rgb(17, 131, 28)','rgb(245, 188, 55)',true,true]);
 await page.evaluate(()=>map.setZoom(12,{animate:false}));
 await page.locator('#map .jalan-station-count').first().waitFor({state:'attached'});
 await page.evaluate(()=>map.setZoom(16,{animate:false}));await pin.waitFor({state:'attached'});
 const toggle=()=>input.evaluate(n=>n.click());
 await toggle();assert.equal(await pin.count(),0);await toggle();await pin.waitFor({state:'attached'});
 await page.evaluate(()=>{
   const start=[3.139,101.68],end=[3.139,101.70];
   const make=(a,b,i=0)=>({distance:1400+i*140,duration:160+15*i,tolls:false,
    geometry:{type:'LineString',coordinates:[[a[1],a[0]],[(a[1]+b[1])/2,a[0]+i*.0001],[b[1],b[0]]]},legs:[{steps:[]}]});
   startPoint=start;destination=end;destinationName='Destination';routes=[make(start,end)];selectedRoute=0;renderRoutes();
   const original=requestDrivingRoutes;window.__stationRestore=()=>{requestDrivingRoutes=original;};
   requestDrivingRoutes=(a,b,opt={})=>opt.stops?.length?JalanStationRoute.plan(a,b,opt.stops,opt,requestDrivingRoutes):
    Promise.resolve([make(a,b),make(a,b,1)]);
 });
 const card=page.locator('#jalan-station-card');
 async function tapStation(){
   await page.evaluate(()=>{map.stop();map.setView([3.139,101.686],16,{animate:false});});
   await pin.waitFor({state:'attached'});
   await page.evaluate(()=>Object.values(map._layers).find(l=>l.options.title==='Shell Test'&&l.options.interactive).fire('click'));
 }
 await tapStation();await card.getByRole('button',{name:'Add stop'}).waitFor();
 assert.match(await card.innerText(),/180 kW/);assert.match(await card.innerText(),/driving vs current route/);
 await card.getByRole('button',{name:'Add stop'}).click();
 assert.ok(await card.locator('.station-options button').count()>1);
 await card.locator('.station-options button').nth(1).click();
 await card.getByRole('button',{name:'Cancel'}).click();
 assert.equal(await page.evaluate(()=>!!routes[selectedRoute].pinnedStop),false);
 await tapStation();await card.getByRole('button',{name:'Add stop'}).click();
 await card.getByRole('button',{name:/Confirm/}).click();
 assert.deepEqual(await page.evaluate(()=>JalanStationRoute.stops(routes[selectedRoute]).map(s=>s.kind)),['station']);
 const regular=()=>page.evaluate(()=>JalanStationPlanner.open({kind:'regular',point:[3.139,101.692],name:'KL Sentral'},true));
 await regular();await card.getByRole('button',{name:'KL Sentral → Shell Test'}).click();
 await card.getByRole('button',{name:/Confirm/}).click();
 assert.deepEqual(await page.evaluate(()=>JalanStationRoute.stops(routes[selectedRoute]).map(s=>s.kind)),['regular','station']);
 await tapStation();await card.getByRole('button',{name:'Add stop'}).click();
 assert.equal(await card.getByRole('button',{name:'Shell Test → KL Sentral'}).getAttribute('aria-pressed'),'true');
 await page.clock.runFor(6400);assert.ok(await card.isVisible());
 await page.clock.runFor(750);assert.equal(await card.isVisible(),false);
 const result=await page.evaluate(()=>({order:JalanStationRoute.stops(routes[selectedRoute]).map(s=>s.kind),
  colors:Object.values(map._layers).filter(l=>l.options?.className==='jalan-stop-route').map(l=>l.options.color)}));
 assert.deepEqual(result.order,['station','regular']);assert.deepEqual(result.colors,['#e47508','#ffca28','#8047c7']);
 await page.evaluate(()=>{window.__stationRestore();clearRoute(true);});
};
