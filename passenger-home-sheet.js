/* JALAN Passenger home sheet: three stages; no route engine or privacy changes. */
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const $=id=>document.getElementById(id);
 const sheet=document.createElement('section');
 sheet.id='jalan-home-sheet';sheet.className='jalan-home-sheet';sheet.dataset.state='a';
 sheet.setAttribute('aria-label','Destination search bottom sheet');
 const handle=document.createElement('button');
 handle.type='button';handle.id='jalan-sheet-handle';handle.className='jalan-sheet-handle';
 handle.setAttribute('aria-label','Expand destination panel');
 handle.setAttribute('aria-expanded','false');
 handle.innerHTML='<span aria-hidden="true"></span>';
 const header=document.querySelector('.topbar'),results=$('results');
 const searchTrigger=document.createElement('button');
 searchTrigger.id='jalan-search-trigger';searchTrigger.type='button';
 searchTrigger.setAttribute('aria-label','Search destination, expand full search panel');
 searchTrigger.innerHTML='<span aria-hidden="true">⌕</span><strong>Where to?</strong>';
 const quick=document.createElement('div');quick.className='jalan-sheet-quick';
 quick.innerHTML='<button type="button" data-shortcut="home">🏠 <strong>Home</strong></button>'+
  '<button type="button" data-shortcut="work">💼 <strong>Work</strong></button>'+
  '<button type="button" data-shortcut="new">＋ <strong>New</strong></button>';
 const recent=document.createElement('section');recent.className='jalan-sheet-recent';
 recent.innerHTML='<h2>Recent</h2><ol id="jalan-recent-list"></ol>';
 sheet.append(handle,searchTrigger,header,results,quick,recent);document.body.append(sheet);
 const menu=document.createElement('button');menu.id='jalan-home-menu';menu.type='button';
 menu.setAttribute('aria-label','Open JALAN menu');menu.setAttribute('aria-controls','jalan-home-menu-panel');
 menu.setAttribute('aria-expanded','false');menu.textContent='☰';
 const speed=document.createElement('div');speed.id='jalan-home-speed';
 speed.setAttribute('aria-label','Speed unavailable until reliable GPS');
 speed.innerHTML='<strong id="jalan-home-speed-value">—</strong><small>km/h</small>';
 const report=document.createElement('button');report.id='jalan-home-report';report.type='button';
 report.setAttribute('aria-label','Report road event (coming soon)');
 report.innerHTML='<span aria-hidden="true">⚠</span>';
 const notice=document.createElement('div');notice.id='jalan-home-notice';notice.className='hidden';
 notice.setAttribute('role','status');
 const menuPanel=document.createElement('section');menuPanel.id='jalan-home-menu-panel';
 menuPanel.className='hidden';menuPanel.setAttribute('aria-label','User menu');
 menuPanel.innerHTML='<div class="jalan-home-menu-head"><strong>JALAN menu</strong>'+
  '<button type="button" id="jalan-home-menu-close" aria-label="Close user menu">✕</button></div>'+
  '<button type="button" data-menu="settings">Routing settings</button>'+
  '<section class="jalan-voice-settings" aria-label="Navigation voice"><h2>Navigation voice</h2>'+
  '<label for="passenger-voice-choice">Voice</label><select id="passenger-voice-choice" aria-describedby="passenger-voice-status"></select>'+
  '<button type="button" id="passenger-voice-preview">Play sample</button>'+
  '<p id="passenger-voice-status" role="status"></p></section>';
 menuPanel.append($('passenger-journey-options'));
 document.body.append(menu,speed,report,notice,menuPanel);
 const voiceChoice=$('passenger-voice-choice'),voicePreview=$('passenger-voice-preview'),voiceStatus=$('passenger-voice-status');
 const renderVoices=()=>{
   const state=window.JalanVoice?.getState();
   voiceChoice.replaceChildren(new Option('Automatic · device default',''));
   for(const v of state?.voices||[])voiceChoice.add(new Option(v.name+' · '+v.lang,v.id));
   voiceChoice.value=state?.selected||'';
   voiceChoice.disabled=!state?.supported;voicePreview.disabled=!state?.supported;
   voiceStatus.textContent=!state?.supported?'Voice playback is unavailable in this browser.':
     state.unavailable?'Saved voice is unavailable here. Using the device default.':
     !state.voices.length?'Using the device default. Additional English voices may appear when the device loads them.':
     !state.saved?'Voice selected for this visit. Browser storage is blocked.':
     'English voices available on this device. Your choice is saved for future visits.';
 };
 voiceChoice.addEventListener('change',()=>window.JalanVoice?.choose(voiceChoice.value));
 voicePreview.addEventListener('click',()=>{
   voiceStatus.textContent=window.JalanVoice?.preview()?'Playing sample…':'Could not play a sample in this browser.';
 });
 window.addEventListener('jalan:voices-changed',renderVoices);
 window.addEventListener('jalan:voice-preview',e=>{
   if(e.detail?.state==='error')voiceStatus.textContent='Sample could not play. Try another available voice.';
   else renderVoices();
 });
 renderVoices();
 const input=$('destination'),form=$('search-form'),list=$('jalan-recent-list');
 const recentNames=[];
 const routeSearchButton=$('passenger-search'),navigation=$('passenger-navigation');
 let routeSearch=null;
 const showNotice=message=>{
   notice.textContent=message;notice.classList.remove('hidden');
 };
 const renderRecent=()=>{
   list.replaceChildren();
   if(!recentNames.length){
     const empty=document.createElement('li');
     empty.className='jalan-recent-empty';
     empty.textContent='Your recently selected destinations will appear here during this session.';
     list.append(empty);return;
   }
   for(const name of recentNames){
     const li=document.createElement('li'),btn=document.createElement('button');
     btn.type='button';btn.textContent=name;
     btn.addEventListener('click',()=>{setState('c');input.value=name;input.focus();form.requestSubmit();});
     li.append(btn);list.append(li);
   }
 };
 const setState=next=>{
   const state=['a','b','c'].includes(next)?next:'a';
   if(routeSearch&&state!=='c'){closeRouteSearch();return;}
   if(state!=='c'&&document.activeElement===input)input.blur();
   sheet.dataset.state=state;
   header.inert=state!=='c';
   handle.setAttribute('aria-expanded',String(state!=='a'));
   handle.setAttribute('aria-label',routeSearch?'Return to current route':
     state==='c'?'Collapse destination panel':'Expand destination panel');
   sheet.setAttribute('aria-label','Destination search bottom sheet · state '+state.toUpperCase());
 };
 // Opening search is a temporary layer over the active journey. It must not
 // call clearRoute(), stop GPS, select a route or change the map camera.
 function closeRouteSearch(restoreInput=true,restoreFocus=true){
   if(!routeSearch)return;
   const saved=routeSearch;routeSearch=null;
   cancelGesture();input.blur();
   if(restoreInput)input.value=saved.inputValue;
   results.classList.add('hidden');
   document.body.classList.remove('passenger-route-search');
   navigation.inert=false;
   sheet.classList.add('jalan-sheet-route');
   routeSearchButton.setAttribute('aria-expanded','false');
   setState('a');
   if(restoreFocus&&document.body.classList.contains('passenger-guiding'))
     routeSearchButton.focus({preventScroll:true});
 }
 routeSearchButton.addEventListener('click',()=>{
   if(routeSearch||!document.body.classList.contains('passenger-guiding')||!routes[selectedRoute])return;
   routeSearch={inputValue:input.value};
   input.value='';results.replaceChildren();results.classList.add('hidden');
   toggleMenu(false);
   sheet.classList.remove('jalan-sheet-route');
   document.body.classList.add('passenger-route-search');
   routeSearchButton.setAttribute('aria-expanded','true');
   setState('c');input.focus({preventScroll:true});
   navigation.inert=true;
 });
 document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&routeSearch){e.preventDefault();closeRouteSearch();}
 });
 // One gesture controller for the whole sheet, including child buttons and
 // list rows. A/B swipes resize the panel; C gives native lists scroll priority.
 // Touch events are separate from mouse/pen pointers because native scrolling
 // can cancel PointerEvents before a C-at-top downward swipe finishes.
 let gesture=null,suppressClickUntil=0;
 const beginGesture=(point,target,kind,id)=>{
   if(sheet.classList.contains('jalan-sheet-route')||
      (document.body.classList.contains('passenger-guiding')&&!routeSearch))return;
   const scroller=target.closest?.('.results,.jalan-sheet-recent');
   gesture={x:point.clientX,y:point.clientY,at:sheet.dataset.state,kind,id,
     atTop:!scroller||scroller.scrollTop<=1,claimed:false};
   suppressClickUntil=0;
 };
 const cancelGesture=()=>{gesture=null;sheet.classList.remove('jalan-sheet-dragging');};
 const moveGesture=(point,event)=>{
   if(!gesture)return;
   const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
   if(!gesture.claimed){
     if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
     // Horizontal edits/gestures never change the panel stage. Once a gesture
     // belongs to list scrolling, it cannot collapse the panel midway through.
     if(Math.abs(dy)<Math.abs(dx)*1.2||
        (gesture.at==='c'&&(dy<0||!gesture.atTop))){cancelGesture();return;}
     gesture.claimed=true;sheet.classList.add('jalan-sheet-dragging');
     if(gesture.kind==='pointer')sheet.setPointerCapture?.(gesture.id);
   }
   if(event.cancelable)event.preventDefault();
 };
 const endGesture=(point,event)=>{
   if(!gesture)return;
   moveGesture(point,event);
   if(!gesture)return;
   const {at,y,claimed}=gesture,delta=point.clientY-y;
   cancelGesture();
   if(!claimed)return;
   // A swipe over New, a recent row or a search result must not also select it.
   suppressClickUntil=Date.now()+700;
   if(event.cancelable)event.preventDefault();
   if(delta< -32)setState(at==='a'?'b':'c');
   else if(delta>32)setState(at==='c'?'b':'a');
 };
 sheet.addEventListener('click',e=>{
   if(e.detail!==0&&Date.now()<suppressClickUntil){
     e.preventDefault();e.stopImmediatePropagation();
   }
 },true);
 sheet.addEventListener('pointerdown',e=>{
   if(e.pointerType==='touch'||e.button!==0||e.isPrimary===false)return;
   beginGesture(e,e.target,'pointer',e.pointerId);
 });
 window.addEventListener('pointermove',e=>{
   if(gesture?.kind==='pointer'&&gesture.id===e.pointerId)moveGesture(e,e);
 });
 window.addEventListener('pointerup',e=>{
   if(gesture?.kind==='pointer'&&gesture.id===e.pointerId)endGesture(e,e);
 });
 window.addEventListener('pointercancel',e=>{
   if(gesture?.kind==='pointer'&&gesture.id===e.pointerId)cancelGesture();
 });
 sheet.addEventListener('touchstart',e=>{
   if(e.touches.length!==1){cancelGesture();return;}
   const touch=e.touches[0];beginGesture(touch,e.target,'touch',touch.identifier);
 },{passive:true});
 sheet.addEventListener('touchmove',e=>{
   if(e.touches.length!==1){cancelGesture();return;}
   if(gesture?.kind==='touch'&&gesture.id===e.touches[0].identifier)
     moveGesture(e.touches[0],e);
 },{passive:false});
 sheet.addEventListener('touchend',e=>{
   if(gesture?.kind!=='touch')return;
   const touch=Array.from(e.changedTouches).find(t=>t.identifier===gesture.id);
   if(touch)endGesture(touch,e);
 },{passive:false});
 sheet.addEventListener('touchcancel',cancelGesture);
 // Ordinary taps and keyboard activation keep their existing direct actions.
 handle.addEventListener('click',()=>{
   const state=sheet.dataset.state;setState(state==='a'?'b':state==='b'?'c':'b');
 });
 searchTrigger.addEventListener('click',()=>{setState('c');input.focus({preventScroll:true});});
 input.addEventListener('focus',()=>setState('c'));
 form.addEventListener('submit',()=>setState('c'));
 quick.addEventListener('click',e=>{
   const shortcut=e.target.closest('button[data-shortcut]')?.dataset.shortcut;
   if(!shortcut)return;
   if(shortcut==='new'){setState('c');input.focus();}
   else showNotice((shortcut==='home'?'Home':'Work')+' shortcut is a placeholder. Address setup comes later.');
 });
 const toggleMenu=visible=>{
   if(visible)$('passenger-turn-close').click();
   menuPanel.classList.toggle('hidden',!visible);
   menu.setAttribute('aria-expanded',String(visible));
   if(visible){menuPanel.scrollTop=0;$('jalan-home-menu-close').focus({preventScroll:true});}
 };
 window.JalanPassengerMenu={close:()=>toggleMenu(false)};
 document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&!menuPanel.classList.contains('hidden')){
     e.preventDefault();toggleMenu(false);menu.focus({preventScroll:true});
   }
 });
 menu.addEventListener('click',()=>toggleMenu(menuPanel.classList.contains('hidden')));
 $('jalan-home-menu-close').addEventListener('click',()=>{toggleMenu(false);menu.focus({preventScroll:true});});
 menuPanel.addEventListener('click',e=>{
   const action=e.target.closest('button[data-menu]')?.dataset.menu;
   if(action==='settings'){$('passenger-settings-top').click();toggleMenu(false);}
   else if(action)showNotice((action==='profile'?'User profile':'Help')+' is coming soon.');
 });
 report.addEventListener('click',()=>showNotice('Road reporting button is a placeholder. No report was submitted.'));
 results.addEventListener('click',e=>{
   const button=e.target.closest('button');
   if(!button)return;
   const name=button.textContent?.trim();
   if(!name)return;
   recentNames.unshift(name);
   const unique=[...new Set(recentNames)].slice(0,7);
   recentNames.splice(0,recentNames.length,...unique);
   renderRecent();
   // A deliberate result selection keeps the new query and uses normal routing.
   closeRouteSearch(false,false);
 },true);
 window.addEventListener('jalan:routes-rendered',()=>{closeRouteSearch(false,false);cancelGesture();sheet.classList.add('jalan-sheet-route');input.blur();});
 window.addEventListener('jalan:route-cleared',()=>{closeRouteSearch(false,false);cancelGesture();sheet.classList.remove('jalan-sheet-route');setState('a');});
 window.addEventListener('jalan:journey-start',()=>{closeRouteSearch(false,false);sheet.classList.add('jalan-sheet-route');toggleMenu(false);});
 window.addEventListener('jalan:journey-stop',()=>{toggleMenu(false);closeRouteSearch(false,false);sheet.classList.toggle('jalan-sheet-route',routes.length>0);});
 window.addEventListener('jalan:gps-fix',e=>{
   const d=e.detail,valid=d?.matched&&Number.isFinite(d.speedMps)&&d.speedMps>=0&&
     Number.isFinite(d.accuracy)&&d.accuracy<=75;
   const v=valid?String(Math.round(d.speedMps*3.6)):'—';
   $('jalan-home-speed-value').textContent=v;
   speed.setAttribute('aria-label',valid?'Speed '+v+' kilometres per hour':'Speed unavailable until reliable GPS');
 });
 renderRecent();setState('a');
})();
