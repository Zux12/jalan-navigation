'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const geo=require('../community-report-model.js'),{matchRoute}=require('../passenger-speed-cameras.js');
const {cameras}=require('../data/my-fixed-speed-cameras.json');
const camera=cameras.find(c=>c.ref==='E35');
function routeFor(line,ref,provider='tomtom'){
 const lengths=[0];
 for(let i=1;i<line.length;i++)lengths.push(lengths[i-1]+geo.distance(line[i-1],line[i]));
 const distance=lengths.at(-1);
 return {provider,distance,lengths,geometry:{coordinates:line},roadGuidance:[{routeOffsetInMeters:0,roadNumbers:[ref]}],
   legs:[{steps:[{ref,distance}]}]};
}
const shape=r=>({lengths:r.lengths,total:r.distance});
const match=(r,c=camera)=>matchRoute(r,[c],shape,geo);
test('each bundled speed camera matches its named, directed carriageway on both route providers',()=>{
 assert.ok(cameras.length>0);
 assert.equal(new Set(cameras.map(c=>c.id)).size,cameras.length);
 for(const cam of cameras){
   const line=[cam.approach,cam.position,cam.exit];
   for(const provider of ['tomtom','osrm']){
     const [report,...rest]=match(routeFor(line,cam.ref,provider),cam);
     assert.equal(report?.id,cam.id);assert.equal(rest.length,0);
     assert.ok(Math.abs(report.routeAlong-geo.distance(line[0],line[1]))<.1);
     assert.equal(match(routeFor([...line].reverse(),cam.ref,provider),cam).length,0);
   }
 }
});
test('a nearby parallel road, an overlapping wrong road, and a crossing are excluded',()=>{
 const line=[camera.approach,camera.position,camera.exit];
 assert.deepEqual(match(routeFor(line.map(([x,y])=>[x,y+.0003]),camera.ref)),[]);
 assert.deepEqual(match(routeFor(line,'E12')),[]);
 const [x,y]=camera.position;
 assert.deepEqual(match(routeFor([[x,y-.001],[x,y+.001]],camera.ref)),[]);
});
test('loop retains both forward approaches and excludes the return carriageway',()=>{
 const a=camera.approach,b=camera.position,c=camera.exit;
 const items=match(routeFor([a,b,c,b,a,b,c],camera.ref));
 assert.equal(items.length,2);assert.ok(items[1].routeAlong>items[0].routeAlong);
 assert.notEqual(items[0].key,items[1].key);
});
test('a camera just beyond the destination is excluded',()=>{
 const end=camera.position.map((v,i)=>v+(camera.approach[i]-v)*.1);
 assert.deepEqual(match(routeFor([camera.approach,end],camera.ref)),[]);
});
