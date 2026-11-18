/* Jalan V4.3 route-locked predictive map matching. Browser GPS test only. */
(() => {
 'use strict';
 const R=6371000,rad=d=>d*Math.PI/180;
 const dist=(a,b)=>{const x=rad(b[0]-a[0]),y=rad(b[1]-a[1]);return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(y/2)**2)));};
 const interpolate=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 function create(coordinates){
  let pts=coordinates.map(p=>[p[1],p[0]]),cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+dist(pts[i-1],pts[i]));
  const total=cum[cum.length-1]||0;
  function at(s){s=Math.max(0,Math.min(total,s));let i=1;while(i<cum.length-1&&cum[i]<s)i++;let len=cum[i]-cum[i-1]||1;return interpolate(pts[i-1],pts[i],(s-cum[i-1])/len);}
  function snap(p,near=null){let best={distance:Infinity,along:0,position:pts[0]};for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i],sx=111320*Math.cos(rad(p[0])),sy=111320,ax=(a[1]-p[1])*sx,ay=(a[0]-p[0])*sy,dx=(b[1]-a[1])*sx,dy=(b[0]-a[0])*sy,den=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den));
   const along=cum[i-1]+t*(cum[i]-cum[i-1]),d=Math.hypot(ax+t*dx,ay+t*dy);
   // Favor continuity when parallel route segments are close together.
   const score=d+(near===null?0:Math.min(160,Math.abs(along-near)*0.18));
   if(score<(best.score??Infinity))best={distance:d,along,position:interpolate(a,b,t),score,
    bearing:(Math.atan2(dx,dy)*180/Math.PI+360)%360};
  }return best;}
  let lastTime=null,lastGood=null,along=0,velocity=0,offCount=0,offSince=null,lastMode='waiting',initialOff=null;
  function feed(fix){const time=Number(fix.time),raw=fix.position,acc=Number(fix.accuracy),speed=Number.isFinite(fix.speed)&&fix.speed>=0?Math.min(fix.speed,45):null;
   if(!Number.isFinite(time)||!raw||!raw.every(Number.isFinite))return {mode:'invalid',position:at(along),along,offCount};
   let dt=lastTime===null?0:Math.max(0,Math.min(30,(time-lastTime)/1000));if(lastTime!==null&&time<=lastTime)return {mode:'stale',position:at(along),along,offCount};lastTime=time;
   // Predict only for a short period. Never pretend the route position is precise.
   const advance=Math.min(dt,12)*Math.min(velocity,38);const predicted=Math.min(total,along+advance);
   if(!Number.isFinite(acc)||acc>65){along=predicted;lastMode='uncertain';offCount=0;offSince=null;initialOff=null;return {mode:'uncertain',position:at(along),along,offCount,confidence:'low'};}
   const match=snap(raw,predicted);const threshold=Math.max(45,acc*2.2);
   if(lastGood===null){if(match.distance<=threshold){along=match.along;lastGood={time,position:raw};velocity=speed??0;offCount=0;offSince=null;initialOff=null;lastMode='matched';return {mode:'matched',position:at(along),along,offCount:0,confidence:'high'};}
    // A journey can acquire its first accurate GPS only after the user has
    // already left the planned road. Require sustained, mutually plausible
    // readings rather than waiting forever for a match to that old route.
    const gap=initialOff?Math.max(.2,(time-initialOff.time)/1000):0;
    const plausible=initialOff&&dist(initialOff.position,raw)<=Math.max(40,((speed??0)+12)*gap+acc*2);
    if(!plausible){offCount=1;offSince=time;}else offCount++;
    initialOff={time,position:[...raw]};
    const confirmed=offCount>=4&&time-offSince>=8000;
    return {mode:confirmed?'deviation':'waiting',position:at(along),along,offCount,
      confidence:'low',raw:confirmed?raw:null,offset:Math.round(match.distance)};}

   const gap=Math.max(0.2,(time-lastGood.time)/1000),jump=dist(lastGood.position,raw),maxTravel=Math.max(40,(Math.max(velocity,speed??0)+12)*gap+acc*2);
   const plausible=jump<=maxTravel;
   if(match.distance<=threshold&&plausible){const prev=along;along=Math.max(along,Math.min(match.along,predicted+Math.max(35,acc*2,dt*12)));velocity=speed??Math.min(38,Math.max(0,(along-prev)/Math.max(dt,0.5)));lastGood={time,position:raw};offCount=0;offSince=null;lastMode='matched';return {mode:'matched',position:at(along),along,offCount:0,confidence:'high'};}
   // A single implausible jump never moves the map marker or triggers rerouting.
   along=predicted;
   if(plausible&&match.distance>threshold){offCount++;offSince??=time;}else{offCount=0;offSince=null;}
   const confirmed=offCount>=4&&offSince!==null&&time-offSince>=8000;
   lastMode=confirmed?'deviation':'predicted';
   return {mode:lastMode,position:at(along),along,offCount,confidence:'low',raw:confirmed?raw:null,offset:Math.round(match.distance)};
  }
  return {feed,at,snap,get total(){return total;}};
 }
 // Display matching is separate from measured GPS and navigation progress.
 // A nearby dot is not proof that a moving car changed roads.
 function createRoadMotion(coordinates){
  const route=create(coordinates),routePoints=coordinates.map(p=>[p[1],p[0]]);
  let lastRoad=null,pending=null,departed=false,departureLine=null;
  const difference=(a,b)=>Math.abs(((a-b+540)%360)-180);
  const bearing=(a,b)=>{const p=rad(a[0]),q=rad(b[0]),d=rad(b[1]-a[1]);
   return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))*180/Math.PI+360)%360;};
  function nearest(point,coords){
   const sx=111320*Math.cos(rad(point[0])),sy=111320;
   let best={distance:Infinity};
   for(let i=1;i<coords.length;i++){
    const a=coords[i-1],b=coords[i],dx=(b[1]-a[1])*sx,dy=(b[0]-a[0])*sy,
     ax=(a[1]-point[1])*sx,ay=(a[0]-point[0])*sy,
     t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(ax+t*dx,ay+t*dy);
    if(distance<best.distance)best={distance,position:interpolate(a,b,t),bearing:bearing(a,b)};
   }return best;
  }
  function connected(line,anchor,reach){
   // Only test nearby route segments; rendered roads cannot establish grade
   // connectivity at a bridge/tunnel, so those candidates are excluded below.
   for(let i=1;i<routePoints.length;i++){
    const a=routePoints[i-1],b=routePoints[i];
    if(nearest(anchor,[a,b]).distance>reach)continue;
    if((dist(a,anchor)<=reach&&nearest(a,line).distance<=8)||
       (dist(b,anchor)<=reach&&nearest(b,line).distance<=8))return true;
    // A junction can be in the middle of long provider/tile segments.
    for(let j=1;j<line.length;j++){
     const c=line[j-1],d=line[j],x=b[1]-a[1],y=b[0]-a[0],u=d[1]-c[1],v=d[0]-c[0],den=x*v-y*u;
     if(Math.abs(den)<1e-14)continue;
     const t=((c[1]-a[1])*v-(c[0]-a[0])*u)/den,
      s=((c[1]-a[1])*y-(c[0]-a[0])*x)/den;
     if(t>=0&&t<=1&&s>=0&&s<=1&&dist(interpolate(a,b,t),anchor)<=reach)return true;
    }
   }return false;
  }
  function feed({position:raw,time,accuracy,speed,heading,roads=null}){
   const match=route.snap(raw,lastRoad?.along??null),moving=Number.isFinite(speed)&&speed>=1,
    course=moving&&Number.isFinite(heading)&&heading>=0&&heading<360?heading:null,
    band=Math.max(12,Math.min(24,accuracy*1.25)),
    diverging=course!==null&&difference(course,match.bearing)>45&&match.distance>Math.max(5,accuracy*.5);
   if(match.distance<=band&&!diverging){
    lastRoad={position:match.position,along:match.along,time,heading:match.bearing};pending=null;departed=false;departureLine=null;
    return {position:match.position,heading:match.bearing,onRoute:true,certain:true,allowDeviation:false,mode:'road-aligned'};
   }
   if(departed&&roads===null)
    return {position:raw,onRoute:false,certain:false,allowDeviation:true,mode:'departure-unverified'};
   if(departed&&departureLine){
    const previousRoad=nearest(raw,departureLine);
    if(previousRoad.distance<=Math.max(12,Math.min(25,accuracy*1.5)))
     return {position:previousRoad.position,onRoute:false,certain:true,allowDeviation:true,mode:'road-departure'};
   }
   const held=match.distance<=80?match.position:(lastRoad?.position||raw);
   if(!pending||time-pending.lastTime>7000){pending={first:[...raw],firstTime:time,lastTime:time,count:1};}
   else{pending.count++;pending.lastTime=time;}
   const elapsed=(time-pending.firstTime)/1000,travel=dist(pending.first,raw),
    pathHeading=travel>=Math.max(8,accuracy)?bearing(pending.first,raw):null,
    coherent=pathHeading!==null&&(course===null||difference(course,pathHeading)<=45),
    turnTime=lastRoad?Math.max(1,Math.min(6,(pending.firstTime-lastRoad.time)/1000)+1):6,
    turnCourse=course??pathHeading,
    velocity=Number.isFinite(speed)&&speed>=0?speed:(elapsed>0?travel/elapsed:0),
    turnRate=lastRoad&&turnCourse!==null?velocity*rad(difference(turnCourse,lastRoad.heading))/turnTime:0,
    possibleTurn=turnRate<=5; // Conservative lateral-acceleration screen, not vehicle physics proof.
   let supported=null;
   const elevatedBaseline=lastRoad&&Array.isArray(roads)&&roads.some(road=>{
    if(!road.bridge&&!road.tunnel&&Number(road.layer||0)===0)return false;
    const line=road.coordinates?.map(p=>[p[1],p[0]]);if(!line||line.length<2)return false;
    const near=nearest(lastRoad.position,line),angle=difference(lastRoad.heading,near.bearing);
    return near.distance<=12&&Math.min(angle,180-angle)<=25;
   });
   if(Array.isArray(roads)&&coherent&&possibleTurn&&!elevatedBaseline){
    for(const road of roads){
     if(road.bridge||road.tunnel||Number(road.layer||0)!==0)continue;
     const line=road.coordinates?.map(p=>[p[1],p[0]]);
     if(!line||line.length<2)continue;
     const candidate=nearest(raw,line),angle=difference(pathHeading,candidate.bearing),aligned=Math.min(angle,180-angle)<=35;
     if(candidate.distance>Math.max(12,Math.min(25,accuracy*1.5))||!aligned)continue;
     const anchor=lastRoad?.position||match.position,reach=Math.max(35,Math.min(150,Math.max(0,speed||0)*turnTime+accuracy*2));
     if(!connected(line,anchor,reach))continue;
     if(!supported||candidate.distance<supported.distance)supported={...candidate,line};
    }
   }
   if(supported&&pending.count>=3&&elapsed>=2){departed=true;departureLine=supported.line;
    return {position:supported.position,onRoute:false,certain:true,allowDeviation:true,mode:'road-departure'};}
   // Raster/offline maps may have no road geometry. Require longer coherent
   // motion, keep the display explicitly unverified, and still permit recovery.
   if(roads===null&&coherent&&possibleTurn&&pending.count>=4&&elapsed>=8){departed=true;
    return {position:raw,onRoute:false,certain:false,allowDeviation:true,mode:'departure-unverified'};}
   if(departed&&coherent&&possibleTurn&&roads===null)
    return {position:raw,onRoute:false,certain:false,allowDeviation:true,mode:'departure-unverified'};
   return {position:held,heading:lastRoad?.heading,onRoute:false,certain:false,allowDeviation:false,mode:'checking-drift'};
  }
  return {feed};
 }
 window.JalanPredictiveGPS={create,createRoadMotion,runTests(){
  const line=[[101.6000,3.0000],[101.6100,3.0000]];
  function f(m,p,t,acc=8,speed=15){return m.feed({position:p,time:t,accuracy:acc,speed});}
  const a=create(line);f(a,[3,101.6000],1000);const jump=f(a,[3.003,101.605],2000);const recovered=f(a,[3,101.6005],4000);
  const b=create(line);f(b,[3,101.6000],1000);const bad=f(b,[3.003,101.605],3000,120);const held=f(b,[3,101.6005],5000);
  const c=create(line);f(c,[3,101.6000],1000);let deviation;for(let i=1;i<=6;i++)deviation=f(c,[3.0008,101.6000+0.0001*i],1000+3000*i,8,5);
  const results=[['Single GPS jump ignored',jump.mode!=='deviation'&&jump.position[0]===3],['Recovery after jump',recovered.mode==='matched'],['Poor accuracy held',bad.mode==='uncertain'&&held.mode==='matched'],['Sustained deviation confirmed',deviation.mode==='deviation']];return results;
 }};
})();
