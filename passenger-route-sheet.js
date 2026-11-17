/* JALAN route choice sheet: presentation only; never mutate route/GPS/camera. */
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const panel=document.getElementById('passenger-overview'),handle=document.getElementById('passenger-route-handle'),
  content=document.getElementById('passenger-route-content'),list=document.getElementById('passenger-route-list');
 let collapsed=false,gesture=null,suppressClickUntil=0,displayedRoutes=null;
 function setCollapsed(value){
  collapsed=value;panel.dataset.collapsed=String(value);
  handle.setAttribute('aria-expanded',String(!value));
  handle.setAttribute('aria-label',value?'Expand route choices':'Collapse route choices');
  if(value&&content.contains(document.activeElement))handle.focus({preventScroll:true});
  content.inert=value;content.setAttribute('aria-hidden',String(value));
 }
 function cancel(){
  if(gesture?.claimed)suppressClickUntil=Date.now()+700;
  gesture=null;panel.classList.remove('passenger-route-dragging');
  panel.style.removeProperty('--route-sheet-drag');
 }
 function begin(point,target,kind,id){
  if(panel.classList.contains('hidden')||document.body.classList.contains('passenger-guiding'))return;
  const peek=parseFloat(getComputedStyle(panel).getPropertyValue('--route-sheet-peek'))||72;
  const limit=Math.max(0,panel.getBoundingClientRect().height-peek);
  gesture={x:point.clientX,y:point.clientY,kind,id,claimed:false,collapsed,limit,
   start:collapsed?limit:0,onList:list.contains(target),atTop:list.scrollTop<=1};
  suppressClickUntil=0;
 }
 function move(point,event){
  if(!gesture)return;
  const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
  if(!gesture.claimed){
   if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
   // Expanded alternatives retain native scrolling. Only a downward drag
   // starting at the list's top can tuck the panel away.
   if(Math.abs(dy)<Math.abs(dx)*1.2||
      (!gesture.collapsed&&gesture.onList&&(dy<0||!gesture.atTop))){cancel();return;}
   gesture.claimed=true;panel.classList.add('passenger-route-dragging');
   if(gesture.kind==='pointer')panel.setPointerCapture?.(gesture.id);
  }
  panel.style.setProperty('--route-sheet-drag',Math.max(0,Math.min(gesture.limit,gesture.start+dy))+'px');
  if(event.cancelable)event.preventDefault();
 }
 function end(point,event){
  if(!gesture)return;
  move(point,event);if(!gesture)return;
  const g=gesture,dy=point.clientY-g.y;
  cancel();
  if(!g.claimed)return;
  if(event.cancelable)event.preventDefault();
  const threshold=Math.min(42,g.limit/3);
  setCollapsed(g.collapsed?!(dy< -threshold):dy>threshold);
 }
 panel.addEventListener('click',event=>{
  if(event.detail!==0&&Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 handle.addEventListener('click',()=>setCollapsed(!collapsed));
 panel.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.button!==0||event.isPrimary===false)return;
  begin(event,event.target,'pointer',event.pointerId);
 });
 window.addEventListener('pointermove',event=>{
  if(gesture?.kind==='pointer'&&gesture.id===event.pointerId)move(event,event);
 });
 window.addEventListener('pointerup',event=>{
  if(gesture?.kind==='pointer'&&gesture.id===event.pointerId)end(event,event);
 });
 window.addEventListener('pointercancel',event=>{
  if(gesture?.kind==='pointer'&&gesture.id===event.pointerId)cancel();
 });
 panel.addEventListener('touchstart',event=>{
  if(event.touches.length!==1){cancel();return;}
  const point=event.touches[0];begin(point,event.target,'touch',point.identifier);
 },{passive:true});
 panel.addEventListener('touchmove',event=>{
  if(event.touches.length!==1){cancel();return;}
  if(gesture?.kind==='touch'&&gesture.id===event.touches[0].identifier)move(event.touches[0],event);
 },{passive:false});
 panel.addEventListener('touchend',event=>{
  const point=Array.from(event.changedTouches).find(p=>p.identifier===gesture?.id);
  if(gesture?.kind==='touch'&&point)end(point,event);
 },{passive:false});
 panel.addEventListener('touchcancel',cancel,{passive:true});
 window.addEventListener('resize',cancel);
 window.visualViewport?.addEventListener('resize',cancel);
 window.addEventListener('jalan:routes-rendered',()=>{
  cancel();
  if(routes!==displayedRoutes){displayedRoutes=routes;setCollapsed(false);}
 });
 window.addEventListener('jalan:route-cleared',()=>{cancel();displayedRoutes=null;setCollapsed(false);});
 window.addEventListener('jalan:journey-start',cancel);
 window.addEventListener('jalan:journey-stop',()=>{cancel();setCollapsed(false);});
 setCollapsed(false);
})();
