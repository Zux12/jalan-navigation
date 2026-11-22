// Keep an independently usable onward route at each stop. The same itinerary is
// used for the initial choice, GPS rerouting, toll changes and missed stops.
(() => {
 'use strict';
 function stops(route){
   const list=[];
   for(let stop=route?.pinnedStop;stop;stop=stop.onward?.pinnedStop){
     list.push({kind:stop.kind||'regular',point:stop.point,name:stop.name||'',station:stop.station});
   }
   return list;
 }
 const managed=route=>route?.stationItinerary?stops(route):undefined;
 const signature=route=>JSON.stringify(stops(route).map(s=>[s.kind,...s.point]));
 function order(route,added,stationFirst){
   const other=stops(route).find(s=>s.kind!==added.kind);
   if(!other)return [added];
   return (stationFirst===(added.kind==='station'))?[added,other]:[other,added];
 }
 const shift=(value,by)=>Number.isFinite(value)?value+by:value;
 function join(first,next,stop,policy){
   const a=first.geometry.coordinates,b=next.geometry.coordinates,last=a.at(-1),head=b[0];
   // Independently snapped legs must share a drivable access point.
   if(Math.hypot((last[0]-head[0])*Math.cos(last[1]*Math.PI/180),last[1]-head[1])*111320>2)return null;
   const index=a.length-1,length=first.distance;
   const moveRoad=road=>({...road,routeOffsetInMeters:shift(road.routeOffsetInMeters,length)});
   const moveStep=step=>({...moveRoad(step),pointIndex:shift(step.pointIndex,index)});
   const incoming=(first.legs||[]).map(leg=>({...leg,steps:(leg.steps||[]).filter(s=>!/^arriv/i.test(s.maneuver?.type))}));
   const onward=(next.legs||[]).map(leg=>({...leg,steps:(leg.steps||[]).filter(s=>!/^depart$/i.test(s.maneuver?.type)).map(moveStep)}));
   return {...first,stationItinerary:true,tollPolicy:policy,
     distance:length+next.distance,duration:first.duration+next.duration,delay:(first.delay||0)+(next.delay||0),
     knownTrafficDelay:Number.isFinite(first.knownTrafficDelay)&&Number.isFinite(next.knownTrafficDelay)?first.knownTrafficDelay+next.knownTrafficDelay:null,
     tolls:first.tolls===true||next.tolls===true?true:first.tolls===false&&next.tolls===false?false:null,
     geometry:{type:'LineString',coordinates:a.concat(b.slice(1))},legs:incoming.concat(onward),
     speedLimits:[...(first.speedLimits||[]),...(next.speedLimits||[]).map(s=>({...s,start:s.start+index,end:s.end+index}))],
     trafficSections:Array.isArray(first.trafficSections)&&Array.isArray(next.trafficSections)?
       first.trafficSections.concat(next.trafficSections.map(s=>({...s,startPointIndex:s.startPointIndex+index,endPointIndex:s.endPointIndex+index}))):null,
     roadGuidance:[...(first.roadGuidance||[]).filter(s=>!/^arriv/i.test(s.maneuver)),...(next.roadGuidance||[]).filter(s=>!/^depart$/i.test(s.maneuver)).map(moveRoad)],
     pinnedStop:{...stop,index,access:[last[1],last[0]],inboundTolls:first.tolls,onward:next}};
 }
 async function plan(from,to,list,{signal,tollPolicy},request){
   const points=[from,...list.map(s=>s.point),to];
   const groups=await Promise.all(points.slice(1).map(async(target,i)=>{
     const key=list[i]?.kind||'destination',allow=tollPolicy?.legs?.[key]===true;
     try{
       const found=await request(points[i],target,{signal,tollPolicy:tollPolicy?(allow?{onward:true}:{}):undefined});
       const usable=found.filter(r=>r?.geometry?.coordinates?.length>=2&&r.distance>0&&r.duration>0);
       if(!usable.length)throw Error('No driving route');
       return usable.sort((a,b)=>a.duration-b.duration).slice(0,3);
     }catch(error){if(error.tollConflict)error.stationTollLeg=key;throw error;}
   }));
   let results=groups.at(-1).map(r=>({...r,tollPolicy:tollPolicy?(tollPolicy.legs?.destination?{onward:true}:{}):undefined}));
   for(let i=list.length-1;i>=0;i--){
     results=groups[i].flatMap(first=>results.map(next=>join(first,next,list[i],tollPolicy))).filter(Boolean);
   }
   const seen=new Set(),choices=[];
   for(const route of results.sort((a,b)=>a.duration-b.duration)){
     const key=JSON.stringify(route.geometry.coordinates);
     if(!seen.has(key)){choices.push(route);seen.add(key);}
     if(choices.length===3)break;
   }
   if(!choices.length)throw Error('No connected station route');
   return choices;
 }
 const api={stops,managed,signature,order,plan};
 if(typeof module==='object'&&module.exports)module.exports=api;else window.JalanStationRoute=api;
})();
