/* Jalan V4.0 — proactive traffic route checks. Foreground test only. */
(() => {
 'use strict';
 const el=id=>document.getElementById(id);
 const CHECK_MS=5*60*1000,MIN_SAVE=5*60*1000,DECLINE_MS=10*60*1000;
 let enabled=false,busy=false,lastCheck=0,declinedUntil=0,pending=null,controller=null;
 const status=t=>{el('proactive-status').textContent=t;};
 const offer=el('proactive-offer');
 const hideOffer=()=>{pending=null;offer.classList.add('hidden');};
 const setEnabled=v=>{enabled=v;el('proactive-toggle').textContent=v?'Disable checks':'Enable 5-min checks';el('proactive-toggle').setAttribute('aria-pressed',String(v));status(v?'Waiting for GPS':'Off');if(!v){controller?.abort();hideOffer();}};
 const routeFromTomTom=r=>{
  const coordinates=[];
  for(const leg of r.legs||[])for(const p of leg.points||[]){if(Number.isFinite(p.latitude)&&Number.isFinite(p.longitude))coordinates.push([p.longitude,p.latitude]);}
  if(coordinates.length<2)throw Error('No route geometry');
  const steps=(r.guidance?.instructions||[]).slice(0,120).map(x=>({name:x.street||x.roadNumber||x.message||'road',distance:0,location:x.point?[x.point.longitude,x.point.latitude]:null,routeOffsetInMeters:Number.isFinite(x.routeOffsetInMeters)?x.routeOffsetInMeters:null,message:x.message||'',maneuver:{type:x.maneuver||'continue',modifier:x.message||''}}));
  return {provider:'tomtom',geometry:{type:'LineString',coordinates},duration:r.summary.travelTimeInSeconds,distance:r.summary.lengthInMeters,delay:r.summary.trafficDelayInSeconds||0,legs:[{steps}]};
 };
 async function check(force=false){
  const state=window.JalanGPS?.getState?.();
  if(!state?.active){status('Start GPS test first');return;}
  if(!state.position||state.fixAgeMs>30000||!Number.isFinite(state.accuracy)||state.accuracy>75){status('Waiting for accurate GPS');return;}
  if(!destination){status('Destination missing');return;}
  if(busy||pending)return;
  if(!force&&(!enabled||document.hidden||Date.now()-lastCheck<CHECK_MS||Date.now()<declinedUntil))return;
  const apiKey=el('tt-key')?.value.trim();
  if(!apiKey){status('Enter TomTom key');return;}
  if(state.route?.provider!=='tomtom'){status('Select TomTom route first');return;}
  busy=true;lastCheck=Date.now();status('Checking live traffic…');controller=new AbortController();
  try{
   const points=[state.position,destination].map(p=>p.map(n=>n.toFixed(6)).join(',')).join(':');
   const url=new URL('https://api.tomtom.com/routing/1/calculateRoute/'+points+'/json');
   Object.entries({key:apiKey,traffic:'true',departAt:'now',travelMode:'car',routeType:'fastest',maxAlternatives:'2',instructionsType:'text',language:'en-GB'}).forEach(([k,v])=>url.searchParams.set(k,v));
   const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('TomTom HTTP '+response.status);
   const data=await response.json();if(!data.routes?.length)throw Error('No routes found');
   const best=routeFromTomTom(data.routes.reduce((a,b)=>a.summary.travelTimeInSeconds<=b.summary.travelTimeInSeconds?a:b));
   const oldSeconds=state.remainingSeconds;
   if(!Number.isFinite(oldSeconds)){status('Current ETA unavailable');return;}
   const saving=oldSeconds-best.duration;
   if(saving*1000<MIN_SAVE){status('Checked: no route saves 5 min');return;}
   // Recheck that the active trip has not changed while awaiting the response.
   const now=window.JalanGPS?.getState?.();
   if(!now?.active||now.route!==state.route||!now.position){status('Route changed; check again');return;}
   pending={route:best,sourceRoute:state.route,created:Date.now()};
   el('proactive-offer-title').textContent='Potentially save '+Math.round(saving/60)+' minutes';
   el('proactive-offer-detail').textContent='Current estimated remaining: '+Math.round(oldSeconds/60)+' min · New TomTom route: '+Math.round(best.duration/60)+' min. Confirm route before switching.';
   offer.classList.remove('hidden');status('Faster route suggested');
  }catch(e){if(e.name!=='AbortError')status('Traffic check failed: '+e.message);}
  finally{busy=false;controller=null;}
 }
 el('proactive-toggle').onclick=()=>setEnabled(!enabled);
 el('proactive-check').onclick=()=>check(true);
 el('proactive-decline').onclick=()=>{declinedUntil=Date.now()+DECLINE_MS;hideOffer();status('Current route kept (10-min pause)');};
 el('proactive-accept').onclick=()=>{
  if(!pending||Date.now()-pending.created>120000){hideOffer();status('Offer expired; check again');return;}
  const current=window.JalanGPS?.getState?.();
  if(!current?.active||current.route!==pending.sourceRoute){hideOffer();status('Route changed; check again');return;}
  const r=pending.route;hideOffer();
  if(window.JalanGPS.applyTrafficRoute(r)){status('New TomTom route selected');window.JalanTomTom?.refreshRouteIncidents?.(true);}
  else status('Could not switch route');
 };
 setInterval(()=>{if(enabled&&!document.hidden)check(false);},15000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){controller?.abort();hideOffer();status(enabled?'Paused in background':'Off');}});
 el('gps-exit').addEventListener('click',()=>{controller?.abort();hideOffer();setEnabled(false);});
})();
