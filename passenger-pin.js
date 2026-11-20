(() => {
 'use strict';
 if(!passengerMode)return;
 const model=window.JalanPinnedRoute,host=map.getContainer();
 const card=document.createElement('section'),toast=document.createElement('div');
 card.id='jalan-pin-card';card.hidden=true;card.setAttribute('role','dialog');
 card.setAttribute('aria-labelledby','jalan-pin-title');
 card.innerHTML='<strong id="jalan-pin-title"></strong><small></small><div class="jalan-pin-actions"></div><div id="jalan-pin-time" aria-hidden="true"></div><div id="jalan-pin-bar" aria-hidden="true"></div>';
 toast.id='jalan-pin-toast';toast.hidden=true;toast.setAttribute('role','status');document.body.append(card,toast);
 const title=card.querySelector('strong'),sub=card.querySelector('small'),actions=card.querySelector('.jalan-pin-actions'),
   time=card.querySelector('#jalan-pin-time'),bar=card.querySelector('#jalan-pin-bar');
 const icon=L.divIcon({className:'jalan-map-pin',iconSize:[26,40],iconAnchor:[13,39],
   html:'<svg viewBox="0 0 26 40" aria-hidden="true"><path d="M13 38C11 31 1 21 1 13a12 12 0 1124 0c0 8-10 18-12 25z" fill="#8047c7" stroke="white" stroke-width="1.7"/><circle cx="13" cy="13" r="4.6" fill="white"/></svg>'});
 const marker=point=>L.marker(point,{icon,interactive:false,keyboard:false,zIndexOffset:450}).addTo(map);
 const pane=map.createPane('passenger-stop');pane.style.zIndex='455';pane.style.pointerEvents='none';
 let tollDecision=null;
 let picked=null,tempPin=null,stopPin=null,purple=null,observed=null,track={},outcome='',retryAfter=0;
 let pendingDirect=null,request=null,hold=null,holdTimer,deadline=0,frame=0,ignoreClickUntil=0,toastTimer;
 const contacts=new Set();
 const same=(a,b)=>!!a&&!!b&&a[0]===b[0]&&a[1]===b[1];
 function message(value,duration=3000){
   clearTimeout(toastTimer);toast.textContent=value;toast.hidden=false;
   if(duration)toastTimer=setTimeout(()=>{toast.hidden=true;},duration);
 }
 function paintRoute(){
   const route=routes[selectedRoute],stop=route?.pinnedStop;
   if(observed===route)return;
   if(purple)map.removeLayer(purple);if(stopPin)map.removeLayer(stopPin);
   // Preserve approach evidence across recalculations to the same physical stop.
   if(!same(stop?.point,observed?.pinnedStop?.point)){track={};outcome='';retryAfter=0;}
   observed=route;purple=null;stopPin=null;
   if(!stop)return;
   const path=window.JalanRouteDisplay.shape(route);
   const points=window.JalanRouteDisplay.section(path,0,path.lengths[stop.index]);
   purple=L.polyline(points.map(([lon,lat])=>[lat,lon]),{pane:'passenger-stop',className:'jalan-stop-route',
     jalanRouteScale:1,color:'#8047c7',weight:9,smoothFactor:0,opacity:1,interactive:false}).addTo(map);
   stopPin=marker(stop.point);
 }
 // The basic map tilts its entire DOM plane. Invert its CSS projection on that
 // plane so a press below the horizon picks the same place in either renderer.
 function rasterPlane(){
   const style=getComputedStyle(host),m=new DOMMatrix(style.transform==='none'?undefined:style.transform);
   const [ox,oy]=style.transformOrigin.split(' ').map(parseFloat);
   return {m,ox,oy,x:host.offsetLeft+ox,y:host.offsetTop+oy};
 }
 function pointAt(x,y){
   const vector=window.JalanVectorMap;
   if(vector?.active){const r=host.getBoundingClientRect();return vector.unproject(x-r.left,y-r.top);}
   const t=rasterPlane(),m=t.m,sx=x-t.x,sy=y-t.y;
   const a=m.m11-sx*m.m14,b=m.m21-sx*m.m24,c=m.m12-sy*m.m14,d=m.m22-sy*m.m24;
   const u=sx*m.m44-m.m41,v=sy*m.m44-m.m42,det=a*d-b*c;
   if(Math.abs(det)<1e-8)return null;
   const p=map.containerPointToLatLng(L.point(t.ox+(u*d-v*b)/det,t.oy+(v*a-u*c)/det));
   return [p.lat,p.lng];
 }
 function cardPosition(){
   let x,y;
   if(window.JalanVectorMap?.active){
     const p=window.JalanVectorMap.project(picked),r=host.getBoundingClientRect();x=r.left+p.x;y=r.top+p.y;
   }else{
     const p=map.latLngToContainerPoint(picked),t=rasterPlane(),v=t.m.transformPoint(new DOMPoint(p.x-t.ox,p.y-t.oy));
     x=t.x+v.x/v.w;y=t.y+v.y/v.w;
   }
   const w=card.offsetWidth,h=card.offsetHeight;
   const left=Math.max(8,Math.min(innerWidth-w-8,x-w/2));
   const top=Math.max(8,Math.min(innerHeight-h-8,y-h-43>=8?y-h-43:y+9));
   card.style.left=left+'px';card.style.top=top+'px';
 }
 function restartIdle(){if(picked)deadline=contacts.size?0:performance.now()+7000;}
 function draw(now){
   if(!picked)return;
   const left=deadline?Math.max(0,deadline-now):7000;
   if(tollDecision){cardPosition();frame=requestAnimationFrame(draw);return;}
   if(!left){close();return;}
   cardPosition();time.textContent=Math.ceil(left/1000)+'s';bar.style.transform='scaleX('+left/7000+')';
   frame=requestAnimationFrame(draw);
 }
 function close(){
   if(!picked)return;
   tollDecision=null;card.classList.remove('toll-decision');
   picked=null;card.hidden=true;cancelAnimationFrame(frame);
   if(tempPin)map.removeLayer(tempPin);tempPin=null;
   document.body.classList.remove('passenger-pin-open');window.dispatchEvent(new Event('jalan:pin-close'));
 }
 function options(heading,buttons){
   title.textContent=heading;actions.replaceChildren();
   for(const [label,run] of buttons){
     const button=document.createElement('button');button.type='button';button.textContent=label;
     button.onclick=()=>{restartIdle();run();};actions.append(button);
   }
 }
 async function share(){
   const point=picked,link='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(point.join(','));
   try{await navigator.clipboard.writeText(link);}
   catch{
     if(picked!==point)return;
     const field=document.createElement('input');field.value=link;field.readOnly=true;field.setAttribute('aria-label','Location link');
     actions.replaceChildren(field);field.focus();field.select();field.setSelectionRange(0,link.length);
     try{if(!document.execCommand('copy'))throw Error();}catch{title.textContent='Copy location link';restartIdle();return;}
   }
   if(picked===point)close();message('Location link copied.');
 }
 function go(){
   if(!destination){startChange(false);return;}
   options('Go to this location?',[
     ['New destination',()=>startChange(false)],
     ['Add as stop',()=>{if(routes[selectedRoute]?.pinnedStop)
       options('Replace current stop?',[['Keep current stop',close],['Replace stop',()=>startChange(true)]]);
       else startChange(true);}]
   ]);
 }
 function open(point){
   if(!point||!validCoordinates(point)||window.JalanTollChoices?.blocked)return;
   abort();close();picked=point;tempPin=marker(point);
   sub.textContent=point.map(n=>n.toFixed(5)).join(', ');
   options('Pinned location',[['Go',go],['Share location',share]]);
   document.body.classList.add('passenger-pin-open');window.dispatchEvent(new Event('jalan:pin-open'));
   card.hidden=false;restartIdle();cardPosition();frame=requestAnimationFrame(draw);
 }
 function endHold(){clearTimeout(holdTimer);hold=null;}
 const surface=e=>!!e.target.closest?.('#map,#passenger-map-gestures')&&!e.target.closest('button,a,input,.leaflet-control,.maplibregl-control-container,.leaflet-popup,.maplibregl-popup');
 window.addEventListener('pointerdown',e=>{
   // A new physical tap must never inherit the previous press's synthetic click.
   ignoreClickUntil=0;contacts.add(e.pointerId);endHold();
   if(picked){
     deadline=0;
     if(!card.contains(e.target)&&!surface(e))close();
   }
   if(contacts.size!==1||e.button!==0||!surface(e))return;
   const h={id:e.pointerId,x:e.clientX,y:e.clientY,opened:false,moved:false};hold=h;
   holdTimer=setTimeout(()=>{if(hold===h){h.opened=true;open(pointAt(h.x,h.y));}},700);
 },true);
 window.addEventListener('pointermove',e=>{
   if(hold&&hold.id===e.pointerId&&Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>9){
     hold.moved=true;clearTimeout(holdTimer);
   }
 },true);
 function release(e){
   contacts.delete(e.pointerId);
   if(hold?.id===e.pointerId){
     if(hold.opened)ignoreClickUntil=performance.now()+600;
     else if(picked&&!hold.moved&&e.type==='pointerup'){ignoreClickUntil=performance.now()+600;close();}
     endHold();
   }
   if(!contacts.size)restartIdle();
 }
 window.addEventListener('pointerup',release,true);window.addEventListener('pointercancel',release,true);
 window.addEventListener('contextmenu',e=>{if(surface(e))e.preventDefault();},true);
 window.addEventListener('click',e=>{if(surface(e)&&performance.now()<ignoreClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 window.addEventListener('keydown',e=>{if(e.key==='Escape')close();else restartIdle();});
 window.addEventListener('blur',()=>{endHold();contacts.clear();restartIdle();});
 function abort(){if(request){request.abort();request=null;toast.hidden=true;}document.body.classList.remove('passenger-pin-routing');}
 window.addEventListener('jalan:journey-start',abort);
 for(const [id,event] of [['tt-primary','change'],['tt-key','input'],['tt-remove-key','click']])
   $(id)?.addEventListener(event,abort);
 const reliable=s=>s?.gpsReliable&&s.gpsFixAgeMs<=10000?s.gpsPosition:null;
 function waitForFix(signal){
   message('Waiting for your current location.',0);
   return new Promise((resolve,reject)=>{
     function onFix(event){
       const point=reliable(event.detail);
       if(!point)return;
       window.removeEventListener('jalan:gps-fix',onFix);
       signal.removeEventListener('abort',onAbort);
       resolve(point);
     }
     function onAbort(){reject(signal.reason);}
     signal.throwIfAborted();
     signal.addEventListener('abort',onAbort,{once:true});
     window.addEventListener('jalan:gps-fix',onFix,{signal});
   });
 }
 function place(point){return {lat:point[0],lon:point[1],name:'Pinned location',display_name:'Pinned location · '+point.map(x=>x.toFixed(5)).join(', ')};}
 function previewDestination(choices,from,point){
   const available=choices.filter(route=>{
     const coords=route?.geometry?.coordinates;
     return Number.isFinite(route?.duration)&&route.duration>0&&Number.isFinite(route.distance)&&route.distance>0&&
       Array.isArray(coords)&&coords.length>=2&&coords.every(p=>Array.isArray(p)&&validCoordinates([p[1],p[0]]));
   });
   if(!available.length)throw Error('No driving routes');
   for(const route of available)route.pinnedDestinationAccess=[...route.geometry.coordinates.at(-1)].reverse();
   // End the old journey only after we have replacement choices to display.
   clearRoute(true);
   setStart(from,'Your starting location');
   setDestinationPlace(place(point),point);
   routes=available;selectedRoute=0;setPanelCollapsed(true);renderRoutes();
 }
 async function startChange(asStop){
   const point=picked;close();abort();
   if(!point)return;
   if(!asStop&&(!destination||(!routes.length&&!window.JalanGPS.getState().active))){
     await selectDestinationPlace(place(point));return;
   }
   await changeRoute(asStop?'add':'replace',point);
 }
 async function changeRoute(kind,point,approved){
   const state=window.JalanGPS.getState(),active=state.active,previous=routes[selectedRoute],final=destination;
   const stop=previous?.pinnedStop,replacing=kind==='replace';
   const tollPolicy=replacing?undefined:kind==='add'?approved||(previous?.tollPolicy?{}:undefined):
     (kind==='passed'||kind==='arrived')?stop?.onward.tollPolicy:previous?.tollPolicy;
   let from=active?reliable(state):startPoint||userLocation;
   if(!from&&!(active&&replacing)){message('Waiting for your current location.');return;}
   abort();const job=new AbortController();request=job;
   document.body.classList.add('passenger-pin-routing');
   const timer=setTimeout(()=>job.abort(),18000);
   const primary=$('tt-primary').checked;
   const current=()=>request===job&&primary===$('tt-primary').checked&&(replacing||routes[selectedRoute]===previous)&&destination===final&&window.JalanGPS.getState().active===active;
   try{
     if(!from)from=await waitForFix(job.signal);
     const target=replacing?point:final,via=kind==='add'?point:null;
     for(let i=0;i<2;i++){
       if(!current()||job.signal.aborted)return;
       if(replacing)message('Calculating driving routes…',0);
       const choices=kind==='arrived'?[stop.onward]:await requestDrivingRoutes(from,target,{signal:job.signal,via,tollPolicy});
       if(!current()||job.signal.aborted)return;
       if(active){
         let latest=reliable(window.JalanGPS.getState());
         if(!latest&&replacing)latest=await waitForFix(job.signal);
         if(!current()||job.signal.aborted)return;
         if(!latest)throw Error();
         if(model.meters(latest,from)>150){from=latest;continue;}
       }
       if(replacing){
         previewDestination(choices,from,point);
         window.JalanTomTom?.refreshRouteIncidents?.(true);
         return;
       }
       const candidate=choices.slice().sort((a,b)=>a.duration-b.duration)[0];
       if(!candidate?.geometry?.coordinates?.length)throw Error();
       if(previous?.pinnedDestinationAccess)candidate.pinnedDestinationAccess=previous.pinnedDestinationAccess;
       if(active){
         if(!window.JalanGPS.applyPinnedRoute(candidate,from,kind))throw Error();
       }else{routes=[candidate];selectedRoute=0;renderRoutes();}
       window.dispatchEvent(new CustomEvent('jalan:route-change',{detail:{reason:'pin-'+kind,provider:candidate.provider||'osrm'}}));
       window.JalanTomTom?.refreshRouteIncidents?.(true);
       pendingDirect=null;
       if(kind!=='resume')message({add:'Stop added.',arrived:'Stop reached. Continuing to your destination.',passed:'Stop passed. Continuing to your destination.'}[kind]);
       return;
     }
     throw Error();
   }catch(error){
     if(!current())return;
     if(kind==='add'&&tollPolicy){
       const leg=error.tollConflict;
       // Detach the completed search before reopening the pin for an explicit decision.
       abort();open(point);if(!picked)return;
       tollDecision=previous;card.classList.add('toll-decision');
       const retry=policy=>{close();if(routes[selectedRoute]===previous&&destination===final)changeRoute('add',point,policy);};
       sub.textContent=leg?(leg==='toStop'?'The route to this stop has tolls.':'The route from this stop to your destination has tolls.'):'Could not confirm a toll-free route.';
       options('Add this stop?',leg?[
         [leg==='toStop'?'Allow tolls to this stop':'Allow tolls after this stop',()=>retry({...tollPolicy,[leg]:true})],
         ['Don’t allow tolls',close]
       ]:[['Retry',()=>retry(tollPolicy)],['Cancel',close]]);
       cardPosition();actions.querySelector('button:last-child').focus({preventScroll:true});return;
     }
     const latest=reliable(window.JalanGPS.getState());
     if(kind==='passed'&&latest&&window.JalanGPS.applyPinnedRoute(stop.onward,latest,'passed-offline')){
       // Drop the missed detour even during a provider outage. The cached
       // onward geometry stays available until a route from this fix succeeds.
       pendingDirect=stop.onward;retryAfter=Date.now()+6000;
       window.dispatchEvent(new CustomEvent('jalan:route-change',{detail:{reason:'pin-passed',provider:previous.provider||'osrm'}}));
       message('Stop passed. Continuing to your destination.');
     }else if(kind!=='resume')message(kind==='passed'||kind==='arrived'?'Checking the onward route again shortly.':'Could not update the route. Try again.');
   }finally{clearTimeout(timer);if(request===job){request=null;document.body.classList.remove('passenger-pin-routing');}}
 }
 window.addEventListener('jalan:toll-choice-changing',()=>{abort();close();});
 window.addEventListener('jalan:routes-rendered',()=>{if(tollDecision&&tollDecision!==routes[selectedRoute])close();});
 for(const name of ['jalan:routes-rendered','jalan:route-cleared'])window.addEventListener(name,paintRoute);
 for(const name of ['jalan:route-cleared','jalan:journey-stop'])window.addEventListener(name,()=>{abort();close();track={};outcome='';pendingDirect=null;});
 window.addEventListener('jalan:gps-fix',e=>{
   const route=window.JalanGPS.getState().route,stop=route?.pinnedStop;
   if(!e.detail.gpsReliable||route!==observed)return;
   if(pendingDirect&&pendingDirect!==route)pendingDirect=null;
   if(pendingDirect&&!request&&Date.now()>=retryAfter){
     retryAfter=Date.now()+15000;
     queueMicrotask(()=>{if(pendingDirect===routes[selectedRoute]&&!request)changeRoute('resume',destination);});
   }
   if(!stop)return;
   outcome||=model.observe(track,e.detail,stop,Math.round(Date.now()-e.detail.gpsFixAgeMs));
   if(!outcome||request||Date.now()<retryAfter)return;
   retryAfter=Date.now()+6000;
   // Finish processing this GPS sample on its original geometry first.
   queueMicrotask(()=>{if(route===routes[selectedRoute]&&!request){
     if(outcome==='arrived'&&model.meters(e.detail.gpsPosition,stop.access)>140)outcome='passed';
     changeRoute(outcome,stop.point);
   }});
 });
})();
