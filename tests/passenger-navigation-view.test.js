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
