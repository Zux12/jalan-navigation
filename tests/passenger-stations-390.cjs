'use strict';
const assert=require('node:assert/strict');
module.exports=async function stations(page){
 await page.route('**/nearbySearch/**',route=>route.fulfill({json:{summary:{totalResults:2},results:[
   {id:'pump',position:{lat:3.139,lon:101.686},poi:{name:'Shell Test',categorySet:[{id:7311}]}},
   {id:'charger',position:{lat:3.139,lon:101.68601},poi:{name:'Shell Recharge HPC',categorySet:[{id:7309}]},
    chargingPark:{connectors:[{connectorType:'IEC62196Type2CCS',currentType:'DC',ratedPowerKW:180}]}}
 ]}}));
 await page.reload({waitUntil:'load'});
 await page.evaluate(()=>{JalanLanguage.set('en',false);map.setView([3.139,101.686],16);});
 const input=page.locator('#passenger-stations'),pin=page.locator('#map .jalan-station-pin.combined').first();
 assert.ok(await input.isChecked());await pin.waitFor({state:'attached',timeout:7000});
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
 const tapStation=()=>page.evaluate(()=>Object.values(map._layers).find(l=>l.options.title==='Shell Test'&&l.options.interactive).fire('click'));
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
