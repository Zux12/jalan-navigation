'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),vm=require('node:vm');
const ctx={window:{}};vm.runInNewContext(readFileSync(__dirname+'/../passenger-route-display.js','utf8'),ctx);
const {shape,spans,roadWidth}=ctx.window.JalanRouteDisplay;
const coords=[[101,3],[101.001,3],[101.002,3.0006],[101.003,3.002]];
const route=steps=>({geometry:{coordinates:coords},legs:[{steps}]});
test('gentle bends curve locally, preserve endpoints and share colour boundaries',()=>{
 const path=shape(route([]));assert.ok(path.points.length>coords.length);
 assert.deepEqual(path.points[0],coords[0]);assert.deepEqual(path.points.at(-1),coords.at(-1));
 const at=path.total*.35;
 assert.deepEqual(spans(path,0,at)[0].coordinates.at(-1),spans(path,at)[0].coordinates[0]);
 assert.ok(shape(route([{pointIndex:1}])).points.includes(coords[1]));
});
test('crossing roads are excluded and parallel candidates of different widths can be ambiguous',()=>{
 const a=[0,0],b=[.001,0];
 const road=(coords,w)=>({geometry:{type:'LineString',coordinates:coords},layer:{paint:{'line-width':w}}});
 const crossing=road([[.0005,-.001],[.0005,.001]],30);
 assert.equal(roadWidth(a,b,[crossing,road([a,b],7)]),7);
 assert.equal(roadWidth(a,b,[road([a,b],7),road([[0,.00001],[.001,.00001]],28)]),0);
});
