'use strict';
// No real geolocation, provider, database, or map requests. Exercises the actual
// GPS module's trust contract, independent from the proactive checker mock.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','gps-navigation.js'),'utf8');
test('JalanGPS match confidence is cleared on predicted fixes, stop and restart',async()=>{
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',classList:{add(){},remove(){},toggle(){}},
    setAttribute(){},addEventListener(){},onclick:null});
  return elements.get(id);
 };
 let updateGPS=null,mode='matched',cleared=0,feeds=0;
 const display={panTo(){},removeLayer(){},invalidateSize(){}};
 const qualityEvents=[];
 const browserWindow={
  dispatchEvent(e){if(e.type==='jalan:location-quality')qualityEvents.push(e.detail);},JalanNavigation:{stop(){}},
  JalanVoice:{reset(){},label(){return 'Muted'},nextMode(){return 'mute'},announce(){},alert(){}},
  JalanPredictiveGPS:{create:()=>({feed:({position})=>{feeds++;return {mode,position,along:0};}})}
 };
 const ctx={
  window:browserWindow,document:{hidden:false,getElementById:get,
    body:{classList:{add(){},remove(){},contains(){return false}}},addEventListener(){}},
  navigator:{geolocation:{watchPosition(success){updateGPS=success;return 1},
    clearWatch(){cleared++}}},
  L:{circleMarker:()=>({addTo(){return this},setLatLng(){}})},
  map:display,routes:[{provider:'tomtom',duration:600,distance:1200,legs:[],
    geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6953,3.1478]]}}],
  selectedRoute:0,destination:[3.1478,101.6953],startPoint:null,renderRoutes(){},
  updateLocation(){},fmtDist:m=>String(m),fmtTime:s=>String(s),
  statusEl:{textContent:''},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
  Date,Math,AbortController,setTimeout(){},clearTimeout(){},console
 };
 vm.runInNewContext(source,ctx,{filename:'gps-navigation.js'});
 const state=()=>browserWindow.JalanGPS.getState();
 assert.equal(state().matched,false);
 get('gps-start').onclick();
 assert.equal(state().active,true);
 assert.equal(state().matched,false,'starting GPS must not borrow an old fix');
 const fix=()=>({coords:{latitude:3.139,longitude:101.6869,accuracy:6,
   speed:0,heading:0},timestamp:Date.now()});
 updateGPS(fix());
 assert.equal(state().matched,true,'verified predictor match permits proactive checks');
 // The predictor may call an impossible point 'matched'; measured GPS must
 // independently reject it and must not export that coordinate or a turn.
 const jump=fix();jump.coords.latitude=3.24;jump.coords.longitude=101.9;
 const feedsBeforeJump=feeds;
 updateGPS(jump);
 for(let i=0;i<8;i++)updateGPS({...jump,timestamp:Date.now()});
 assert.equal(feeds,feedsBeforeJump,
   'a series of impossible GPS teleports must not poison route predictor history');
 assert.equal(qualityEvents.at(-1).error,true,
   'rejected measurement is not painted as a valid GPS-quality fix');
 assert.equal(state().matched,false,'rejected GPS jump cannot retain route confidence');
 assert.equal(state().gpsReliable,false,'a rejected sample is not a fresh measured fix');
 assert.deepEqual(Array.from(state().gpsPosition),[3.139,101.6869]);
 assert.deepEqual(Array.from(state().position),[3.139,101.6869],
   'read-only route state cannot export a rejected GPS teleport');
 assert.match(get('gps-instruction').textContent,/Route alignment pending/,
   'even a predictor-matched teleport must pause turning guidance');
 updateGPS(fix());assert.equal(state().matched,true);
 const expired=fix();expired.timestamp=Date.now()-20000;
 updateGPS(expired);
 assert.equal(state().matched,false,'cached 20-second-old Safari reading invalidates GPS match');
 assert.equal(state().accuracy,Infinity,'expired reading must not claim accuracy');
 assert.equal(state().fixAgeMs,Infinity,'expired reading must not refresh GPS age');
 updateGPS(fix());
 assert.equal(state().matched,true,'fresh verified fix can recover after stale location');
 assert.equal(state().accuracy,6,'proactive route checks get the real numeric GPS accuracy');
 // A predictor match is not enough when the browser supplies no trustworthy
 // accuracy. In particular "Unknown" must never be parsed as numeric 0 m.
 for(const badAccuracy of [undefined,NaN,-3,'6']){
  const f=fix();f.coords.accuracy=badAccuracy;
  updateGPS(f);
  assert.equal(state().matched,false,'invalid GPS accuracy revokes a route-match claim');
  assert.equal(state().accuracy,Infinity,'invalid accuracy must not pass the 75 m proactive threshold');
  assert.equal(qualityEvents.at(-1).error,true,'invalid accuracy must downgrade GPS quality');
 }
 updateGPS(fix());
 assert.equal(state().matched,true);
 assert.equal(state().accuracy,6);
 mode='predicted';updateGPS(fix());
 assert.equal(state().matched,false,'predicted position is not a verified road match');
 assert.equal(qualityEvents.at(-1).accuracy,6,'display quality retains actual accuracy independently from route match');
 assert.equal(qualityEvents.at(-1).valid,true);
 assert.equal('position' in qualityEvents.at(-1),false,'quality event does not publish coordinates');
 mode='matched';updateGPS(fix());
 assert.equal(state().matched,true);
 browserWindow.JalanGPS.stop();
 assert.equal(state().active,false);
 assert.equal(state().matched,false);
 assert.equal(state().position,null,'stopped session must not expose stale GPS');
 assert.equal(state().gpsPosition,null,'stop revokes the old measured-position session');
 assert.equal(state().accuracy,Infinity,'stopped session clears numeric GPS accuracy');
 assert.equal(cleared,1);
 get('gps-start').onclick();
 assert.equal(state().active,true);
 assert.equal(state().matched,false,'restart must reset match confidence');
 assert.equal(state().position,null);
 assert.equal(state().accuracy,Infinity,'restarted session must not inherit accuracy');
 // A successful replacement must update the active route matcher in place,
 // preserving the original GPS watcher and measured vehicle fix.
 let watchStarts=1;
 ctx.navigator.geolocation.watchPosition=success=>{updateGPS=success;watchStarts++;return watchStarts;};
 updateGPS(fix());
 const previousWatchClears=cleared;
 const previousRoute=state().route;
 ctx.requestDrivingRoutes=async()=>[{...previousRoute,
   geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6955,3.148]]}}];
 await get('gps-reroute').onclick();
 assert.equal(cleared,previousWatchClears,
   'successful reroute must not stop the existing GPS watcher');
 assert.equal(watchStarts,1,
   'successful reroute must not start a second GPS watcher');
 assert.equal(state().active,true,'new route GPS session must be active');
 assert.notEqual(state().route,previousRoute,'same GPS session must hold the replacement route');
 assert.equal(state().matched,false,'reroute must not reuse old road-match confidence');
 // A new navigation session may legitimately begin far from the last trip.
 // Its first accurate fix must not be rejected by the previous trip's filter.
 browserWindow.JalanGPS.stop();get('gps-start').onclick();
 assert.equal(state().gpsPosition,null,'new session starts without prior trip coordinates');
 const newTrip=fix();newTrip.coords.latitude=3.24;newTrip.coords.longitude=101.9;
 updateGPS(newTrip);
 assert.equal(state().gpsReliable,true,'fresh independent GPS session accepts its first real fix');
 assert.equal(state().matched,true);
 assert.deepEqual(Array.from(state().gpsPosition),[3.24,101.9]);
});
