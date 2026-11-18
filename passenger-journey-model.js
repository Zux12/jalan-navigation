/* Pure display calculations. No routing requests, map mutation or storage. */
(function(root){
 'use strict';
 const clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,180):'';
 function longestRoad(route){
  const totals=new Map();
  function add(name,distance){
   name=clean(name);
   if(!name||/^(unnamed road|road)$/i.test(name)||!Number.isFinite(distance)||distance<=0)return;
   const key=name.toLocaleLowerCase('en');
   const previous=totals.get(key)||{name,distance:0};
   previous.distance+=distance;totals.set(key,previous);
  }
  if(route?.provider==='tomtom'){
   // Keep all provider road boundaries, even beyond the 120 spoken-step limit.
   const steps=route.roadGuidance||(route.legs||[]).flatMap(leg=>leg.steps||[]);
   for(let i=0;i<steps.length;i++){
    const step=steps[i],from=step.routeOffsetInMeters;
    const to=i+1<steps.length?steps[i+1].routeOffsetInMeters:route.distance;
    if(!Number.isFinite(from)||from<0||!Number.isFinite(to)||to>route.distance||to<=from||
       /arriv|destination_reached/i.test(step.maneuver?.type||step.maneuver||''))continue;
    add(clean(step.street)||step.roadNumbers?.[0],to-from);
   }
  }else{
   for(const leg of route?.legs||[])for(const step of leg.steps||[]){
    if(step.maneuver?.type!=='arrive')add(clean(step.name)||step.ref,step.distance);
   }
  }
  return [...totals.values()].sort((a,b)=>b.distance-a.distance)[0]?.name||null;
 }
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
 const api={longestRoad,remainingSegments};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.JalanJourneyModel=api;
})(typeof window==='object'?window:globalThis);
