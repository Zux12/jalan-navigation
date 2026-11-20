// Translate the provider's waypoint into an exact boundary on its route geometry.
(() => {
 'use strict';
 const meters=(a,b)=>Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*Math.cos((a[0]+b[0])*Math.PI/360));
 function attach(route,point,index,onward){
   const coords=route.geometry.coordinates;
   if(index<1||index>=coords.length-1||!(onward.distance>0)||!onward.geometry.coordinates.length)
     throw Error('No driving route through this stop.');
   const [lon,lat]=coords[index];
   route.pinnedStop={point:[...point],access:[lat,lon],index,onward};
   return route;
 }
 function tomtom(raw,point,normalize){
   const [first,last]=raw.legs||[];
   if(raw.legs?.length!==2||!first.points?.length||!last.points?.length)throw Error('Stop missing from route.');
   const split=first.points.length-1,offset=first.summary.lengthInMeters;
   // Some route geometries list the shared stop in both legs. Use the
   // provider's travel-mode end index to retain its exact numbering.
   const lastIndex=first.points.length+last.points.length-1;
   const sameStop=first.points[split].latitude===last.points[0].latitude&&
     first.points[split].longitude===last.points[0].longitude;
   const sectionEnd=(raw.sections||[]).reduce((end,s)=>s.sectionType==='TRAVEL_MODE'&&
     Number.isInteger(s.endPointIndex)?Math.max(end,s.endPointIndex):end,-1);
   const mergedBoundary=sameStop&&sectionEnd===lastIndex-1;
   const whole=mergedBoundary?{...raw,legs:[first,{...last,points:last.points.slice(1)}]}:raw;
   const secondStart=sameStop&&sectionEnd===lastIndex?split+1:split;
   const instructions=(raw.guidance?.instructions||[]).filter(i=>i.routeOffsetInMeters>=offset)
     .map(i=>({...i,routeOffsetInMeters:i.routeOffsetInMeters-offset,pointIndex:undefined}));
   const sections=(raw.sections||[]).filter(s=>s.endPointIndex>split)
     .map(s=>({...s,startPointIndex:Math.max(0,s.startPointIndex-secondStart),endPointIndex:Math.min(last.points.length-1,s.endPointIndex-secondStart)}));
   const onward=normalize({summary:last.summary,legs:[last],guidance:{instructions},sections});
   return attach(normalize(whole),point,split,onward);
 }
 function osrm(route,point,waypoint){
   if(route.legs?.length!==2||!waypoint)throw Error('Stop missing from route.');
   const [first,last]=route.legs,c=route.geometry.coordinates;
   let index=-1,best=Infinity,along=0;
   for(let i=1;i<c.length-1;i++){
     along+=meters([c[i-1][1],c[i-1][0]],[c[i][1],c[i][0]]);
     const score=meters([c[i][1],c[i][0]],[waypoint[1],waypoint[0]])+Math.abs(along-first.distance)*0.001;
     if(score<best){best=score;index=i;}
   }
   const onward={...route,duration:last.duration,distance:last.distance,legs:[last],
     geometry:{type:'LineString',coordinates:c.slice(index)}};
   return attach(route,point,index,onward);
 }
 // Require several reliable observations. A road beside the stop may pass the
 // pin without the vehicle ever reaching the exact picked coordinates.
 function observe(state,fix,stop,at){
   if(!fix.gpsReliable||!(fix.gpsAccuracy<=35)||!(fix.gpsFixAgeMs<=10000)||!fix.gpsPosition)return;
   if(state.at&&at<=state.at)return;
   if(!state.at||at-state.at>12000)Object.assign(state,{last:Infinity,best:Infinity,away:0,slowSince:null,previous:null});
   const distance=Math.min(meters(fix.gpsPosition,stop.point),meters(fix.gpsPosition,stop.access));
   const previous=state.previous,dt=(at-state.at)/1000;
   const speed=Number.isFinite(fix.speedMps)&&fix.speedMps>=0?fix.speedMps:
     previous&&dt>0?meters(fix.gpsPosition,previous)/dt:Infinity;
   state.previous=fix.gpsPosition;state.at=at;
   if(distance<=30&&speed<=1.7){
     state.slowSince??=at;
     if(at-state.slowSince>=5000)return 'arrived';
   }else state.slowSince=null;
   if(distance>state.last+3&&speed>1.7)state.away++;
   else if(distance<state.last-3)state.away=0;
   state.last=distance;state.best=Math.min(distance,state.best);
   if(state.best<=40&&state.away>=2&&distance>=Math.max(55,state.best+30))return 'passed';
 }
 const api={meters,tomtom,osrm,observe};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else window.JalanPinnedRoute=api;
})();
