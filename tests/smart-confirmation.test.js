'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../smart-confirmation.js'),'utf8');
function scene(t,mode='passenger'){
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1700000000000});
 const window=new EventTarget(),document=new EventTarget(),nodes=new Map();
 function element(){
  const classes=new Set();
  return {setAttribute(){},classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)},
   set className(value){classes.clear();for(const name of value.split(' '))classes.add(name);},textContent:'',checked:false};
 }
 const el=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 document.createElement=element;document.getElementById=el;document.querySelector=()=>null;
 document.body=element();document.body.append=node=>nodes.set(node.id,node);document.body.classList.add('nav-active');
 el('jalan-home-menu-panel').className='hidden';el('passenger-turn-list').className='hidden';
 el('passenger-report-confirm').hidden=true;el('hs-segment').value='demo';
 const state={active:true,route:{geometry:{coordinates:[[101,3],[101.01,3]]}}};
 window.JalanGPS={getState:()=>state};window.JalanRouteTraffic={freeFlowAt:()=>60};
 window.JalanHistoricalSpeed={bucket:()=>({}),profile:()=>({normal:60,confident:true})};
 vm.runInNewContext(source,{window,document,location:{search:'?mode='+mode},URLSearchParams,Date,setTimeout,clearTimeout});
 const fix=(overrides={})=>window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{
  accuracy:5,gpsReliable:true,matched:true,gpsFixAgeMs:0,gpsPosition:[3,101],speedLimitIndex:0,speedMps:4,...overrides}}));
 const sample=(seconds,overrides={})=>{fix(overrides);for(let s=5;s<=seconds;s+=5){t.mock.timers.tick(5000);fix(overrides);}};
 return {el,window,document,state,fix,sample,visible:()=>!el('smart-prompt').classList.contains('hidden')};
}

test('passenger slowdown activates with both switches off, times out and respects the cooldown',t=>{
 const s=scene(t);
 s.sample(70);assert.equal(s.visible(),false);
 t.mock.timers.tick(5000);s.fix();assert.equal(s.visible(),true);
 t.mock.timers.tick(7999);assert.equal(s.visible(),true);
 t.mock.timers.tick(1);assert.equal(s.visible(),false);
 assert.match(s.el('smart-status').textContent,/No response recorded/);
 s.sample(85);assert.equal(s.visible(),false);
});

test('route loss, stale or inaccurate GPS, stops, backgrounding and arrival break the interval',t=>{
 const s=scene(t);
 for(const invalid of [{matched:false},{gpsReliable:false},{gpsFixAgeMs:12000},{accuracy:50},{speedMps:0},{nearDestination:true}]){
  s.sample(65);s.fix(invalid);s.sample(10);assert.equal(s.visible(),false);
  s.window.dispatchEvent(new Event('jalan:route-change'));
 }
 s.sample(65);t.mock.timers.tick(30000);s.sample(10);assert.equal(s.visible(),false);
 s.document.hidden=true;s.document.dispatchEvent(new Event('visibilitychange'));s.document.hidden=false;
 s.sample(65);assert.equal(s.visible(),false);s.state.route={...s.state.route};
 s.sample(70);assert.equal(s.visible(),false);
});

test('a nearby report takes priority over the local question',t=>{
 const s=scene(t);s.sample(75);assert.equal(s.visible(),true);
 s.el('passenger-report-confirm').hidden=false;s.window.dispatchEvent(new Event('jalan:nearby-report-prompt'));
 assert.equal(s.visible(),false);s.sample(1000);assert.equal(s.visible(),false);
 s.el('passenger-report-confirm').hidden=true;s.sample(75);assert.equal(s.visible(),true);
 let sent=0;s.window.JalanCommunityReports={reportSlowdown:()=>sent++};s.el('smart-yes').onclick();assert.equal(s.visible(),false);assert.equal(sent,1);
});

test('the engineering preview still needs its switch',t=>{
 const e=scene(t,'engineering');
 e.sample(80);assert.equal(e.visible(),false);
 e.el('smart-enable').checked=true;e.sample(75);assert.equal(e.visible(),true);
 e.el('smart-no').onclick();assert.equal(e.visible(),false);assert.match(e.el('smart-status').textContent,/No, not in traffic/);
});

test('without flow coverage only two minutes of continuous crawling qualify',t=>{
 const s=scene(t);s.window.JalanRouteTraffic.freeFlowAt=()=>null;
 s.sample(150,{speedMps:5});assert.equal(s.visible(),false);
 s.sample(115,{speedMps:2});assert.equal(s.visible(),false);
 t.mock.timers.tick(5000);s.fix({speedMps:2});assert.equal(s.visible(),true);
 s.window.dispatchEvent(new Event('jalan:journey-stop'));assert.equal(s.visible(),false);
});

test('moving community traffic suppresses an isolated crawl; a confirmed slow cell can ask a stopped driver',t=>{
 const s=scene(t);s.window.JalanCommunityFlow={condition:()=>({type:'smooth'})};
 s.sample(180);assert.equal(s.visible(),false);
 s.window.JalanCommunityFlow.condition=()=>({type:'heavy'});s.fix({speedMps:0});
 assert.equal(s.visible(),true);s.el('smart-no').onclick();assert.equal(s.visible(),false);
});
