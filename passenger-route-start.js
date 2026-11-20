/* Route choice actions: one automatic Go after seven seconds of visible idle. */
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const el=id=>document.getElementById(id),go=el('passenger-go'),fill=el('passenger-go-fill'),
  panel=el('passenger-overview'),pointers=new Set(),keys=new Set();
 let timer=null,animation=null,touches=0,suspended=false,attempted=false,choice=null,choices=null;
 const visible=id=>{const node=el(id);return node&&!node.classList.contains('hidden');};
 const selected=()=>typeof routes!=='undefined'?routes[selectedRoute]:null;
 function eligible(){
  const route=selected();
  return !window.JalanTollChoices?.manualReview&&!document.body.classList.contains('passenger-pin-open')&&!document.body.classList.contains('passenger-pin-routing')&&!suspended&&!document.hidden&&!attempted&&!pointers.size&&!keys.size&&!touches&&
   !go.disabled&&route&&Number.isFinite(route.duration)&&route.geometry?.coordinates?.length>=2&&
   visible('passenger-overview')&&panel.dataset.collapsed!=='true'&&
   !panel.classList.contains('passenger-route-dragging')&&
   !document.body.classList.contains('passenger-guiding')&&
   !document.body.classList.contains('passenger-route-search')&&
   !document.body.classList.contains('passenger-modal-open')&&
   !visible('jalan-home-menu-panel')&&!visible('passenger-setup')&&!visible('jalan-home-notice');
 }
 function cancel(){
  clearTimeout(timer);timer=null;animation?.cancel();animation=null;
  fill.style.transform='scaleX(1)';
 }
 function restart(){
  cancel();if(!eligible())return;
  const route=selected(),deadline=performance.now()+7000;
  animation=fill.animate([{transform:'scaleX(1)'},{transform:'scaleX(0)'}],
   {duration:7000,easing:'linear',fill:'forwards'});
  function startWhenDue(){
   timer=null;
   if(!eligible()||selected()!==route){cancel();return;}
   const remaining=deadline-performance.now();
   if(remaining>0){timer=setTimeout(startWhenDue,Math.ceil(remaining));return;}
   // Use the same Go handler as a tap, exactly once even if GPS cannot start.
   go.click();
  }
  timer=setTimeout(startWhenDue,7000);
 }
 go.addEventListener('click',()=>{attempted=true;cancel();},true);
 el('passenger-route-cancel').addEventListener('click',()=>{
  cancel();window.JalanPassengerJourney.stop();
 });
 const passive={capture:true,passive:true};
 document.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);restart();},passive);
 for(const name of ['pointerup','pointercancel'])window.addEventListener(name,e=>{
  pointers.delete(e.pointerId);restart();
 },passive);
 for(const name of ['touchstart','touchmove','touchend','touchcancel'])window.addEventListener(name,e=>{
  touches=e.touches.length;restart();
 },passive);
 document.addEventListener('keydown',e=>{keys.add(e.code||e.key);restart();},passive);
 window.addEventListener('keyup',e=>{keys.delete(e.code||e.key);restart();},passive);
 for(const name of ['pointermove','wheel','scroll','input','change','click','focusin'])
  document.addEventListener(name,restart,passive);
 // Includes inertial movement after release and native vector-map gestures.
 map.on('move zoom moveend zoomend',restart);
 window.addEventListener('jalan:vector-gesture',restart);
 window.addEventListener('jalan:vector-gesture-end',restart);
 window.addEventListener('jalan:routes-rendered',()=>{
  if(selected()!==choice||routes!==choices){choice=selected();choices=routes;attempted=false;}
  restart();
 });
 window.addEventListener('jalan:route-cleared',()=>{
  cancel();choice=null;choices=null;attempted=false;
 });
 window.addEventListener('jalan:journey-start',cancel);
 const pause=()=>{suspended=true;pointers.clear();keys.clear();touches=0;cancel();};
 const resume=()=>{suspended=false;restart();};
 window.addEventListener('blur',pause);window.addEventListener('focus',resume);
 window.addEventListener('pagehide',pause);window.addEventListener('pageshow',resume);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else resume();});
 const observer=new MutationObserver(restart);
 for(const node of [document.body,panel,el('jalan-home-menu-panel'),el('passenger-setup'),el('jalan-home-notice'),go])
  if(node)observer.observe(node,{attributes:true,attributeFilter:['class','data-collapsed','disabled']});
})();
