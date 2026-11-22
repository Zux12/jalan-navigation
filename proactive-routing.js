/* Jalan V4.0 — proactive traffic route checks. Foreground test only. */
(() => {
 'use strict';
 const el=id=>document.getElementById(id);
 const CHECK_MS=5*60*1000,MIN_SAVE=5*60*1000,DECLINE_MS=10*60*1000;
 let enabled=false,lastCheck=0,declinedUntil=0,pending=null,controller=null,requestEpoch=0;
 const status=t=>{el('proactive-status').textContent=t;
  // Share only human-readable traffic status with the optional Passenger view.
  window.dispatchEvent(new CustomEvent('jalan:traffic-status',{detail:{message:t,enabled}}));
 };
 const offer=el('proactive-offer');
 const hideOffer=()=>{pending=null;offer.classList.add('hidden');};
 const invalidate=()=>{requestEpoch++;controller?.abort();controller=null;hideOffer();};
 const setEnabled=v=>{enabled=v;el('proactive-toggle').textContent=v?'Disable checks':'Enable 5-min checks';el('proactive-toggle').setAttribute('aria-pressed',String(v));status(v?'Waiting for GPS':'Off');if(!v)invalidate();};
 const closeEnough=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===2&&b.length===2&&a.every(Number.isFinite)&&b.every(Number.isFinite)&&Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180))<=150;
 const sameDestination=d=>Array.isArray(destination)&&destination.length===2&&destination.every(Number.isFinite)&&destination[0]===d[0]&&destination[1]===d[1];
 // Low reported location accuracy alone is insufficient: verify that
 // the road matcher has positively matched this fresh fix to the route.
 const trustedGPS=s=>s?.matched===true&&Array.isArray(s.position)&&s.position.length===2&&
   s.position.every(Number.isFinite)&&Math.abs(s.position[0])<=90&&Math.abs(s.position[1])<=180&&
   Number.isFinite(s.fixAgeMs)&&s.fixAgeMs>=0&&s.fixAgeMs<=30000&&
   Number.isFinite(s.accuracy)&&s.accuracy>=0&&s.accuracy<=75;
 const routeFromTomTom=r=>{
  const coordinates=[];
  for(const leg of r.legs||[])for(const p of leg.points||[]){if(Number.isFinite(p.latitude)&&Number.isFinite(p.longitude))coordinates.push([p.longitude,p.latitude]);}
  if(coordinates.length<2||coordinates.length>20000||coordinates.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90))throw Error('Invalid route geometry');
  // A nonempty array can still contain only coincident points. Reject such
  // malformed alternatives before an offered route can replace live guidance.
  let geometryMeters=0;
  for(let i=1;i<coordinates.length;i++){
   const a=coordinates[i-1],b=coordinates[i],midLat=(a[1]+b[1])*Math.PI/360;
   geometryMeters+=Math.hypot((b[1]-a[1])*111320,(b[0]-a[0])*111320*Math.cos(midLat));
  }
  if(!Number.isFinite(geometryMeters)||geometryMeters<10)throw Error('Invalid route geometry distance');
  if(!Number.isFinite(r.summary?.travelTimeInSeconds)||r.summary.travelTimeInSeconds<=0||!Number.isFinite(r.summary?.lengthInMeters)||r.summary.lengthInMeters<=0||!Number.isFinite(r.summary?.trafficDelayInSeconds??0)||r.summary.trafficDelayInSeconds<0)throw Error('Invalid TomTom route measurements');
  const roadGuidance=r.guidance?.instructions||[];
  const steps=window.JalanTomTom.guidanceSteps(r,coordinates);
  return {provider:'tomtom',...window.JalanTomTom.roadDetails(r.sections,coordinates.length),
   trafficSections:Array.isArray(r.sections)?r.sections.filter(s=>s?.sectionType==='TRAFFIC').slice(0,120):null,
   trafficSectionsCheckedAt:Date.now(),roadGuidance,geometry:{type:'LineString',coordinates},duration:r.summary.travelTimeInSeconds,distance:r.summary.lengthInMeters,knownTrafficDelay:r.summary.trafficDelayInSeconds??null,delay:r.summary.trafficDelayInSeconds||0,legs:[{steps}]};
 };
 async function check(force=false){
  if(!force&&(!enabled||document.hidden||Date.now()-lastCheck<CHECK_MS||Date.now()<declinedUntil))return;
  const state=window.JalanGPS?.getState?.();
  if(!state?.active){status('Start GPS test first');return;}
  if(!trustedGPS(state)){status('Waiting for road-matched GPS');return;}
  if(!Array.isArray(destination)||destination.length!==2||!destination.every(Number.isFinite)){status('Destination missing');return;}
  if(controller||pending)return;
  const apiKey=el('tt-key')?.value.trim();
  if(!apiKey){status('Enter TomTom key');return;}
  if(state.route?.provider!=='tomtom'||!el('tt-primary')?.checked){status('Select TomTom route first');return;}
  const sourcePosition=[...state.position],target=[...destination];
  const requestController=new AbortController(),id=++requestEpoch;
  controller=requestController;lastCheck=Date.now();status('Checking live traffic…');
  const current=()=>id===requestEpoch&&!requestController.signal.aborted&&!document.hidden&&
    (force||enabled)&&el('tt-primary')?.checked&&el('tt-key')?.value.trim()===apiKey&&sameDestination(target);
  try{
   const available=state.route.tollPolicy||state.route.stationItinerary
     ?await requestDrivingRoutes(sourcePosition,target,{signal:requestController.signal,via:state.route.pinnedStop?.point,stops:window.JalanStationRoute?.managed(state.route),tollPolicy:state.route.tollPolicy})
     :state.route.pinnedStop
     ?await window.JalanTomTom.requestRoutes(sourcePosition,target,{signal:requestController.signal,via:state.route.pinnedStop.point})
     :await directCandidates();
   if(!current()||!available)return;
   async function directCandidates(){
   const points=[sourcePosition,target].map(p=>p.map(n=>n.toFixed(6)).join(',')).join(':');
   const url=new URL('https://api.tomtom.com/routing/1/calculateRoute/'+points+'/json');
   Object.entries({key:apiKey,traffic:'true',departAt:'now',travelMode:'car',routeType:'fastest',maxAlternatives:'2',instructionsType:'text',sectionType:'traffic',language:'en-GB'}).forEach(([k,v])=>url.searchParams.set(k,v));
   const data=await window.JalanTomTom.fetchRouteData(url,requestController.signal);
   if(!current())return;
   if(!Array.isArray(data.routes)||!data.routes.length)throw Error('No routes found');
   // Never offer a faster route from malformed summary/geometry metadata.
   return data.routes.map(routeFromTomTom);
   }
   const best=available.reduce((a,b)=>a.duration<=b.duration?a:b);
   const now=window.JalanGPS?.getState?.();
   if(!now?.active||now.route!==state.route||!trustedGPS(now)||!closeEnough(sourcePosition,now.position)){
    status('Position or route changed; check again');return;
   }
   const oldSeconds=now.remainingSeconds;
   if(!Number.isFinite(oldSeconds)||oldSeconds<=0){status('Current ETA unavailable');return;}
   const saving=oldSeconds-best.duration;
   if(!current())return;
   // Informational traffic ETA from TomTom's fastest currently offered route.
   // This is NOT necessarily the selected road. Never overwrite GPS route
   // guidance/ETA or switch routes without the existing explicit confirmation.
   window.dispatchEvent(new CustomEvent('jalan:traffic-estimate',{detail:{
     provider:'tomtom',seconds:best.duration,currentSelectedSeconds:oldSeconds,
     checkedAt:Date.now(),route:state.route
   }}));
   if(saving*1000<MIN_SAVE){status('Checked: no route saves 5 min');return;}
   pending={route:best,sourceRoute:state.route,sourcePosition,sourceDestination:target,sourceKey:apiKey,created:Date.now(),requestEpoch:id};
   el('proactive-offer-title').textContent='Potentially save '+Math.round(saving/60)+' minutes';
   el('proactive-offer-detail').textContent='Current estimated remaining: '+Math.round(oldSeconds/60)+' min · New TomTom route: '+Math.round(best.duration/60)+' min. Confirm route before switching.';
   offer.classList.remove('hidden');window.dispatchEvent(new CustomEvent('jalan:route-offer',{detail:{estimatedSavingSeconds:saving,currentSeconds:oldSeconds,newSeconds:best.duration}}));status('Faster route suggested');
  }catch(e){if(current()&&e.name!=='AbortError')status('Traffic check failed: '+e.message);}
  finally{if(controller===requestController)controller=null;}
 }
 el('proactive-toggle').onclick=()=>setEnabled(!enabled);
 el('proactive-check').onclick=()=>check(true);
 el('proactive-decline').onclick=()=>{declinedUntil=Date.now()+DECLINE_MS;hideOffer();window.dispatchEvent(new CustomEvent('jalan:route-decline'));status('Current route kept (10-min pause)');};
 el('proactive-accept').onclick=()=>{
  if(!pending||Date.now()-pending.created>120000){hideOffer();status('Offer expired; check again');return;}
  const current=window.JalanGPS?.getState?.();
  if(!current?.active||current.route!==pending.sourceRoute||!el('tt-primary')?.checked||!sameDestination(pending.sourceDestination)||
     !trustedGPS(current)||!closeEnough(pending.sourcePosition,current.position)||el('tt-key')?.value.trim()!==pending.sourceKey||pending.requestEpoch!==requestEpoch){hideOffer();status('Position, route or provider changed; check again');return;}
  const r=pending.route;hideOffer();
  if(window.JalanGPS.applyTrafficRoute(r)){window.dispatchEvent(new CustomEvent('jalan:route-change',{detail:{reason:'faster-route',provider:'tomtom'}}));status('New TomTom route selected');window.JalanTomTom?.refreshRouteIncidents?.(true);}
  else status('Could not switch route');
 };
 setInterval(()=>{if(enabled&&!document.hidden)check(false);},15000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){invalidate();status(enabled?'Paused in background':'Off');}});
 // Provider and key changes revoke any proposed or in-flight faster route.
 el('tt-key')?.addEventListener('input',()=>{invalidate();status('TomTom key changed; check again');});
 el('tt-primary')?.addEventListener('change',()=>{invalidate();status('Routing provider changed; check again');});
 el('tt-remove-key')?.addEventListener('click',()=>{invalidate();status('TomTom key removed; check again');});
 el('gps-exit').addEventListener('click',()=>setEnabled(false));
 // Passenger Go starts the existing checker. A trusted GPS event can trigger
 // its first check immediately; the normal five-minute throttle still applies.
 window.JalanTraffic={
  start(){invalidate();lastCheck=0;declinedUntil=0;setEnabled(true);return check(false);},
  check:()=>check(false),
  stop:()=>setEnabled(false)
 };
})();
