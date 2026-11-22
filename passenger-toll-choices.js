// Trip-scoped controls. Existing GPS guidance stays live while a replacement is checked.
(() => {
 'use strict';
 if(!passengerMode)return;
 const el=id=>document.getElementById(id),go=el('passenger-go'),list=el('passenger-route-list');
 const plan=el('passenger-avoid-tolls'),journey=el('journey-avoid-tolls');
 let job=null,phase='',wanted=false,manualReview=false,original=null,source=null;
 const selected=()=>routes[selectedRoute];
 const guiding=()=>!!window.JalanGPS.getState().active;
 function paint(){
  const active=guiding(),blocked=!!phase&&!active;
  const pendingSelection=phase&&(!active||phase==='loading');
  for(const input of [plan,journey])input.checked=pendingSelection?wanted:!!selected()?.tollPolicy;
  el('journey-toll-control').hidden=!active;
  if(blocked)el('passenger-route-title').textContent='Choose your route';
  go.disabled=blocked;
  list.hidden=blocked;
  go.hidden=blocked;
  for(const [box,inUse] of [[el('passenger-toll-feedback'),!active],[el('journey-toll-feedback'),active]]){
   box.hidden=!inUse||!phase;
   if(box.hidden)continue;
   box.querySelector('p').textContent={
    loading:wanted?'Finding toll-free routes…':'Finding routes…',
    tolls:'All routes found have tolls.',
    unknown:wanted?'Could not confirm a toll-free route.':'Could not load routes.',
    gps:'Waiting for your current location.'
   }[phase];
   if(active&&phase!=='loading'){
    const detail=document.createElement('span');detail.textContent='Continuing on your current route.';
    box.querySelector('p').append(' ',detail);
   }
   const actions=box.querySelector('div');actions.replaceChildren();
   function button(label,fn){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;actions.append(b);
   }
   if(phase==='unknown'||phase==='gps')button('Retry',()=>change(wanted));
   if(phase!=='loading'&&!active&&wanted)
    button(phase==='tolls'?'Show routes with tolls':'Show all routes',()=>change(false,true));
   if(active&&phase!=='loading')button('Keep current route',reset);
  }
 }
 function reset(){
  job?.abort();job=null;phase='';source=null;manualReview=false;
  paint();
 }
 function keepAccess(candidates,old){
  if(old.pinnedDestinationAccess)for(const route of candidates)route.pinnedDestinationAccess=old.pinnedDestinationAccess;
 }
 async function change(avoid,review=false){
  const old=selected();if(!old||!destination)return;
  const active=guiding(),state=window.JalanGPS.getState();
  const from=active?(state.gpsReliable&&state.gpsFixAgeMs<=10000?state.gpsPosition:null):startPoint;
  const target=destination,via=old.pinnedStop?.point;
  job?.abort();const controller=new AbortController();job=controller;
  window.dispatchEvent(new Event('jalan:toll-choice-changing'));
  wanted=avoid;source=old;phase='loading';manualReview=review;paint();
  if(!from){phase='gps';job=null;paint();return;}
  if(!active&&!old.tollPolicy&&!original)original={choices:routes,via,from:[...from],target};
  const signature=window.JalanStationRoute?.signature(old);
  if(original&&original.choices.includes(old))original.signature=signature;
  const cached=original?.signature===signature&&!active&&original?.target===target&&String(original.via)===String(via)&&
    String(original.from)===String(from)?original.choices:null;
  const current=()=>job===controller&&destination===target&&selected()===old&&guiding()===active;
  const timer=setTimeout(()=>controller.abort(),18000);
  try{
   let candidates;
   if(!avoid&&cached)candidates=cached;
   else{
    try{
     candidates=await requestDrivingRoutes(from,target,{signal:controller.signal,via,stops:window.JalanStationRoute?.managed(old),tollPolicy:avoid?{}:undefined});
    }catch(error){
     // A verified free choice already on this sheet is usable if a second lookup fails.
     const knownFree=avoid&&!old.stationItinerary&&cached?.filter(r=>r.tolls===false);
     if(!knownFree?.length)throw error;
     candidates=window.JalanTollPolicy.check(knownFree.map(r=>({...r,pinnedStop:r.pinnedStop?
       {...r.pinnedStop,onward:{...r.pinnedStop.onward}}:undefined})),{});
    }
   }
   if(!current())return;
   if(!candidates?.length)throw Error();
   keepAccess(candidates,old);
   if(active){
    const best=candidates.slice().sort((a,b)=>a.duration-b.duration)[0];
    if(!window.JalanGPS.applyPinnedRoute(best,from,'toll-preference'))throw Error();
    window.dispatchEvent(new CustomEvent('jalan:route-change',{detail:{reason:'toll-preference',provider:best.provider}}));
   }else{
    routes=candidates;selectedRoute=0;phase='';source=null;paint();renderRoutes();
   }
   phase='';source=null;paint();window.JalanTomTom?.refreshRouteIncidents?.(true);
  }catch(error){
   if(current()){phase=error.tollConflict?'tolls':'unknown';paint();}
  }finally{clearTimeout(timer);if(job===controller)job=null;}
 }
 for(const input of [plan,journey])input.addEventListener('change',()=>change(input.checked));
 window.addEventListener('jalan:route-cleared',()=>{original=null;reset();});
 window.addEventListener('jalan:journey-start',()=>{original=null;reset();});
 window.addEventListener('jalan:journey-stop',()=>{original=null;reset();});
 window.addEventListener('jalan:routes-rendered',()=>{
  if(source&&selected()!==source)reset();else paint();
  if(original&&(String(original.via)!==String(selected()?.pinnedStop?.point)||original.signature!==window.JalanStationRoute?.signature(selected())))original=null;
 });
 for(const [id,event] of [['tt-primary','change'],['tt-key','input'],['tt-remove-key','click']])
  el(id)?.addEventListener(event,()=>{original=null;if(phase)change(wanted);});
 window.JalanTollChoices={get blocked(){return !!phase&&!guiding();},get manualReview(){return manualReview;},
  choose(){manualReview=false;}};
 paint();
})();
