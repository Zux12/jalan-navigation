/* Jalan V3.9 — foreground GPS guidance prototype. Never rely on it while driving. */
(() => {
 'use strict';
 const el=id=>document.getElementById(id), rad=x=>x*Math.PI/180, R=6371000;
 const meters=(a,b)=>{const x=rad(b[0]-a[0]),y=rad(b[1]-a[1]);return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(y/2)**2)));};
 let active=false,watch=null,marker=null,current=null,route=null,points=[],cum=[],total=0,maneuvers=[];
 let predictor=null,offCount=0,lastReroute=0,rerouting=false,auto=false,voice='mute',lastSpeech='',lastSpeechAt=0,lastFixAt=0,progress=0,destinationAnnounced=false;
 const warn=t=>{el('gps-warning').textContent=t;el('gps-warning').classList.toggle('hidden',!t);};
 function project(p){const sx=111320*Math.cos(rad(p[0])),sy=111320;let best={distance:Infinity,along:0};for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],ax=(a[1]-p[1])*sx,ay=(a[0]-p[0])*sy,dx=(b[1]-a[1])*sx,dy=(b[0]-a[0])*sy,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(ax+t*dx,ay+t*dy);if(d<best.distance)best={distance:d,along:cum[i-1]+t*(cum[i]-cum[i-1])};}return best;}
 function build(){route=routes[selectedRoute];if(!route?.geometry?.coordinates?.length)return false;points=route.geometry.coordinates.map(p=>[p[1],p[0]]);cum=[0];for(let i=1;i<points.length;i++)cum.push(cum[i-1]+meters(points[i-1],points[i]));total=cum.at(-1);if(total<10)return false;
  maneuvers=[];for(const leg of route.legs||[])for(const step of leg.steps||[]){const m=step.maneuver||{},type=String(m.type||'').toLowerCase();if(type==='depart'||type==='arrive')continue;let along=null;
   if(Number.isFinite(step.routeOffsetInMeters))along=step.routeOffsetInMeters;
   else if(Array.isArray(step.location)&&step.location.length===2)along=project([step.location[1],step.location[0]]).along;
   else if(Array.isArray(m.location)&&m.location.length===2)along=project([m.location[1],m.location[0]]).along;
   if(along===null)continue;const message=String(step.message||'').trim();const road=String(step.name||'').trim();const action=message||(`${String(m.modifier||type||'Continue').replace(/_/g,' ')}${road?' onto '+road:''}`);
   maneuvers.push({along,action});}
  maneuvers.sort((a,b)=>a.along-b.along);return true;}
 function speak(t){if(voice==='mute'||!('speechSynthesis'in window)||document.hidden||!active)return;const now=Date.now();if(t===lastSpeech&&now-lastSpeechAt<45000)return;lastSpeech=t;lastSpeechAt=now;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='en-GB';u.rate=0.95;speechSynthesis.speak(u);}catch(e){console.warn('Voice unavailable',e);}}
 function update(fix){
  if(!active)return;
  const raw=[fix.coords.latitude,fix.coords.longitude],accuracy=fix.coords.accuracy;
  const result=predictor.feed({position:raw,accuracy,time:fix.timestamp||Date.now(),speed:fix.coords.speed});
  const p=result.position;lastFixAt=Date.now();
  // Publish filtered position only; raw GPS jumps must not pollute journey analytics.
  current=result.mode==='deviation'?raw:p;
  const trustworthy=result.mode==='matched';
  window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{accuracy:trustworthy?accuracy:Infinity,remainingSeconds:route?route.duration*Math.max(0,total-progress)/total:null,remainingMeters:route?route.distance*Math.max(0,total-progress)/total:null,speedMps:fix.coords.speed,routeSegment:route?.geometry?.coordinates?.length?'route-'+selectedRoute:null,matched:trustworthy,nearDestination:trustworthy&&!!(destination&&meters(p,destination)<110)}}));
  updateLocation(p);marker?.setLatLng(p);
  el('gps-accuracy').textContent=Number.isFinite(accuracy)?Math.round(accuracy)+' m':'Unknown';
  el('gps-match-status').textContent={matched:'On route · GPS matched',predicted:'Route prediction · checking GPS',uncertain:'GPS uncertain · estimated position',deviation:'Deviation confirmed',waiting:'Waiting for reliable GPS',stale:'Old GPS reading ignored',invalid:'Invalid GPS reading'}[result.mode]||'Route prediction';
  if(trustworthy)progress=Math.max(progress,result.along);
  const left=Math.max(0,total-progress),distance=route.distance*left/total,seconds=route.duration*left/total;
  el('gps-distance').textContent=fmtDist(distance);el('gps-eta').textContent=fmtTime(seconds);
  const next=maneuvers.find(x=>x.along>progress+12);
  if(next){const d=next.along-progress;el('gps-instruction').textContent=`${fmtDist(d)}: ${next.action}`;if(trustworthy)window.JalanVoice.announce(voice,next.along.toFixed(1),d,next.action);}
  else el('gps-instruction').textContent=maneuvers.length?'Continue toward destination':'Follow selected route — detailed maneuvers unavailable';
  el('gps-detail').textContent=`Arrival approx. ${new Date(Date.now()+seconds*1000).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'})} · ${result.mode==='matched'?'GPS matched to selected route':'Position estimated; verify GPS'}`;
  if(result.mode==='deviation'){warn('Sustained off-route readings confirmed. Recalculating if enabled.');if(auto&&Date.now()-lastReroute>120000)reroute();}
  else if(result.mode==='matched'){warn('');if(left<55&&meters(p,destination)<110){el('gps-instruction').textContent='Near destination';if(!destinationAnnounced){destinationAnnounced=true;window.JalanVoice.alert(voice,'You are near your destination.');}}}
  else warn('GPS jump or uncertainty detected. Holding predicted route position; guidance may be inaccurate.');
  if(!document.hidden)map.panTo(p,{animate:false});
 }
 function start(){if(active)return;if(!build()){statusEl.textContent='Calculate a route before starting GPS test.';return;}if(!navigator.geolocation){statusEl.textContent='Geolocation unavailable';return;}
  window.JalanNavigation?.stop();predictor=window.JalanPredictiveGPS.create(route.geometry.coordinates);active=true;window.dispatchEvent(new CustomEvent('jalan:journey-start',{detail:{provider:route?.provider||'osrm',predictedSeconds:route?.duration||null,distanceMeters:route?.distance||null}}));progress=0;offCount=0;lastSpeech='';destinationAnnounced=false;window.JalanVoice.reset();document.body.classList.add('nav-active');el('gps-hud').classList.remove('hidden');el('gps-instruction').textContent='Acquiring GPS…';warn('Experimental guidance only. Test stationary or as a passenger.');marker=L.circleMarker(points[0],{radius:10,color:'#fff',weight:3,fillColor:'#0e9f6e',fillOpacity:1}).addTo(map);
  watch=navigator.geolocation.watchPosition(update,e=>warn('GPS unavailable: '+e.message),{enableHighAccuracy:true,maximumAge:1500,timeout:20000});
 }
 function stop(){if(active)window.dispatchEvent(new CustomEvent('jalan:journey-stop'));active=false;if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}if(marker){map.removeLayer(marker);marker=null;}if('speechSynthesis'in window)speechSynthesis.cancel();el('gps-hud').classList.add('hidden');document.body.classList.remove('nav-active');setTimeout(()=>map.invalidateSize(),70);}
 async function reroute(){if(rerouting||!active||!current||!destination)return;if(Date.now()-lastReroute<30000)return;rerouting=true;lastReroute=Date.now();const savedAuto=auto,savedVoice=voice,oldRoute=route;warn('Requesting fastest available route with current traffic…');
  try{startPoint=[...current];await calculateRoutes();if(routes.length&&routes[0]!==oldRoute){auto=savedAuto;voice=savedVoice;updateButtons();start();warn('New route calculated. Verify the route before continuing.');window.dispatchEvent(new CustomEvent('jalan:route-change',{detail:{reason:'off-route',provider:route?.provider||'unknown'}}));}else{warn('Rerouting failed. Previous guidance may no longer be valid.');}}
  catch(e){warn('Rerouting failed: '+e.message);}finally{rerouting=false;}
 }
 function updateButtons(){el('gps-auto').textContent='Auto reroute: '+(auto?'On':'Off');el('gps-auto').setAttribute('aria-pressed',String(auto));el('gps-voice').textContent='Voice: '+window.JalanVoice.label(voice);el('gps-voice').setAttribute('aria-pressed',String(voice!=='mute'));}
 el('gps-start').onclick=start;el('gps-exit').onclick=()=>{stop();if(routes.length)renderRoutes();};el('gps-recenter').onclick=()=>{if(current)map.setView(current,16);};el('gps-reroute').onclick=reroute;
 el('gps-auto').onclick=()=>{auto=!auto;updateButtons();};el('gps-voice').onclick=()=>{voice=window.JalanVoice.nextMode(voice);updateButtons();if('speechSynthesis'in window)speechSynthesis.cancel();if(voice!=='mute'&&active)window.JalanVoice.alert(voice,window.JalanVoice.label(voice));};
 document.addEventListener('visibilitychange',()=>{if(active&&document.hidden){warn('Safari backgrounded. GPS and speech may pause; do not rely on navigation.');if('speechSynthesis'in window)speechSynthesis.cancel();}});
 window.JalanGPS={
  getState(){return {active,position:current?[...current]:null,accuracy:lastFixAt?Number(el('gps-accuracy').textContent.replace(/[^0-9.]/g,'')):Infinity,fixAgeMs:lastFixAt?Date.now()-lastFixAt:Infinity,remainingSeconds:active&&route?route.duration*Math.max(0,total-progress)/total:null,remainingMeters:active&&route?route.distance*Math.max(0,total-progress)/total:null,route};},
  applyTrafficRoute(newRoute){if(!active||!newRoute)return false;stop();routes=[newRoute];selectedRoute=0;renderRoutes();start();return true;},
  stop,routeReady(){el('gps-start').classList.remove('hidden');}};
})();
