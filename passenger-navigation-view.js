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
 // The display runs up to one GPS interval behind the measurements. Regular
 // fixes sustain a glide. If they stop, the last stretch coasts to its endpoint.
 function positionFollower(paint,clock=window){
  let shown=null,target=null,frame=null,time=null,from=null,began=0,duration=0;
  function cancel(){
   if(frame!==null)clock.cancelAnimationFrame(frame);
   frame=null;
  }
  function reset(){cancel();shown=target=from=null;time=null;}
  function pause(){cancel();target=shown;}
  const gap=(a,b)=>Math.hypot(a[0]-b[0],(a[1]-b[1])*Math.cos((a[0]+b[0])*Math.PI/360))*111320;
  function tick(now){
   const t=Math.min(1,Math.max(0,(now-began)/duration)),tail=.12;
   // Constant speed for most of an interval with a short deceleration tail.
   const u=t<1-tail?t/(1-tail/2):1-(1-t)**2/(2*tail*(1-tail/2));
   if(t===1)shown=target;
   else if(from.path&&from.path===target.path){
    const offset=from.offset+(target.offset-from.offset)*u;
    shown={point:from.path.at(offset),path:from.path,offset};
   }else shown={point:from.point.map((v,i)=>v+(target.point[i]-v)*u)};
   frame=t<1?clock.requestAnimationFrame(tick):null;
   paint(shown.point,t===1,shown.path,shown.offset);
  }
  function feed(point,stamp,speed,accuracy,path=null,offset=null){
   if(!Number.isFinite(stamp)||time!==null&&stamp<time)return;
   const interval=time===null?0:stamp-time;
   time=stamp;
   let next={point,path,offset};
   if(path&&Number.isFinite(offset))next.point=path.at(offset);
   else next.path=null;
   const distance=target?gap(target.point,next.point):Infinity;
   // Hold a stationary fix against small GPS fluctuations. An unknown speed
   // still permits travel once cumulative displacement exceeds that noise.
   const still=Number.isFinite(speed)&&speed>=0&&speed<.6;
   const deadband=still?Math.min(10,Math.max(2,accuracy*.7)):
     speed==null?Math.min(4,Math.max(1,accuracy*.25)):.04;
   if(target&&target.path===next.path&&distance<deadband)return;
   cancel();
   if(!shown||interval>15000||gap(shown.point,next.point)>Math.max(100,Math.min(interval,15000)*.07)){
    shown=target=next;paint(shown.point,true,shown.path,shown.offset);return;
   }
   from=shown;target=next;
   if(from.path&&from.path===next.path&&Math.abs(from.offset-next.offset)>Math.max(40,2.5*gap(from.point,next.point))){
    // A new match on a different pass of a loop must not tour the entire loop.
    from={point:shown.point};
   }
   began=clock.performance.now();
   // Leave a short buffer beyond the expected next fix. At a steady GPS
   // cadence the next segment starts while this one is still at cruising speed.
   duration=Math.max(200,Math.min(still?600:4500,(interval||600)*1.16));
   frame=clock.requestAnimationFrame(tick);
  }
  return {feed,pause,reset,get point(){return shown?.point;}};
 }
 return {defaults,sanitize,zoomLevel,pitch,anchor,rasterOffset,bearingFollower,positionFollower};
});
