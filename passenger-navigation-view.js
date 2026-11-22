/* Navigation camera preferences: percentage controls over the close-up view range. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.JalanNavigationView=factory();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const defaults=Object.freeze({zoom:80,tilt:100});
 const percent=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):fallback;
 const sanitize=value=>({zoom:percent(value?.zoom,defaults.zoom),tilt:percent(value?.tilt,defaults.tilt)});
 const zoomLevel=value=>14+percent(value,defaults.zoom)*.06;
 const pitch=value=>percent(value,defaults.tilt)*.6;
 function anchor({height,barTop,vehicleSize=84,gap=12}){
  const y=Math.max(vehicleSize/2,Math.min(height-vehicleSize/2,barTop-vehicleSize/2-gap)),shift=2*y-height;
  return {y,padding:{top:Math.max(0,shift),bottom:Math.max(0,-shift),left:0,right:0}};
 }
 function rasterOffset({height,y,angle,tilt}){
  const flat=tilt===0,r=Math.PI/180,p=(flat?0:17*tilt/100)*r,dy=y-height/2;
  // Invert the existing CSS perspective/rotation rather than draw a fake fixed vehicle.
  const distance=dy/(Math.cos(p)+dy*Math.sin(p)/1200)/(flat?1:1.35);
  return {x:distance*Math.sin(angle*r),y:distance*Math.cos(angle*r)};
 }
 // A critically damped turn keeps its angular velocity when a new GPS fix
 // arrives. Integrate elapsed time so 30, 60 and 120 Hz displays turn alike.
 function bearingFollower(paint,clock=window){
  let bearing=0,target=0,velocity=0,rate=10,frame=null,lastTime=0;
  const difference=(from,to)=>((to-from)%360+540)%360-180;
  function reset(angle=bearing){
   if(frame!==null)clock.cancelAnimationFrame(frame);
   frame=null;bearing=target=angle;velocity=0;
  }
  function tick(now){
   const dt=Math.max(0,Math.min((now-lastTime)/1000,.1));
   lastTime=now;
   const error=bearing-target,decay=Math.exp(-rate*dt),slope=velocity+rate*error;
   bearing=target+(error+slope*dt)*decay;
   velocity=(velocity-rate*slope*dt)*decay;
   if(error*(bearing-target)<=0||(Math.abs(bearing-target)<.05&&Math.abs(velocity)<.6)){
    bearing=target;velocity=0;frame=null;
   }else frame=clock.requestAnimationFrame(tick);
   paint(bearing);
  }
  function aim(angle){
   if(!Number.isFinite(angle)||Math.abs(difference(target,angle))<1.5)return;
   const arc=difference(bearing,angle);
   target=angle+360*Math.round((bearing+arc-angle)/360);
   rate=8+Math.min(6,Math.abs(arc)/12);
   if(frame===null){lastTime=clock.performance.now();frame=clock.requestAnimationFrame(tick);}
  }
  return {aim,reset,get bearing(){return bearing;}};
 }
 return {defaults,sanitize,zoomLevel,pitch,anchor,rasterOffset,bearingFollower};
});
