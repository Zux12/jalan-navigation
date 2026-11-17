/* Expand the active journey banner without pausing GPS, voice or traffic. */
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const el=id=>document.getElementById(id),panel=el('passenger-journey-sheet'),
  handle=el('passenger-journey-handle'),content=el('passenger-journey-content'),
  line=el('passenger-journey-line'),note=el('passenger-journey-traffic-note');
 let expanded=false,gesture=null,suppressClickUntil=0,currentRoute=null,currentVia=null,progress=0,lastPaint='';
 const active=()=>document.body.classList.contains('passenger-guiding');
 function measure(){
  if(!active())return 0;
  const peek=handle.offsetHeight+panel.querySelector('.passenger-stats').offsetHeight+14;
  const cap=parseFloat(getComputedStyle(panel).maxHeight)||innerHeight-190;
  const full=Math.max(peek,Math.min(cap,peek+content.scrollHeight));
  panel.style.setProperty('--journey-peek',peek+'px');
  panel.style.setProperty('--journey-full',full+'px');return full-peek;
 }
 function paint(){
  if(!active())return;
  const state=window.JalanGPS?.getState?.(),route=state?.active?state.route:routes[selectedRoute];
  if(!route)return;
  if(route!==currentRoute){currentRoute=route;currentVia=window.JalanJourneyModel.longestRoad(route);progress=0;lastPaint='';}
  el('passenger-journey-destination').textContent='Destination: '+(destinationName||'Selected destination');
  const via=currentVia;
  el('passenger-journey-via').textContent=via?'Via '+via:'Via selected route';
  const snapshot=window.JalanRouteTraffic?.getJourneySnapshot?.();
  const same=snapshot?.route===route;
  const total=same?snapshot.total:0;
  const located=state?.active&&state.route===route&&state.matched&&state.fixAgeMs<=10000&&
    Number.isFinite(state.accuracy)&&state.accuracy<=75;
  if(located&&Number.isFinite(state.remainingMeters)&&route.distance>0){
   // GPS exposes distance on this route; keep progress in geometry-distance units.
   progress=Math.max(progress,Math.max(0,Math.min(1,1-state.remainingMeters/route.distance)));
  }
  el('passenger-journey-origin').textContent=located?'You':progress>0?'Last route position':'Route start';
  const segments=same?window.JalanJourneyModel.remainingSegments(snapshot,progress*total):[];
  const signature=JSON.stringify(segments);
  if(signature!==lastPaint){
   lastPaint=signature;line.replaceChildren();
   for(const segment of segments){
    const span=document.createElement('span');span.dataset.traffic=segment.type;
    span.style.left=segment.left+'%';span.style.width=segment.width+'%';
    span.title=segment.type+' traffic · '+fmtDist(segment.from)+'–'+fmtDist(segment.to)+' ahead';
    line.appendChild(span);
   }
  }
  line.setAttribute('aria-label',segments.length?
   'Traffic along the remaining route. '+segments.map(s=>s.type+' from '+fmtDist(s.from)+' to '+fmtDist(s.to)).join('; ')+'. Grey sections have no current traffic detail.':
   'No current traffic detail for the remaining route');
  note.textContent=segments.length?'Grey: no current traffic detail':'Traffic detail unavailable';
  measure();
 }
 function cancel(){
  if(gesture?.claimed)suppressClickUntil=Date.now()+700;
  gesture=null;panel.classList.remove('passenger-journey-dragging');panel.style.removeProperty('--journey-drag');
 }
 function setExpanded(value,focus=false){
  expanded=!!value&&active();cancel();
  panel.dataset.expanded=String(expanded);handle.setAttribute('aria-expanded',String(expanded));
  handle.setAttribute('aria-label',expanded?'Collapse journey details':'Expand journey details');
  if(!expanded&&content.contains(document.activeElement))handle.focus({preventScroll:true});
  content.inert=!expanded;content.setAttribute('aria-hidden',String(!expanded));
  document.body.classList.toggle('passenger-journey-open',expanded);
  if(expanded){window.JalanPassengerMenu?.close();el('passenger-turn-close').click();paint();}
  measure();if(focus)handle.focus({preventScroll:true});
 }
 function begin(point,target,kind,id){
  if(!active()||document.body.classList.contains('passenger-route-search'))return;
  const limit=measure();
  gesture={x:point.clientX,y:point.clientY,kind,id,claimed:false,expanded,limit,
   start:expanded?0:limit,inContent:content.contains(target),atTop:content.scrollTop<=1};
  suppressClickUntil=0;
 }
 function move(point,event){
  if(!gesture)return;
  const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
  if(!gesture.claimed){
   if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
   if(Math.abs(dy)<Math.abs(dx)*1.2||
      (gesture.expanded&&gesture.inContent&&(dy<0||!gesture.atTop))){cancel();return;}
   gesture.claimed=true;panel.classList.add('passenger-journey-dragging');
   if(gesture.kind==='pointer')panel.setPointerCapture?.(gesture.id);
  }
  panel.style.setProperty('--journey-drag',Math.max(0,Math.min(gesture.limit,gesture.start+dy))+'px');
  if(event.cancelable)event.preventDefault();
 }
 function end(point,event){
  if(!gesture)return;move(point,event);if(!gesture)return;
  const g=gesture,dy=point.clientY-g.y;cancel();
  if(!g.claimed)return;
  if(event.cancelable)event.preventDefault();
  const threshold=Math.min(42,g.limit/3);
  setExpanded(g.expanded?!(dy>threshold):dy< -threshold);
 }
 panel.addEventListener('click',event=>{
  if(event.detail!==0&&Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 handle.addEventListener('click',()=>setExpanded(!expanded));
 panel.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.button!==0||event.isPrimary===false)return;
  begin(event,event.target,'pointer',event.pointerId);
 });
 window.addEventListener('pointermove',e=>{if(gesture?.kind==='pointer'&&gesture.id===e.pointerId)move(e,e);});
 window.addEventListener('pointerup',e=>{if(gesture?.kind==='pointer'&&gesture.id===e.pointerId)end(e,e);});
 window.addEventListener('pointercancel',e=>{if(gesture?.kind==='pointer'&&gesture.id===e.pointerId)cancel();});
 panel.addEventListener('touchstart',e=>{
  if(e.touches.length!==1){cancel();return;}
  const p=e.touches[0];begin(p,e.target,'touch',p.identifier);
 },{passive:true});
 panel.addEventListener('touchmove',e=>{
  if(e.touches.length!==1){cancel();return;}
  if(gesture?.kind==='touch'&&gesture.id===e.touches[0].identifier)move(e.touches[0],e);
 },{passive:false});
 panel.addEventListener('touchend',e=>{
  const p=Array.from(e.changedTouches).find(p=>p.identifier===gesture?.id);
  if(gesture?.kind==='touch'&&p)end(p,e);
 },{passive:false});
 panel.addEventListener('touchcancel',cancel,{passive:true});
 el('passenger-journey-resume').addEventListener('click',()=>setExpanded(false,true));
 el('passenger-journey-stop').addEventListener('click',()=>{
  setExpanded(false);clearRoute(true);
  el('destination').value='';el('results').replaceChildren();el('results').classList.add('hidden');
  chooseStart=false;reportMode=null;
  el('jalan-search-trigger').focus({preventScroll:true});
 });
 el('passenger-search').addEventListener('click',()=>setExpanded(false),true);
 el('passenger-turn-toggle').addEventListener('click',()=>setExpanded(false),true);
 el('jalan-home-menu').addEventListener('click',()=>setExpanded(false),true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded){setExpanded(false,true);e.preventDefault();}});
 const resize=()=>{cancel();measure();};
 window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
 new ResizeObserver(measure).observe(panel);
 window.addEventListener('jalan:journey-start',()=>{currentRoute=null;progress=0;setExpanded(false);requestAnimationFrame(paint);});
 window.addEventListener('jalan:journey-stop',()=>setExpanded(false));
 window.addEventListener('jalan:route-cleared',()=>{currentRoute=null;progress=0;setExpanded(false);});
 window.addEventListener('jalan:route-change',paint);
 window.addEventListener('jalan:incidents-updated',()=>{if(expanded)paint();});
 window.addEventListener('jalan:gps-fix',()=>{if(expanded)requestAnimationFrame(paint);});
 // Reuse existing bounded traffic samples, including asynchronous completion,
 // expiration or key revocation. This view never makes a provider request.
 setInterval(()=>{if(expanded&&!document.hidden)paint();},1000);
 setExpanded(false);
})();
