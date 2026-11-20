'use strict';
const assert=require('node:assert/strict');
module.exports=async function avoidTolls(page){
 const toggle=page.locator('#passenger-avoid-tolls'),go=page.locator('#passenger-go'),box=page.locator('#passenger-toll-feedback');
 await page.evaluate(()=>{
  JalanLanguage.set('en',false);JalanPassengerJourney.stop();
  $('tt-primary').checked=true;$('tt-key').value='TEST_AVOID_TOLLS';
  setStart([3.139,101.6869],'Start');destination=[3.1478,101.6953];destinationName='Destination';
  navigator.geolocation.watchPosition=ok=>{window.__tollFix=ok;return 72;};
 });
 let scenario='paid',hold=null,requestReady,legRequest=null;
 const ready=new Promise(resolve=>{requestReady=resolve;});
 await page.route('https://api.tomtom.com/routing/1/calculateRoute/**',async intercept=>{
  const url=new URL(intercept.request().url());
  const points=url.pathname.split('/').at(-2).split(':').map(v=>{const [latitude,longitude]=v.split(',').map(Number);return {latitude,longitude};});
  const legs=points.slice(1).map((point,i)=>({points:[points[i],point],summary:{lengthInMeters:1000,travelTimeInSeconds:100}}));
  const sections=[{sectionType:'TRAVEL_MODE',startPointIndex:0,endPointIndex:legs.length}];
  if(points.length===3){
   legRequest={query:url.searchParams.get('avoid'),body:intercept.request().postDataJSON()};
   sections.push({sectionType:'TOLL',startPointIndex:0,endPointIndex:1});
  }else if(scenario==='paid'||scenario==='hold')sections.push({sectionType:'TOLL',startPointIndex:0,endPointIndex:1});
  if(scenario==='hold'&&url.searchParams.has('avoid')){
   await new Promise(resolve=>{hold=resolve;requestReady();});
  }
  if(scenario==='unknown')sections.length=0;
  await intercept.fulfill({json:{routes:[{legs,summary:{lengthInMeters:legs.length*1000,travelTimeInSeconds:legs.length*100},sections}]}});
 });
 await page.evaluate(()=>JalanTomTom.calculate());
 assert.equal(await toggle.isChecked(),false);
 scenario='hold';await toggle.check();await ready;
 assert.equal(await go.isDisabled(),true);
 await page.waitForTimeout(7200);
 assert.equal(await page.evaluate(()=>JalanGPS.getState().active),false);
 hold();await box.getByText('All routes found have tolls.').waitFor();
 await box.getByRole('button',{name:'Show routes with tolls'}).click();
 assert.equal(await toggle.isChecked(),false);
 assert.equal(await page.evaluate(()=>JalanTollChoices.manualReview),true);
 scenario='unknown';await toggle.check();
 await box.getByText('Could not confirm a toll-free route.').waitFor();
 assert.equal(await go.isDisabled(),true);
 scenario='free';await box.getByRole('button',{name:'Retry'}).click();
 await page.waitForFunction(()=>routes[0]?.tollPolicy&&!$('passenger-go').disabled);
 assert.equal(await page.locator('#passenger-route-list button').count(),1);
 assert.equal(await page.locator('#passenger-route-list small').last().innerText(),'Toll-Free');
 await page.evaluate(()=>JalanLanguage.set('ms',false));
 await page.getByText('Elakkan tol',{exact:true}).first().waitFor();
 await page.evaluate(()=>JalanLanguage.set('en',false));
 await page.waitForTimeout(3500);assert.equal(await page.evaluate(()=>JalanGPS.getState().active),false);
 await page.waitForFunction(()=>JalanGPS.getState().active,{},{timeout:8000});
 const current=()=>page.evaluate(()=>{
  window.__tollFix({timestamp:Date.now(),coords:{latitude:3.139,longitude:101.6869,accuracy:5,heading:45,speed:1}});
 });
 await current();
 assert.equal(await page.locator('#journey-avoid-tolls').isChecked(),true);
 const card=page.locator('#jalan-pin-card');
 async function add(){
  await current();await page.mouse.move(145,360);await page.mouse.down();
  try{await card.waitFor({state:'visible',timeout:3500});}finally{await page.mouse.up();}
  await card.getByRole('button',{name:'Go',exact:true}).click();
  await card.getByRole('button',{name:'Add as stop'}).click();
  await card.getByText('The route to this stop has tolls.').waitFor();
 }
 await page.evaluate(()=>{window.__beforeTollStop=routes[selectedRoute];});
 await add();assert.equal(legRequest.query,'tollRoads');
 await card.getByRole('button',{name:'Don’t allow tolls'}).click();
 assert.equal(await page.evaluate(()=>routes[selectedRoute]===window.__beforeTollStop&&JalanGPS.getState().active),true);
 assert.equal(await page.locator('.jalan-stop-route').count(),0);
 await add();await current();await card.getByRole('button',{name:'Allow tolls to this stop'}).click();
 await page.waitForFunction(()=>routes[selectedRoute]?.pinnedStop?.inboundTolls===true);
 assert.deepEqual(legRequest.body,{legs:[{},{avoids:[{name:'tollRoads'}]}]});
 assert.deepEqual(await page.evaluate(()=>routes[selectedRoute].pinnedStop.onward.tollPolicy),{});
 await page.evaluate(()=>JalanPassengerJourney.stop());
 assert.equal(await toggle.isChecked(),false);
 console.log('PASS avoid tolls: Go timer, fallback review, BM, stop refusal and per-leg approval');
};
