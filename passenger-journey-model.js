/* Pure display calculations. No routing requests, map mutation or storage. */
(function(root){
 'use strict';
 const clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,180):'';
 function roadSpans(route){
  const spans=[];
  function add(name,start,end){
   name=clean(name);
   if(!name||/^(unnamed road|road)$/i.test(name))return;
   const key=name.toLocaleLowerCase('en'),previous=spans.at(-1);
   if(previous?.key===key&&previous.end===start)previous.end=end;
   else spans.push({key,name,start,end});
  }
  if(route?.provider==='tomtom'){
   const steps=route.roadGuidance||(route.legs||[]).flatMap(leg=>leg.steps||[]);
   for(let i=0;i<steps.length;i++){
    const step=steps[i],from=step.routeOffsetInMeters;
    const to=i+1<steps.length?steps[i+1].routeOffsetInMeters:route.distance;
    if(!Number.isFinite(from)||from<0||!Number.isFinite(to)||to>route.distance||to<=from||
       /arriv|destination_reached/i.test(step.maneuver?.type||step.maneuver||''))continue;
    add(clean(step.street)||step.roadNumbers?.[0],from,to);
   }
  }else{
   let offset=0;
   for(const leg of route?.legs||[])for(const step of leg.steps||[]){
    if(!Number.isFinite(step.distance)||step.distance<=0)continue;
    const end=offset+step.distance;
    if(step.maneuver?.type!=='arrive')add(clean(step.name)||step.ref,offset,end);
    offset=end;
   }
  }
  return spans;
 }
 function nextVia(spans,progress){
  const candidates=new Map();
  for(const span of spans){
   if(span.end<=progress)continue;
   let candidate=candidates.get(span.key);
   if(!candidate){
    // Hold through the first remaining continuous stretch of this road.
    candidate={name:span.name,exit:span.end,distance:0};
    candidates.set(span.key,candidate);
   }
   candidate.distance+=span.end-Math.max(span.start,progress);
  }
  let best=null;
  for(const candidate of candidates.values()){
   if(!best||candidate.distance>best.distance)best=candidate;
  }
  return best;
 }
 function createViaTracker(route){
  const spans=roadSpans(route);
  let choice=nextVia(spans,0);
  return function viaAt(progress){
   if(choice&&Number.isFinite(progress)&&progress>=choice.exit)choice=nextVia(spans,progress);
   return choice?.name||null;
  };
 }
 function longestRoad(route){return createViaTracker(route)(0);}
 function remainingSegments(snapshot,progress=0){
  const total=snapshot?.total;
  if(!Number.isFinite(total)||total<=0)return [];
  const start=Math.max(0,Math.min(total,Number.isFinite(progress)?progress:0)),left=total-start;
  if(left<=0)return [];
  return (snapshot.segments||[]).flatMap(segment=>{
   if(!['light','moderate','heavy','closed'].includes(segment.type)||
      !Number.isFinite(segment.start)||!Number.isFinite(segment.end))return [];
   const a=Math.max(start,segment.start),b=Math.min(total,segment.end);
   return b>a?[{type:segment.type,left:(a-start)/left*100,width:(b-a)/left*100,
     from:a-start,to:b-start}]:[];
  });
 }
 const api={longestRoad,createViaTracker,remainingSegments};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.JalanJourneyModel=api;
})(typeof window==='object'?window:globalThis);
