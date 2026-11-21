'use strict';
const assert=require('node:assert/strict');
const {cameras}=require('../data/my-fixed-speed-cameras.json');
module.exports=async function cameraTrip(page){
 const camera=cameras.find(c=>c.ref==='E35'),[lon,lat]=camera.position;
 const point=metres=>[lon+(lon-camera.approach[0])*metres/45,lat+(lat-camera.approach[1])*metres/45];
 await page.addInitScript(()=>{
   localStorage.setItem('jalan-voice-mode-v1','alerts');
   window.__cameraSpeech=[];
   const synth=new EventTarget();
   synth.cancel=()=>{};synth.getVoices=()=>[];synth.speak=u=>window.__cameraSpeech.push(u.text);
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});

 });
 await page.reload();
 await page.locator('#jalan-launch').waitFor({state:'hidden'});
 await page.clock.install();
 await page.evaluate(({line,camera})=>{
   navigator.geolocation.watchPosition=ok=>{window.__cameraGPS=ok;return 654;};
   JalanLanguage.set('en',false);
   const distance=JalanReportModel.distance(line[0],line.at(-1));
   const route={provider:'osrm',geometry:{type:'LineString',coordinates:line},distance,duration:40,
     legs:[{steps:[{name:camera.road,ref:camera.ref,distance,maneuver:{type:'depart',location:line[0]}}]}]};
   startPoint=line[0].slice().reverse();destination=line.at(-1).slice().reverse();
   routes=[route];selectedRoute=0;renderRoutes();document.getElementById('passenger-go').click();
 },{line:[point(-360),camera.approach,camera.position,camera.exit,point(100)],camera});
 const drive=async metres=>{
   await page.clock.fastForward(1500);
   await page.evaluate(([longitude,latitude])=>window.__cameraGPS({timestamp:Date.now(),coords:{longitude,latitude,
     heading:62,speed:15,accuracy:4}}),point(metres));
   await page.clock.runFor(60);
 };
 const banner=page.locator('#passenger-camera-alert'),tab=page.locator('#passenger-turn-toggle');
 const row=page.locator('#passenger-report-list [data-category="speed-camera"]');
 await drive(-360);await tab.click();await row.waitFor();
 assert.match(await row.innerText(),/Speed camera/);assert.match(await row.innerText(),/Guthrie/);
 assert.doesNotMatch(await page.locator('#passenger-reports-panel').innerText(),/Camera data|Tachwire|JPJ|OpenStreetMap/i);
 await page.evaluate(({lon,lat})=>{
   const state=JalanGPS.getState(),total=JalanRouteDisplay.shape(state.route).total;
   const incident=(at,title)=>({lat,lng:lon,routeAlong:at,routeTotal:total,issue:title});
   dispatchEvent(new CustomEvent('jalan:incidents-updated',{detail:{route:state.route,checkedAt:Date.now(),
     incidents:[incident(410,'After camera'),incident(150,'Before camera')]}}));
 },{lon,lat});
 assert.deepEqual(await page.locator('#passenger-report-list strong').allTextContents(),['Before camera','Speed camera','After camera']);
 await tab.click();assert.equal(await banner.isVisible(),false);
 const pin=page.locator('.leaflet-marker-icon.passenger-camera-pin');
 assert.equal(await pin.count(),1);
 await drive(-330);await drive(-295);await banner.waitFor({state:'visible'});
 const voice=()=>page.evaluate(()=>window.__cameraSpeech.filter(text=>/speed camera/i.test(text)));
 assert.deepEqual(await voice(),['Speed camera ahead in 300 metres.']);
 const first=await banner.innerText();
 await drive(-260);assert.notEqual(await banner.innerText(),first);assert.equal((await voice()).length,1);
 assert.ok(await page.evaluate(()=>document.querySelector('#passenger-camera-alert').getBoundingClientRect().top>=
   document.querySelector('#passenger-turn-toggle').getBoundingClientRect().bottom-1));
 await page.evaluate(()=>JalanLanguage.set('ms',false));
 assert.match(await banner.innerText(),/Kamera had laju/);
 await page.clock.fastForward(10010);assert.equal(await banner.isVisible(),false);
 await page.evaluate(()=>JalanLanguage.set('en',false));
 for(let m=-240;m<=20;m+=20)await drive(m);
 await tab.click();assert.equal(await row.count(),0);assert.equal(await pin.count(),0);
 assert.equal((await voice()).length,1);
 await page.evaluate(()=>{JalanGPS.stop();JalanGPS.setVoiceMode('mute');document.getElementById('passenger-go').click();});
 await drive(-260);await banner.waitFor({state:'visible'});
 assert.equal((await voice()).length,1,'Mute keeps the visual warning silent on a new trip');
 const switched=await page.evaluate(()=>{
   const r=JalanGPS.getState().route;
   const next={...r,legs:[{steps:r.legs[0].steps.map(s=>({...s,name:'Parallel road',ref:'E99'}))}]};
   return JalanGPS.applyTrafficRoute(next);
 });
 assert.equal(switched,true);assert.equal(await banner.isVisible(),false);
 assert.equal(await pin.count(),0);await tab.click();assert.equal(await row.count(),0);
 await page.evaluate(()=>JalanGPS.stop());
};
