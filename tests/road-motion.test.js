'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../predictive-gps.js'),'utf8'),ctx);
const route=[[101.6,3],[101.61,3]],branch={coordinates:[[101.601,3],[101.601,3.004]]};
function scene(){const m=ctx.window.JalanPredictiveGPS.createRoadMotion(route);let time=100000;
 return {feed(position,{speed=5,heading=90,accuracy=8,roads=null,delta=1000}={}){
  time+=delta;return m.feed({position,time,speed,heading,accuracy,roads});}};}
test('small sideways drift stays on the selected road without changing measured input',()=>{
 const s=scene();s.feed([3,101.601]);const raw=[3.0001,101.6012],before=[...raw];
 const fix=s.feed(raw,{speed:20,roads:[]});
 assert.equal(fix.position[0],3);assert.equal(fix.heading,90);assert.equal(fix.mode,'road-aligned');
 assert.equal(fix.allowDeviation,false);assert.deepEqual(raw,before);
});
test('one lateral jump cannot become a road change or reroute',()=>{
 const s=scene();s.feed([3,101.601]);
 const jump=s.feed([3.0008,101.601],{speed:20,heading:90,roads:[branch]});
 assert.equal(jump.position[0],3);assert.equal(jump.allowDeviation,false);assert.equal(jump.certain,false);
 const recovered=s.feed([3,101.6013],{speed:20,roads:[branch]});
 assert.equal(recovered.mode,'road-aligned');
});
test('sustained low-speed turn onto a connected road is released',()=>{
 const s=scene();s.feed([3,101.601]);let result;
 for(const lat of [3.00012,3.00018,3.00024])result=s.feed([lat,101.601],{heading:0,roads:[branch]});
 assert.equal(result.mode,'road-departure');assert.equal(result.allowDeviation,true);
 assert.equal(result.certain,true);assert.ok(result.position[0]>3.0002);
 // Stopping on the new road does not throw the vehicle back onto the old one.
 result=s.feed([3.00024,101.601],{speed:0,heading:null,roads:[branch],delta:12000});
 assert.equal(result.mode,'road-departure');
 result=s.feed([3.0001,101.601],{speed:3,heading:180,roads:[branch],delta:5000});
 assert.equal(result.mode,'road-departure','an established new road is not stolen by the nearby old-route corridor');
});
test('an abrupt right-angle turn at highway speed is held despite a nearby road',()=>{
 const s=scene();s.feed([3,101.601],{speed:30});let result;
 for(const lat of [3.00012,3.00018,3.00024,3.0003])result=s.feed([lat,101.601],{speed:30,heading:0,roads:[branch]});
 assert.equal(result.allowDeviation,false);assert.equal(result.position[0],3);
});
test('missing GPS speed cannot bypass the sharp-turn check',()=>{
 const s=scene();s.feed([3,101.601],{speed:30});let result;
 for(const lat of [3.0002,3.0004,3.0006,3.0008])result=s.feed([lat,101.601],{speed:null,heading:null,roads:[branch]});
 assert.equal(result.allowDeviation,false);assert.equal(result.certain,false);
});
test('a gradual moving exit can accumulate a turn without being treated as an abrupt jump',()=>{
 const s=scene();s.feed([3,101.601],{speed:20});
 const trace=[[3.00002,101.6011,80],[3.00007,101.6012,65],[3.00015,101.6013,50],
  [3.00026,101.60138,35],[3.0004,101.60142,15]];
 const exit={coordinates:[[101.601,3],...trace.map(([lat,lng])=>[lng,lat])]};let result;
 for(const [lat,lng,heading] of trace)result=s.feed([lat,lng],{speed:20,heading,roads:[exit]});
 assert.equal(result.mode,'road-departure');assert.equal(result.certain,true);
});
test('parallel roads and bridge/tunnel crossings do not establish a turn connection',()=>{
 for(const road of [{coordinates:[[101.6,3.0004],[101.61,3.0004]]},{...branch,bridge:true},{...branch,layer:1}]){
  const s=scene();s.feed([3,101.601]);let result;
  for(let i=0;i<6;i++)result=s.feed([3.0004,101.601+i*.00006],{heading:90,roads:[road],delta:2000});
  assert.equal(result.allowDeviation,false);assert.equal(result.certain,false);
 }
});
test('loaded road evidence with no connected candidate does not invent a road',()=>{
 const s=scene();s.feed([3,101.601]);let result;
 for(let i=0;i<6;i++)result=s.feed([3.0008,101.601+i*.0001],{roads:[],delta:3000});
 assert.equal(result.allowDeviation,false);assert.equal(result.position[0],3);
});
test('a ground-level crossing does not prove an exit from an elevated route',()=>{
 const s=scene();s.feed([3,101.601]);let result;
 const elevated={coordinates:route,bridge:true,layer:1};
 for(const lat of [3.00012,3.00018,3.00024,3.0003])result=s.feed([lat,101.601],{heading:0,roads:[elevated,branch]});
 assert.equal(result.allowDeviation,false);assert.equal(result.certain,false);
});
test('missing road tiles require longer coherent movement and retain uncertainty',()=>{
 const s=scene();s.feed([3,101.601]);let result;
 for(let i=0;i<4;i++)result=s.feed([3.0008,101.601+i*.0001],{roads:null,delta:3000});
 assert.equal(result.mode,'departure-unverified');assert.equal(result.allowDeviation,true);assert.equal(result.certain,false);
 result=s.feed([3.0008,101.6013],{roads:null,delta:30000,speed:0});
 assert.equal(result.allowDeviation,true,'an established departure survives a stopped retry');
});

test('a sustained turn away from the route can recover when its side street is missing from loaded tiles',()=>{
 const s=scene();s.feed([3,101.601]);let result;
 for(const lat of [3.00012,3.00023,3.00034,3.00045,3.00056])
  result=s.feed([lat,101.601],{roads:[],heading:0,delta:2000});
 assert.equal(result.mode,'departure-unverified');assert.equal(result.allowDeviation,true);
 result=s.feed([3.0006,101.601],{roads:[],heading:null,speed:0});
 assert.equal(result.allowDeviation,true);
 result=s.feed([3,101.601],{roads:[],heading:90});
 assert.equal(result.mode,'road-aligned');
});
