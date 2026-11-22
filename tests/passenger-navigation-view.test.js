'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),V=require('../passenger-navigation-view');
test('view defaults and stored percentages validate without accepting malformed settings',()=>{
 assert.deepEqual(V.sanitize(null),{zoom:80,tilt:100});
 assert.deepEqual(V.sanitize({zoom:0,tilt:0}),{zoom:0,tilt:0});
 assert.deepEqual(V.sanitize({zoom:150,tilt:-20}),{zoom:100,tilt:0});
 assert.deepEqual(V.sanitize({zoom:'50',tilt:NaN}),{zoom:80,tilt:100});
 assert.equal(V.zoomLevel(80),18.8);assert.equal(V.pitch(100),60);
});
test('native padding anchors the entire triangle above the bottom bar across viewport sizes',()=>{
 for(const [height,barTop]of [[844,737],[560,453],[390,283],[1000,865]]){
  const a=V.anchor({height,barTop}),projectedCenter=(height+a.padding.top-a.padding.bottom)/2;
  assert.equal(projectedCenter,a.y);assert.equal(a.y+42+12,barTop);
  assert.ok(a.padding.top>=0&&a.padding.bottom>=0);
 }
});
test('raster inverse preserves the same on-road anchor under heading and perspective changes',()=>{
 for(const height of [560,844])for(const tilt of [0,25,100])for(const angle of [-135,-45,0,90,180]){
  const y=height-160,o=V.rasterOffset({height,y,angle,tilt}),r=Math.PI/180,a=angle*r,p=17*tilt/100*r,scale=tilt===0?1:1.35;
  const x=scale*(o.x*Math.cos(a)-o.y*Math.sin(a)),rotY=scale*(o.x*Math.sin(a)+o.y*Math.cos(a));
  const actualY=rotY*Math.cos(p)/(1-rotY*Math.sin(p)/1200);
  assert.ok(Math.abs(x)<1e-8);assert.ok(Math.abs(actualY-(y-height/2))<1e-8);
 }
});

function simulatedTurn(start=0){
 let now=0,next=null,id=0;
 const samples=[],clock={
  performance:{now:()=>now},
  requestAnimationFrame:fn=>{assert.equal(next,null);next=fn;return ++id;},
  cancelAnimationFrame:()=>{next=null;}
 };
 const turn=V.bearingFollower(value=>samples.push(value),clock);
 turn.reset(start);
 return {turn,samples,frame(ms){now+=ms;const callback=next;next=null;callback?.(now);},active:()=>!!next};
}
test('GPS turns advance smoothly on the shortest arc at different refresh rates',()=>{
 for(const hz of [30,60,120]){
  const s=simulatedTurn(350);
  s.turn.aim(80);
  for(let frame=0;frame<hz/2;frame++)s.frame(1000/hz);
  assert.ok(s.samples[0]>350&&s.samples[0]<360);
  assert.ok(s.turn.bearing>436&&s.turn.bearing<440);
  for(let frame=0;frame<hz;frame++)s.frame(1000/hz);
  assert.equal(s.turn.bearing,440);assert.equal(s.active(),false);
  assert.ok(s.samples.every((v,i)=>i===0||v>s.samples[i-1]));
 }
});
test('new GPS readings retarget an ongoing turn and stationary jitter stays quiet',()=>{
 const s=simulatedTurn();s.turn.aim(30);
 for(let n=0;n<8;n++)s.frame(16);
 const before=s.turn.bearing,previous=s.samples.at(-2);
 s.turn.aim(60);assert.equal(s.turn.bearing,before);
 s.frame(16);assert.ok(s.turn.bearing-before>=(before-previous)*.8);
 for(let n=0;n<120;n++)s.frame(16);
 assert.equal(s.turn.bearing,60);
 for(const noisy of [60.8,59.1,61,60]){s.turn.aim(noisy);s.frame(16);}
 assert.equal(s.turn.bearing,60);assert.equal(s.active(),false);
 s.turn.aim(120);s.frame(16);s.turn.reset();const held=s.turn.bearing;
 s.frame(1000);assert.equal(s.turn.bearing,held);assert.equal(s.active(),false);
});
