/* Jalan V3.9 — foreground GPS guidance prototype. Never rely on it while driving. */
(() => {
 'use strict';
 const el=id=>document.getElementById(id), rad=x=>x*Math.PI/180, R=6371000;
 const meters=(a,b)=>{const x=rad(b[0]-a[0]),y=rad(b[1]-a[1]);return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(y/2)**2)));};
 let active=false,watch=null,marker=null,current=null,route=null,points=[],cum=[],total=0,maneuvers=[];
 let activeInstruction=null;
 let predictor=null,offCount=0,lastReroute=0,rerouting=false,auto=false,voice=window.JalanVoice?.getMode?.()||'mute',lastSpeech='',lastSpeechAt=0,lastFixAt=0,lastReportedAccuracy=Infinity,latestMatched=false,progress=0,destinationAnnounced=false;
 let latestMode='waiting',rerouteFix=null,rerouteEpoch=0,rerouteController=null;
 let lastPositionFix=null,pendingPositionFix=null,lastMeasuredAccepted=false,courseAnchor=null;
 let roadMotion=null,vehiclePosition=null,vehicleCertain=false,vehicleMode='waiting',vehicleHeading=null;
 // Ignore delayed/repeated geolocation callbacks, even when only seconds old.
 // Age-based location expiry remains responsible if fresh samples stop.
 let lastAcceptedSampleTime=-Infinity;
 const REROUTE_INTERVAL=30000;
 const cancelReroute=()=>{rerouteEpoch++;rerouteController?.abort();rerouteController=null;rerouting=false;};
 const warn=t=>{el('gps-warning').textContent=t;el('gps-warning').classList.toggle('hidden',!t);};
 // Measured GPS position is independent from matching the selected route.
 // Reject implausible single jumps; a new distant position needs a short
 // consistent sequence before the blue vehicle may move there.
 function acceptMeasuredFix(raw,accuracy,now,speed){
  if(!Array.isArray(raw)||raw.length!==2||!raw.every(Number.isFinite)||
     Math.abs(raw[0])>90||Math.abs(raw[1])>180||
     !Number.isFinite(accuracy)||accuracy<0||accuracy>65)return false;
  const metresPerSecond=Number.isFinite(speed)&&speed>=0?Math.min(45,speed):0;
  if(lastPositionFix){
   const dt=Math.max(0,(now-lastPositionFix.at)/1000);
   const ceiling=Math.max(35,2*(accuracy+lastPositionFix.accuracy))+
     Math.max(15,metresPerSecond,lastPositionFix.speed)*1.8*dt;
   // Consistent samples cannot prove travel faster than a generous
   // road-speed allowance. This remains enforced after long GPS outages:
   // otherwise three identical 40 km jumps become trusted after 30 seconds.
   const distanceFromLast=meters(raw,lastPositionFix.position);
   const plausibleTravel=Math.max(60,45*dt+2*(accuracy+lastPositionFix.accuracy));
   if(distanceFromLast>plausibleTravel){
    pendingPositionFix=null;
    return false;
   }
   if(distanceFromLast>ceiling){
    const candidate=pendingPositionFix;
    const candidateDt=candidate?Math.max(0,(now-candidate.lastAt)/1000):0;
    if(!candidate||candidateDt>7||
       meters(raw,candidate.position)>Math.max(70,metresPerSecond*2.5*candidateDt+accuracy*3)){
     pendingPositionFix={position:[...raw],firstAt:now,lastAt:now,count:1};
     return false;
    }
    candidate.position=[...raw];candidate.lastAt=now;candidate.count++;
    if(candidate.count<3||now-candidate.firstAt<1800)return false;
   }
  }
  lastPositionFix={position:[...raw],accuracy,at:now,speed:metresPerSecond};
  pendingPositionFix=null;
  return true;
 }
 // Some phones supply coordinates without speed or compass heading.
 function measuredCourse(raw,accuracy,time,heading,speed){
  const previous=courseAnchor;
  const elapsed=previous?(time-previous.time)/1000:0;
  const distance=previous?meters(previous.position,raw):0;
  const moved=elapsed>0&&elapsed<=10&&distance>=Math.max(6,accuracy,previous.accuracy);
  if(!previous||moved||elapsed>10)courseAnchor={position:raw,accuracy,time};
  const velocity=Number.isFinite(speed)&&speed>=0?speed:(moved?distance/elapsed:null);
  if(velocity===null||velocity<2.5)return null;
  if(Number.isFinite(heading)&&heading>=0&&heading<360)return heading;
  if(!moved)return null;
  const east=(raw[1]-previous.position[1])*Math.cos(rad(raw[0]));
  return (Math.atan2(east,raw[0]-previous.position[0])*180/Math.PI+360)%360;
 }
 const positionEvidence=(updated=false)=>({
  gpsPosition:lastPositionFix?[...lastPositionFix.position]:null,
  gpsAccuracy:lastPositionFix?.accuracy??Infinity,
  gpsFixAgeMs:lastPositionFix?Date.now()-lastPositionFix.at:Infinity,
  vehiclePosition:vehiclePosition?[...vehiclePosition]:null,vehicleCertain,vehicleMode,vehicleHeading,
  gpsReliable:!!updated
 });
 // Map tiles can be loading or switching renderers while GPS continues.
 function nearbyRoads(raw){
  try{return window.JalanVectorMap?.nearbyRoads?.(raw,current||raw)??null;}
  catch{return null;}
 }
 function project(p){const sx=111320*Math.cos(rad(p[0])),sy=111320;let best={distance:Infinity,along:0};for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],ax=(a[1]-p[1])*sx,ay=(a[0]-p[0])*sy,dx=(b[1]-a[1])*sx,dy=(b[0]-a[0])*sy,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(ax+t*dx,ay+t*dy);if(d<best.distance)best={distance:d,along:cum[i-1]+t*(cum[i]-cum[i-1])};}return best;}
 function build(){activeInstruction=null;route=routes[selectedRoute];if(!route?.geometry?.coordinates?.length)return false;points=route.geometry.coordinates.map(p=>[p[1],p[0]]);cum=[0];for(let i=1;i<points.length;i++)cum.push(cum[i-1]+meters(points[i-1],points[i]));total=cum.at(-1);if(total<10)return false;
  maneuvers=[];for(const leg of route.legs||[])for(const step of leg.steps||[]){const m=step.maneuver||{},type=String(m.type||'').toLowerCase();if(type==='depart'||type==='arrive')continue;let along=null;
   if(Number.isFinite(step.routeOffsetInMeters))along=step.routeOffsetInMeters;
   else if(Array.isArray(step.location)&&step.location.length===2)along=project([step.location[1],step.location[0]]).along;
   else if(Array.isArray(m.location)&&m.location.length===2)along=project([m.location[1],m.location[0]]).along;
   if(along===null)continue;const message=String(step.message||'').trim();const road=String(step.name||'').trim();const action=message||(`${String(m.modifier||type||'Continue').replace(/_/g,' ')}${road?' onto '+road:''}`);
   maneuvers.push({along,action,step});}
  maneuvers.sort((a,b)=>a.along-b.along);
  roadMotion=window.JalanPredictiveGPS.createRoadMotion?.(route.geometry.coordinates)||null;
  return true;}
 function speak(t){if(voice==='mute'||!('speechSynthesis'in window)||document.hidden||!active)return;const now=Date.now();if(t===lastSpeech&&now-lastSpeechAt<45000)return;lastSpeech=t;lastSpeechAt=now;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='en-GB';u.rate=0.95;speechSynthesis.speak(u);}catch(e){console.warn('Voice unavailable',e);}}
 // Location-quality UI gets measured accuracy/time, independent of route matching.
 // No coordinates or route authority are exposed by this display-only event.
 function publishQuality(fix,error=false){
  const c=fix?.coords;
  window.dispatchEvent(new CustomEvent('jalan:location-quality',{detail:error?{error:true}:{
   accuracy:c?.accuracy,timestamp:fix?.timestamp,
   valid:!!c&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&
     Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180
  }}));
 }
 function update(fix){
  if(!active)return;
  const now=Date.now(),sampleTime=Number(fix.timestamp);
  // A cached/background Safari location must not be advertised as a fresh
  // route match. Do not feed expired or far-future samples to the predictor.
  if(Number.isFinite(sampleTime)&&(sampleTime<now-10000||sampleTime>now+5000)){
   publishQuality(null,true);
   latestMatched=false;lastReportedAccuracy=Infinity;lastFixAt=0;latestMode='stale';rerouteFix=null;lastMeasuredAccepted=false;
   window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{
    accuracy:Infinity,matched:false,matchedPosition:null,speedMps:null,
    heading:null,reason:'stale-sample',...positionEvidence()
   }}));
   el('gps-match-status').textContent='Old GPS reading ignored';
   warn('GPS reading is stale. Waiting for a fresh position; guidance may be inaccurate.');
   return;
  }
  // Expired callbacks still revoke trust; only nonexpired duplicates/older
  // callbacks are ignored without corrupting the last accepted GPS position.
  if(Number.isFinite(sampleTime)&&sampleTime<=lastAcceptedSampleTime)return;
  const raw=[fix.coords.latitude,fix.coords.longitude],reportedAccuracy=fix.coords.accuracy;
  // Never infer GPS accuracy from rendered text: "Unknown" would parse as 0 m.
  const accuracy=Number.isFinite(reportedAccuracy)&&reportedAccuracy>=0?reportedAccuracy:Infinity;
  // Validate browser-measured movement BEFORE feeding the route predictor.
  // A rejected teleport must never influence its internal history or cause a
  // false off-route verdict on the next legitimate fix.
  const previousMeasurement=lastPositionFix?.position;
  const measured=acceptMeasuredFix(raw,accuracy,Number.isFinite(sampleTime)?Math.min(now,sampleTime):now,fix.coords.speed);
  lastMeasuredAccepted=measured;
  if(measured&&Number.isFinite(sampleTime))lastAcceptedSampleTime=sampleTime;
  if(!measured){
   latestMatched=false;lastReportedAccuracy=Infinity;lastFixAt=0;
   latestMode='uncertain';rerouteFix=null;
   publishQuality(null,true);
   window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{
    accuracy:Infinity,matched:false,matchedPosition:null,speedMps:null,
    heading:null,reason:'rejected-measured-fix',...positionEvidence()
   }}));
   el('gps-accuracy').textContent=Number.isFinite(accuracy)?'Unverified':'Unknown';
   el('gps-match-status').textContent='GPS measurement rejected';
   el('gps-instruction').textContent='Route alignment pending · turn guidance paused';
   el('gps-detail').textContent='Last known position retained; waiting for plausible GPS';
   warn('GPS jump or inaccurate location rejected. Turn guidance paused.');
   return;
  }
  publishQuality(fix);
  vehicleHeading=measuredCourse(raw,accuracy,lastPositionFix.at,fix.coords.heading,fix.coords.speed);
  const display=roadMotion?.feed({position:raw,time:sampleTime||now,accuracy,speed:fix.coords.speed,heading:fix.coords.heading,
    roads:nearbyRoads(raw)});
  // Pending drift/turn evidence must not advance the stateful route matcher.
  // Resume with measured data once it aligns or proves a sustained departure.
  const result=display&&!display.onRoute&&!display.allowDeviation?
    {mode:'predicted',position:current||display.position,along:progress}:
    predictor.feed({position:raw,accuracy,time:fix.timestamp||Date.now(),speed:fix.coords.speed});
  const mode=display?(display.allowDeviation?'deviation':display.onRoute?result.mode:'predicted'):result.mode;
  const p=result.position;lastFixAt=now;latestMode=mode;
  // Correct small drift on a matched road. During a possible or confirmed
  // departure, publish the accepted measurement immediately, even without tiles.
  // A stopped phone can drop its heading, changing the road classifier's
  // answer even though the measured position is exactly the same.
  const unchanged=vehiclePosition&&(meters(raw,vehiclePosition)<0.5||samePoint(raw,previousMeasurement));
  if(!unchanged)vehiclePosition=display?.onRoute?display.position:raw;
  vehicleCertain=display?display.certain:mode==='matched';
  vehicleMode=display?.mode||mode;
  rerouteFix=lastPositionFix;
  current=mode==='matched'?p:raw;
  const trustworthy=measured&&mode==='matched'&&Number.isFinite(accuracy);
  latestMatched=trustworthy;lastReportedAccuracy=trustworthy?accuracy:Infinity;
  window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{speedLimitIndex:trustworthy?display?.speedLimitIndex:null,accuracy:trustworthy?accuracy:Infinity,remainingSeconds:route?route.duration*Math.max(0,total-progress)/total:null,remainingMeters:route?route.distance*Math.max(0,total-progress)/total:null,speedMps:fix.coords.speed,matchedPosition:trustworthy?p:null,heading:fix.coords.heading,routeSegment:route?.geometry?.coordinates?.length?'route-'+selectedRoute:null,matched:trustworthy,nearDestination:trustworthy&&!!(destination&&meters(p,destination)<110),...positionEvidence(measured)}}));
  updateLocation(raw);marker?.setLatLng(vehiclePosition);
  el('gps-accuracy').textContent=Number.isFinite(accuracy)?Math.round(accuracy)+' m':'Unknown';
  el('gps-match-status').textContent={matched:'On route · GPS matched',predicted:'Route prediction · checking GPS',uncertain:'GPS uncertain · estimated position',deviation:'Deviation confirmed',waiting:'Waiting for reliable GPS',stale:'Old GPS reading ignored',invalid:'Invalid GPS reading'}[mode]||'Route prediction';
  if(trustworthy)progress=Math.max(progress,result.along);
  const left=Math.max(0,total-progress),distance=route.distance*left/total,seconds=route.duration*left/total;
  el('gps-distance').textContent=fmtDist(distance);el('gps-eta').textContent=fmtTime(seconds);
  const next=maneuvers.find(x=>x.along>progress+12);
  activeInstruction=null;
  if(next){
   const d=next.along-progress,label=fmtDist(d)+': ',english=label+next.action;
   activeInstruction={english,step:next.step,action:next.action,prefix:label};
   el('gps-instruction').textContent=english;
   if(trustworthy)window.JalanVoice.announce(voice,next.along.toFixed(1),d,next.action,next.step);
  }
  else el('gps-instruction').textContent=maneuvers.length?'Continue toward destination':'Follow selected route — detailed maneuvers unavailable';
  el('gps-detail').textContent=`Arrival approx. ${new Date(Date.now()+seconds*1000).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'})} · ${mode==='matched'?'GPS matched to selected route':'Position estimated; verify GPS'}`;
  if(mode==='deviation'){
   el('gps-instruction').textContent=auto?'Off route · recalculating…':'Off route · recalculation is off';
   el('gps-detail').textContent='Finding a route from your current location to the same destination';
   warn(auto?'Off route confirmed. Recalculating from current GPS.':'Off route confirmed. Enable automatic rerouting or use Recalculate.');
   if(auto&&Date.now()-lastReroute>=REROUTE_INTERVAL)reroute(true);
  }
  else if(trustworthy){warn('');if(left<55&&meters(p,destination)<110){el('gps-instruction').textContent='Near destination';if(!destinationAnnounced){destinationAnnounced=true;window.JalanVoice.alert(voice,'You are near your destination.');}}}
  else{
   el('gps-instruction').textContent='Route alignment pending · turn guidance paused';
   el('gps-detail').textContent='Selected-route position unverified; waiting for a reliable road match';
   warn('GPS jump or route mismatch detected. Turn guidance paused while position is checked.');
  }
  // Engineering mode follows position directly. Passenger mode has its own
  // ahead-biased camera; prevent the legacy panTo from overriding its zoom.
  if(!document.hidden&&!document.body.classList.contains('passenger-mode'))map.panTo(vehiclePosition,{animate:false});
 }
 function start(){if(active)return;if(!build()){statusEl.textContent='Calculate a route before starting GPS test.';return;}if(!navigator.geolocation){statusEl.textContent='Geolocation unavailable';return;}
  window.JalanNavigation?.stop();courseAnchor=null;vehicleHeading=null;lastReroute=0;current=null;vehiclePosition=null;vehicleCertain=false;vehicleMode='waiting';lastPositionFix=null;pendingPositionFix=null;lastMeasuredAccepted=false;lastAcceptedSampleTime=-Infinity;lastFixAt=0;lastReportedAccuracy=Infinity;latestMatched=false;latestMode='waiting';rerouteFix=null;predictor=window.JalanPredictiveGPS.create(route.geometry.coordinates);active=true;window.dispatchEvent(new CustomEvent('jalan:journey-start',{detail:{provider:route?.provider||'osrm',predictedSeconds:route?.duration||null,distanceMeters:route?.distance||null}}));progress=0;offCount=0;lastSpeech='';destinationAnnounced=false;window.JalanVoice.reset();document.body.classList.add('nav-active');el('gps-hud').classList.remove('hidden');el('gps-instruction').textContent='Acquiring GPS…';warn('Experimental guidance only. Test stationary or as a passenger.');marker=L.circleMarker(points[0],{radius:10,color:'#fff',weight:3,fillColor:'#0e9f6e',fillOpacity:document.body.classList.contains('passenger-mode')?0:1,opacity:document.body.classList.contains('passenger-mode')?0:1}).addTo(map);
  watch=navigator.geolocation.watchPosition(update,e=>{
   publishQuality(null,true);
   latestMatched=false;lastReportedAccuracy=Infinity;lastFixAt=0;latestMode='waiting';rerouteFix=null;lastMeasuredAccepted=false;cancelReroute();
   warn('GPS unavailable: '+e.message);
   window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{accuracy:Infinity,
     matched:false,matchedPosition:null,speedMps:null,heading:null,reason:'geolocation-error',...positionEvidence()}}));
  },{enableHighAccuracy:true,maximumAge:1500,timeout:20000});
 }
 function stop(){vehiclePosition=null;vehicleCertain=false;vehicleMode='waiting';cancelReroute();latestMode='waiting';rerouteFix=null;lastPositionFix=null;pendingPositionFix=null;lastMeasuredAccepted=false;lastAcceptedSampleTime=-Infinity;if(active)window.dispatchEvent(new CustomEvent('jalan:journey-stop'));active=false;current=null;lastFixAt=0;lastReportedAccuracy=Infinity;latestMatched=false;if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}if(marker){map.removeLayer(marker);marker=null;}if('speechSynthesis'in window)speechSynthesis.cancel();el('gps-hud').classList.add('hidden');document.body.classList.remove('nav-active');setTimeout(()=>map.invalidateSize(),70);}
 const rerouteStatus=(state,message)=>window.dispatchEvent(new CustomEvent('jalan:reroute-status',{detail:{state,message}}));
 const freshRerouteFix=()=>rerouteFix&&Date.now()-rerouteFix.at>=0&&Date.now()-rerouteFix.at<=10000;
 const samePoint=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a[0]===b[0]&&a[1]===b[1];
 const usableRoute=(candidate,from,to)=>{
  const coords=candidate?.geometry?.coordinates;
  if(!Array.isArray(coords)||coords.length<2||coords.length>20000||
     !coords.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)||
     !Number.isFinite(candidate.duration)||candidate.duration<=0||!Number.isFinite(candidate.distance)||candidate.distance<=0)return false;
  let length=0;for(let i=1;i<coords.length;i++)length+=meters([coords[i-1][1],coords[i-1][0]],[coords[i][1],coords[i][0]]);
  return length>=10&&meters(from,[coords[0][1],coords[0][0]])<=150&&
    meters(to,[coords.at(-1)[1],coords.at(-1)[0]])<=150;
 };
 async function reroute(automatic=false,retryFromLatest=false){
  if(rerouting)return;
  if(!active||!current||!destination){rerouteStatus('error','Route not ready for recalculation.');return;}
  if(document.hidden||!freshRerouteFix()){
   rerouteStatus('error','Waiting for a fresh, reliable GPS position before recalculating.');return;
  }
  if(!retryFromLatest&&Date.now()-lastReroute<REROUTE_INTERVAL){rerouteStatus('waiting','Please allow 30 seconds before another route check.');return;}
  const from=[...rerouteFix.position],target=[...destination],oldRoute=route;
  const primary=!!el('tt-primary').checked,key=el('tt-key')?.value?.trim()||'';
  const controller=new AbortController(),id=++rerouteEpoch;
  rerouteController=controller;rerouting=true;lastReroute=Date.now();
  const currentRequest=()=>id===rerouteEpoch&&active&&route===oldRoute&&routes[selectedRoute]===oldRoute&&
    !document.hidden&&samePoint(destination,target)&&!!el('tt-primary').checked===primary&&
    (!primary||(el('tt-key')?.value?.trim()||'')===key)&&
    (!automatic||(auto&&latestMode==='deviation'));
  let movedBeyondOrigin=false;
  const timeout=setTimeout(()=>{
   if(id!==rerouteEpoch)return;
   cancelReroute();warn('Route service timed out. Existing route retained.');
   rerouteStatus('error','Route service timed out. Existing route retained; another check can follow.');
  },20000);
  warn('Recalculating from your current location…');
  rerouteStatus('checking','Recalculating route from your current location…');
  try{
   const candidates=await requestDrivingRoutes(from,target,{signal:controller.signal,via:oldRoute?.pinnedStop?.point,tollPolicy:oldRoute?.tollPolicy});
   if(!currentRequest()||controller.signal.aborted)return;
   if(!freshRerouteFix()||meters(from,rerouteFix.position)>150){
    movedBeyondOrigin=!!freshRerouteFix();
    rerouteStatus('waiting','Location changed during the request. Waiting for the next route check.');return;
   }
   const available=Array.isArray(candidates)?candidates.filter(r=>usableRoute(r,from,oldRoute?.pinnedDestinationAccess||target)):[];
   if(!available.length)throw Error('No usable replacement route');
   if(oldRoute?.pinnedDestinationAccess)for(const r of available)r.pinnedDestinationAccess=oldRoute.pinnedDestinationAccess;
   available.sort((a,b)=>a.duration-b.duration);
   // Commit only a usable, current response. Failure never clears the old
   // route, destination or GPS watcher, and late responses cannot restart it.
   // Transactional route replacement: keep the same geolocation watch and
   // vehicle marker while geometry, ETA, turn data and predictor are swapped.
   if(!replaceGuidanceRoute(available,from))throw Error('Replacement route could not be constructed');
   warn('New route calculated from your current location.');
   rerouteStatus('success','Route updated to your destination.');
   window.dispatchEvent(new CustomEvent('jalan:route-change',{detail:{reason:'off-route',provider:route?.provider||'osrm'}}));
   window.JalanTomTom?.refreshRouteIncidents?.(true);
  }catch(e){
   if(currentRequest()&&e.name!=='AbortError'){
    warn('Recalculation unavailable. Existing route retained.');
    rerouteStatus('error','Could not update route. Existing route retained; check GPS, connection and routing settings.');
   }
  }finally{
   clearTimeout(timeout);
   if(rerouteController===controller){
    rerouteController=null;rerouting=false;
    // A long response can be obsolete even with excellent GPS. Retry once
    // from the newest fix, and keep the normal cooldown for later requests.
    if(movedBeyondOrigin&&!retryFromLatest&&currentRequest())void reroute(automatic,true);
   }
  }
 }
 function replaceGuidanceRoute(available,from,reason){
  const previousRoutes=routes,previousSelection=selectedRoute;
  routes=available;selectedRoute=0;
  if(!build()){routes=previousRoutes;selectedRoute=previousSelection;build();return false;}
  if(previousRoutes[previousSelection]?.pinnedStop||route.pinnedStop)window.dispatchEvent(new CustomEvent('jalan:archive-trail',{detail:{reason,previous:previousRoutes[previousSelection]}}));
  destinationAnnounced=false;startPoint=from;predictor=window.JalanPredictiveGPS.create(route.geometry.coordinates);
  progress=0;offCount=0;latestMatched=false;latestMode='waiting';lastReportedAccuracy=Infinity;
  // A response describes the request-time position. Preserve the latest live
  // marker and camera, including movement since the request was dispatched.
  vehicleCertain=false;
  renderRoutes({preserveGPS:true});
  el('gps-instruction').textContent='New route ready · checking current GPS position';
  el('gps-detail').textContent='Turn guidance resumes after matching the updated route';
  el('gps-distance').textContent=fmtDist(route.distance);
  el('gps-eta').textContent=fmtTime(route.duration);
  return true;
 }
 function updateButtons(){el('gps-auto').textContent='Auto reroute: '+(auto?'On':'Off');el('gps-auto').setAttribute('aria-pressed',String(auto));el('gps-voice').textContent='Voice: '+window.JalanVoice.label(voice);el('gps-voice').setAttribute('aria-pressed',String(voice!=='mute'));}
 el('gps-start').onclick=start;el('gps-exit').onclick=()=>{stop();if(routes.length)renderRoutes();};el('gps-recenter').onclick=()=>{if(current)map.setView(current,16);};el('gps-reroute').onclick=()=>reroute(false);
 el('gps-auto').onclick=()=>{auto=!auto;if(!auto)cancelReroute();updateButtons();window.dispatchEvent(new CustomEvent('jalan:navigation-settings',{detail:{auto,voice}}));};
 function setVoiceMode(value){
  if(!window.JalanVoice.setMode(value))return false;
  voice=value;
  updateButtons();
  window.dispatchEvent(new CustomEvent('jalan:navigation-settings',{detail:{auto,voice}}));
  return true;
 }
 el('gps-voice').onclick=()=>setVoiceMode(window.JalanVoice.nextMode(voice));
 document.addEventListener('visibilitychange',()=>{if(active&&document.hidden){cancelReroute();warn('Safari backgrounded. GPS and speech may pause; do not rely on navigation.');if('speechSynthesis'in window)speechSynthesis.cancel();}});
 for(const [id,type] of [['tt-key','input'],['tt-primary','change'],['tt-remove-key','click']])el(id)?.addEventListener(type,cancelReroute);
 updateButtons();
 window.JalanGPS={
  getState(){return {active,...positionEvidence(!!(lastMeasuredAccepted&&lastPositionFix&&Date.now()-lastPositionFix.at<=10000)),deviationConfirmed:active&&latestMode==='deviation'&&!!freshRerouteFix(),rerouting,matched:active&&latestMatched&&lastFixAt>0,position:current?[...current]:null,accuracy:lastFixAt?lastReportedAccuracy:Infinity,fixAgeMs:lastFixAt?Date.now()-lastFixAt:Infinity,remainingSeconds:active&&route?route.duration*Math.max(0,total-progress)/total:null,remainingMeters:active&&route?route.distance*Math.max(0,total-progress)/total:null,route};},
  // Read-only route maneuvers generated from the selected provider's actual
  // instructions. Distances are from current matched progress, not fabricated
  // turn guesses from arbitrary OSM polylines.
  instructionStep(english){return activeInstruction?.english===english?activeInstruction.step:null;},
  malayInstruction(english){
   if(!activeInstruction||english!==activeInstruction.english)return undefined;
   const {step,action,prefix}=activeInstruction;
   return prefix+window.JalanManeuvers.action(step,action,'ms');
  },
  getDirections(){
   if(!active||!route||!latestMatched||rerouting)return [];
   const items=maneuvers.filter(m=>Number.isFinite(m.along)&&m.along>progress+12)
     .map(m=>({action:m.action,step:m.step,distanceMeters:Math.max(0,m.along-progress)}));
   items.push({action:'Arrive at destination',distanceMeters:Math.max(0,total-progress),arrival:true});
   return items;
  },
  applyPinnedRoute(candidate,from,reason){
   const last=candidate?.geometry?.coordinates?.at(-1);
   const cachedOnward=reason==='passed-offline'&&route?.pinnedStop?.onward===candidate;
   const origin=cachedOnward?route.pinnedStop.access:from;
   if(!active||!freshRerouteFix()||!last||meters(from,rerouteFix.position)>150||
      !usableRoute(candidate,origin,[last[1],last[0]]))return false;
   cancelReroute();
   return replaceGuidanceRoute([candidate],from,reason);
  },
  applyTrafficRoute(newRoute){
   if(route?.pinnedStop&&!samePoint(route.pinnedStop.point,newRoute?.pinnedStop?.point))return false;
   if(!active||!freshRerouteFix()||!usableRoute(newRoute,rerouteFix.position,destination))return false;
   cancelReroute();
   const [lng,lat]=newRoute.geometry.coordinates[0];
   return replaceGuidanceRoute([newRoute],[lat,lng]);
  },
  setVoiceMode,getVoiceMode:()=>voice,stop,routeReady(){el('gps-start').classList.remove('hidden');}};
})();
