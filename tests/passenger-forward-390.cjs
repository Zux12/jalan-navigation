'use strict';
const assert=require('node:assert/strict');
module.exports=async function forwardMotion(page,base){
 await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
 const result=await page.evaluate(async()=>{
   const a=[3.139,101.687],corner=[a[0],a[1]+.00012],b=[a[0]+.00012,corner[1]],end=[a[0]+.001,corner[1]];
   const marker=name=>Object.values(map._layers).find(l=>l.options?.icon?.options.className===name);
   const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
   async function sample(name,endpoint){
     const frames=[],started=performance.now();
     do{
       await new Promise(requestAnimationFrame);
       const p=marker(name).getLatLng(),center=map.getCenter();
       const trail=Object.values(map._layers).filter(l=>l.options.className==='jalan-travelled-route').at(-1);
       const tip=trail?.getLatLngs().at(-1);
       frames.push([p.lat,p.lng,center.lat,center.lng,tip?.lat,tip?.lng]);
       if(p.lat===endpoint[0]&&p.lng===endpoint[1])break;
     }while(performance.now()-started<3500);
     return frames;
   }
   let at=Date.now();
   // Use street zoom so a 13 m drive spans multiple physical map pixels.
   map.setView(a,17,{animate:false});
   emit('jalan:initial-location',{point:a,accuracy:5,timestamp:at-1000});
   emit('jalan:free-location',{point:corner,accuracy:5,timestamp:at,heading:90,speed:13});
   const free=await sample('passenger-startup-pin',corner);
   emit('jalan:free-location',{point:[4.5,103.2],accuracy:6,timestamp:at+1000,heading:90,speed:13});
   const afterSpike=marker('passenger-startup-pin').getLatLng();
   $('tt-primary').checked=false;setStart(a,'Start');destination=end;
   routes=[{provider:'osrm',duration:120,distance:130,legs:[],geometry:{type:'LineString',coordinates:[a,corner,b,end].map(([lat,lon])=>[lon,lat])}}];
   selectedRoute=0;renderRoutes();$('passenger-go').click();
   let fixes=0;const count=()=>fixes++;window.addEventListener('jalan:gps-fix',count);
   at=Date.now();
   const fix=(p,heading,time)=>window.__offlineGPSWatch({timestamp:time,coords:{latitude:p[0],longitude:p[1],accuracy:5,speed:17,heading}});
   fix(a,90,at-1000);fix(b,0,at);
   const measured=JalanGPS.getState().gpsPosition;
   const guided=await sample('jalan-vehicle-marker',b);
   window.removeEventListener('jalan:gps-fix',count);
   const tip=()=>Object.values(map._layers).filter(l=>l.options.className==='jalan-travelled-route').at(-1)?.getLatLngs().at(-1);
   const before=tip();
   window.__offlineGPSWatch({timestamp:at+1,coords:{latitude:end[0],longitude:end[1],accuracy:150,speed:17}});
   await new Promise(requestAnimationFrame);
   const held=before?.equals(tip(),1e-12);
   return {a,corner,b,free,guided,measured,fixes,held,afterSpike:[afterSpike.lat,afterSpike.lng]};
 });
 const {a,corner,b,free,guided}=result;
 assert.deepEqual(result.afterSpike,corner);assert.deepEqual(result.measured,b);assert.equal(result.fixes,2);
 assert.ok(new Set(free.filter(p=>p[1]>a[1]&&p[1]<corner[1]).map(p=>p[1])).size>=3,'free driving renders intermediate positions');
 assert.ok(new Set(free.map(p=>p[3])).size>=3,'the free camera follows the moving marker between fixes');
 assert.ok(guided.some(p=>Math.abs(p[0]-a[0])<1e-9&&p[1]>a[1]&&p[1]<corner[1]),'drive the first side of the bend');
 assert.ok(guided.some(p=>Math.abs(p[1]-corner[1])<1e-9&&p[0]>a[0]&&p[0]<b[0]),'turn on the road before the second fix');
 assert.ok(new Set(guided.map(p=>p[2]+','+p[3])).size>=3,'guided follow camera advances on multiple frames');
 assert.deepEqual(guided.at(-1).slice(0,2),b);
 const advancing=guided.filter(p=>p[0]!==a[0]||p[1]!==a[1]);
 assert.ok(new Set(advancing.map(p=>p.slice(4).join(','))).size>=3,'the grey edge advances between GPS readings');
 for(const [lat,lon,,,tipLat,tipLon] of advancing){
   assert.ok(Number.isFinite(tipLat)&&Math.hypot(lat-tipLat,lon-tipLon)<1e-9,'the grey edge follows the triangle around the bend');
 }
 assert.ok(result.held,'an inaccurate reading leaves the travelled edge in place');
 await page.evaluate(()=>JalanGPS.stop());
 console.log('PASS continuous free and guided movement between real GPS callbacks, bend, isolated spike and endpoint');
};
