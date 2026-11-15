'use strict';
// No real geolocation, provider, database, or map requests. Exercises the actual
// GPS module's trust contract, independent from the proactive checker mock.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','gps-navigation.js'),'utf8');
test('JalanGPS match confidence is cleared on predicted fixes, stop and restart',()=>{
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',classList:{add(){},remove(){},toggle(){}},
    setAttribute(){},addEventListener(){},onclick:null});
  return elements.get(id);
 };
 let updateGPS=null,mode='matched',cleared=0;
 const display={panTo(){},removeLayer(){},invalidateSize(){}};
 const browserWindow={
  dispatchEvent(){},JalanNavigation:{stop(){}},
  JalanVoice:{reset(){},label(){return 'Muted'},nextMode(){return 'mute'},announce(){},alert(){}},
  JalanPredictiveGPS:{create:()=>({feed:({position})=>({mode,position,along:0})})}
 };
 const ctx={
  window:browserWindow,document:{hidden:false,getElementById:get,
    body:{classList:{add(){},remove(){}}},addEventListener(){}},
  navigator:{geolocation:{watchPosition(success){updateGPS=success;return 1},
    clearWatch(){cleared++}}},
  L:{circleMarker:()=>({addTo(){return this},setLatLng(){}})},
  map:display,routes:[{provider:'tomtom',duration:600,distance:1200,legs:[],
    geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6953,3.1478]]}}],
  selectedRoute:0,destination:[3.1478,101.6953],renderRoutes(){},
  updateLocation(){},fmtDist:m=>String(m),fmtTime:s=>String(s),
  statusEl:{textContent:''},CustomEvent:class{constructor(type){this.type=type}},
  Date,Math,setTimeout(){},console
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
 mode='predicted';updateGPS(fix());
 assert.equal(state().matched,false,'predicted position is not a verified road match');
 mode='matched';updateGPS(fix());
 assert.equal(state().matched,true);
 browserWindow.JalanGPS.stop();
 assert.equal(state().active,false);
 assert.equal(state().matched,false);
 assert.equal(state().position,null,'stopped session must not expose stale GPS');
 assert.equal(cleared,1);
 get('gps-start').onclick();
 assert.equal(state().active,true);
 assert.equal(state().matched,false,'restart must reset match confidence');
 assert.equal(state().position,null);
});
