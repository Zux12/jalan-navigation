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
   if(score<(best.score??Infinity))best={distance:d,along,position:interpolate(a,b,t),score};
  }return best;}
  let lastTime=null,lastGood=null,along=0,velocity=0,offCount=0,offSince=null,lastMode='waiting';
  function feed(fix){const time=Number(fix.time),raw=fix.position,acc=Number(fix.accuracy),speed=Number.isFinite(fix.speed)&&fix.speed>=0?Math.min(fix.speed,45):null;
   if(!Number.isFinite(time)||!raw||!raw.every(Number.isFinite))return {mode:'invalid',position:at(along),along,offCount};
   let dt=lastTime===null?0:Math.max(0,Math.min(30,(time-lastTime)/1000));if(lastTime!==null&&time<=lastTime)return {mode:'stale',position:at(along),along,offCount};lastTime=time;
   // Predict only for a short period. Never pretend the route position is precise.
   const advance=Math.min(dt,12)*Math.min(velocity,38);const predicted=Math.min(total,along+advance);
   if(!Number.isFinite(acc)||acc>65){along=predicted;lastMode='uncertain';offCount=0;offSince=null;return {mode:'uncertain',position:at(along),along,offCount,confidence:'low'};}
   const match=snap(raw,predicted);const threshold=Math.max(45,acc*2.2);
   if(lastGood===null){if(match.distance<=threshold){along=match.along;lastGood={time,position:raw};velocity=speed??0;lastMode='matched';return {mode:'matched',position:at(along),along,offCount:0,confidence:'high'};}
    return {mode:'waiting',position:at(along),along,offCount:0,confidence:'low'};}
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
 window.JalanPredictiveGPS={create,runTests(){
  const line=[[101.6000,3.0000],[101.6100,3.0000]];
  function f(m,p,t,acc=8,speed=15){return m.feed({position:p,time:t,accuracy:acc,speed});}
  const a=create(line);f(a,[3,101.6000],1000);const jump=f(a,[3.003,101.605],2000);const recovered=f(a,[3,101.6005],4000);
  const b=create(line);f(b,[3,101.6000],1000);const bad=f(b,[3.003,101.605],3000,120);const held=f(b,[3,101.6005],5000);
  const c=create(line);f(c,[3,101.6000],1000);let deviation;for(let i=1;i<=6;i++)deviation=f(c,[3.0008,101.6000+0.0001*i],1000+3000*i,8,5);
  const results=[['Single GPS jump ignored',jump.mode!=='deviation'&&jump.position[0]===3],['Recovery after jump',recovered.mode==='matched'],['Poor accuracy held',bad.mode==='uncertain'&&held.mode==='matched'],['Sustained deviation confirmed',deviation.mode==='deviation']];return results;
 }};
})();
