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
 handle.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown');
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
 recent.innerHTML='<h2>Recent</h2><ol id="jalan-recent-list"><li class="jalan-recent-empty">Your recently selected destinations will appear here during this session.</li></ol>';
 sheet.append(handle,searchTrigger,header,results,quick,recent);document.body.append(sheet);
 const recentHeading=recent.querySelector('h2');
 const recentCredit=document.createElement('span');
 recentCredit.className='jalan-recent-credit';
 recentCredit.translate=false;
 recentCredit.textContent='© OpenStreetMap';
 window.JalanLaunch.mainScreenReady.then(()=>{
   const host=recent.querySelector('.jalan-recent-empty')||recentHeading;
   host.append(' ',recentCredit);
   // Count only the time the full label is in view on the foreground sheet.
   let remaining=5000,startedAt=null,timer,inView=false;
   const observer=new IntersectionObserver(entries=>{
     const entry=entries[entries.length-1];
     inView=entry.isIntersecting&&entry.intersectionRatio>=0.99;
     sync();
   },{threshold:[0,0.99]});
   function sync(){
     clearTimeout(timer);
     const now=performance.now();
     if(startedAt!==null)remaining-=now-startedAt;
     startedAt=null;
     if(remaining<=0){
       observer.disconnect();
       document.removeEventListener('visibilitychange',sync);
       recentCredit.remove();
       return;
     }
     if(!inView||document.hidden)return;
     // A menu or dialog can cover the credit without changing its intersection.
     const rect=recentCredit.getBoundingClientRect();
     if(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===recentCredit)startedAt=now;
     timer=setTimeout(sync,startedAt===null?200:Math.min(remaining,200));
   }
   document.addEventListener('visibilitychange',sync);
   observer.observe(recentCredit);
 });
 const menu=document.createElement('button');menu.id='jalan-home-menu';menu.type='button';
 menu.setAttribute('aria-label','Open JALAN menu');menu.setAttribute('aria-controls','jalan-home-menu-panel');
 menu.setAttribute('aria-expanded','false');menu.textContent='☰';
 const speed=document.createElement('div');speed.id='jalan-home-speed';
 speed.innerHTML='<span class="passenger-speed-reading" role="img" aria-label="Speed unavailable until reliable GPS"><strong id="jalan-home-speed-value">—</strong><small>km/h</small></span><span class="passenger-speed-limit" role="img" hidden></span>';
 const report=document.createElement('button');report.id='jalan-home-report';report.type='button';
 report.setAttribute('aria-label','Report road event (coming soon)');
 report.innerHTML='<span aria-hidden="true">⚠</span>';
 const notice=document.createElement('div');notice.id='jalan-home-notice';notice.className='hidden';
 notice.setAttribute('role','status');
 const menuPanel=document.createElement('section');menuPanel.id='jalan-home-menu-panel';
 menuPanel.className='hidden';menuPanel.setAttribute('aria-label','User menu');
 menuPanel.innerHTML='<div class="jalan-home-menu-head"><strong>JALAN menu</strong></div>'+
  '<div id="jalan-menu-sound"></div>'+
  '<label class="jalan-language-setting" translate="no"><span>Bahasa / Language</span>'+
  '<select id="passenger-language"><option value="en" lang="en">English</option>'+
  '<option value="ms" lang="ms">Bahasa Melayu</option></select></label>'+
  '<details id="passenger-navigation-settings"><summary>Navigation</summary><div class="jalan-navigation-view">'+
  '<label for="passenger-nav-zoom">Zoom <output id="passenger-nav-zoom-value" for="passenger-nav-zoom">80%</output></label>'+
  '<input id="passenger-nav-zoom" type="range" min="0" max="100" step="5" value="80">'+
  '<label for="passenger-nav-tilt">3D tilt <output id="passenger-nav-tilt-value" for="passenger-nav-tilt">100%</output></label>'+
  '<input id="passenger-nav-tilt" type="range" min="0" max="100" step="5" value="100"></div>'+
  '<label class="jalan-share-speed"><input id="passenger-share-speed" type="checkbox"> Allow sharing my speed, road and direction during this journey (off by default)</label>'+
  '<label class="passenger-nearby-consent"><input id="passenger-nearby-consent" type="checkbox"> Share my location for nearby community reports during this journey</label></details>'+
  '<div id="journey-toll-control" hidden><label class="jalan-toll-control"><span>Avoid tolls</span><input type="checkbox" role="switch" id="journey-avoid-tolls"></label><div id="journey-toll-feedback" class="jalan-toll-feedback" hidden><p role="status"></p><div></div></div></div>'+
  '<button type="button" id="passenger-about" aria-haspopup="dialog" aria-controls="passenger-about-dialog">About JALAN</button>'+
  '<button type="button" id="jalan-home-menu-close">Close</button>';
 $('passenger-voice').setAttribute('aria-haspopup','dialog');
 $('passenger-voice').setAttribute('aria-controls','passenger-sound-dialog');
 menuPanel.querySelector('#jalan-menu-sound').append($('passenger-voice'));
 // Retain internal status/action hooks for the navigation engine, outside the menu.
 $('passenger-journey-options').classList.add('hidden');
 document.body.append(menu,speed,report,notice,menuPanel);
 const language=$('passenger-language');
 language.value=window.JalanLanguage.code;
 language.addEventListener('change',()=>{
   window.JalanLanguage.set(language.value);
   if(window.JalanVoice.getState().recorded)window.JalanMalayAudio.unlock();
 });
 window.addEventListener('jalan:language-change',()=>{language.value=window.JalanLanguage.code;});
 const paintNavigation=()=>{
   const settings=window.JalanPassengerCamera.getSettings();
   for(const key of ['zoom','tilt']){$('passenger-nav-'+key).value=settings[key];$('passenger-nav-'+key+'-value').textContent=settings[key]+'%';}
 };
 for(const key of ['zoom','tilt'])$('passenger-nav-'+key).addEventListener('input',event=>window.JalanPassengerCamera.setSetting(key,Number(event.target.value)));
 window.addEventListener('jalan:navigation-view',paintNavigation);
 window.addEventListener('jalan:journey-start',paintNavigation);
 window.addEventListener('jalan:journey-stop',()=>requestAnimationFrame(paintNavigation));
 paintNavigation();
 const input=$('destination'),form=$('search-form'),list=$('jalan-recent-list');
 const recentRows=new Map();
 let recentDetailId=0;
 const routeSearchButton=$('passenger-search'),navigation=$('passenger-navigation');
 let routeSearch=null;
 let shortcuts;
 const recentVisibility=new IntersectionObserver(entries=>{
   for(const {target,isIntersecting} of entries){
     const entry=recentRows.get(target.dataset.recentKey);
     if(!entry||!isIntersecting||entry.loading)continue;
     entry.loading=true;
     window.JalanGooglePlaceSearch.showDetails(entry.place.googleId,entry.details,entry.controller.signal)
       .then(()=>{
         entry.row.classList.add('has-place-details');
         entry.fallback.hidden=true;
         recentVisibility.unobserve(target);
       })
       .catch(()=>{
         // Keep the exact destination selectable offline. Retry on its next appearance.
         entry.loading=false;entry.fallback.translate=true;entry.fallback.textContent=entry.place.name+' · Address unavailable';
       });
   }
 });
 function rememberRecent(place){
   const google=place.source==='google'&&Boolean(place.googleId);
   const key=google?'google:'+place.googleId:'point:'+place.point.join(',');
   let entry=recentRows.get(key);
   if(!entry){
     const row=document.createElement('li'),button=document.createElement('button');
     row.dataset.recentKey=key;button.type='button';
     entry={row,button,place};recentRows.set(key,entry);
     button.addEventListener('click',()=>{
       const p=entry.place;input.blur();
       selectDestinationPlace({lat:p.point[0],lon:p.point[1],name:p.name,display_name:p.label,googleId:p.googleId,source:p.source});
     });
     if(google){
       row.className='jalan-recent-google';
       entry.controller=new AbortController();
       entry.fallback=document.createElement('span');entry.fallback.translate=false;entry.fallback.textContent=place.label;
       entry.details=document.createElement('div');entry.details.id='jalan-recent-place-'+(++recentDetailId);
       button.append(entry.fallback);button.setAttribute('aria-describedby',entry.details.id);
       row.append(button,entry.details);
       recentVisibility.observe(row);
     }else row.append(button);
   }
   entry.place={...place,point:[...place.point]};
   if(google)entry.button.setAttribute('aria-label','Route to '+place.name);
   else {entry.button.translate=place.name==='Pinned location';entry.button.textContent=place.label;}
   const empty=list.querySelector('.jalan-recent-empty');
   if(empty?.contains(recentCredit))recentHeading.append(' ',recentCredit);
   empty?.remove();
   if(list.firstElementChild!==entry.row)list.prepend(entry.row);
   if(recentRows.size>7){
     const last=list.lastElementChild,old=recentRows.get(last.dataset.recentKey);
     recentVisibility.unobserve(last);old.controller?.abort();
     recentRows.delete(last.dataset.recentKey);last.remove();
   }
 }
 const setState=next=>{
   const state=['a','b','c'].includes(next)?next:'a';
   if(state!=='c'){shortcuts?.cancel();window.JalanDestinationSuggestions?.cancel();}
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
   shortcuts?.cancel();
   const saved=routeSearch;routeSearch=null;window.JalanDestinationSuggestions?.cancel();
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
   if(e.key==='Escape'&&shortcuts?.cancel(true)){e.preventDefault();return;}
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
 handle.addEventListener('keydown',event=>{
   if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
   event.preventDefault();
   const state=sheet.dataset.state;
   setState(event.key==='ArrowDown'?(state==='c'?'b':'a'):(state==='a'?'b':'c'));
 });
 searchTrigger.addEventListener('click',()=>{setState('c');input.focus({preventScroll:true});});
 input.addEventListener('focus',()=>setState('c'));
 form.addEventListener('submit',()=>setState('c'));
 shortcuts=installSavedPlaces({sheet,quick,recent,header,input,results,expand:()=>setState('c')});
 window.JalanPlaceShortcuts=shortcuts;
 const toggleMenu=visible=>{
   if(visible){shortcuts.cancel();window.JalanDestinationSuggestions?.cancel();window.JalanPassengerRouteInfo.close();notice.classList.add('hidden');}
   menuPanel.classList.toggle('hidden',!visible);
   menu.setAttribute('aria-expanded',String(visible));
   if(visible){$('passenger-navigation-settings').open=false;paintNavigation();menuPanel.scrollTop=0;$('jalan-home-menu-close').focus({preventScroll:true});}
 };
 window.JalanPassengerMenu={close:()=>toggleMenu(false)};
 document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&!menuPanel.classList.contains('hidden')){
     e.preventDefault();toggleMenu(false);menu.focus({preventScroll:true});
   }
 });
 menu.addEventListener('click',()=>toggleMenu(menuPanel.classList.contains('hidden')));
 $('jalan-home-menu-close').addEventListener('click',()=>{toggleMenu(false);menu.focus({preventScroll:true});});
 // Reporting remains an unfinished control; no placeholder popup or submission.
 window.addEventListener('jalan:destination-selected',event=>{
   const place=event.detail;
   if(!Array.isArray(place?.point)||place.point.length!==2||!place.point.every(Number.isFinite))return;
   rememberRecent(place);closeRouteSearch(false,false);
 });
 window.addEventListener('jalan:routes-rendered',()=>{shortcuts.cancel();closeRouteSearch(false,false);cancelGesture();sheet.classList.add('jalan-sheet-route');input.blur();});
 window.addEventListener('jalan:route-cleared',()=>{closeRouteSearch(false,false);cancelGesture();sheet.classList.remove('jalan-sheet-route');setState('a');});
 window.addEventListener('jalan:journey-start',()=>{shortcuts.cancel();closeRouteSearch(false,false);sheet.classList.add('jalan-sheet-route');toggleMenu(false);});
 window.addEventListener('jalan:journey-stop',()=>{toggleMenu(false);closeRouteSearch(false,false);sheet.classList.toggle('jalan-sheet-route',routes.length>0);});
 window.addEventListener('jalan:gps-fix',e=>{
   const d=e.detail,valid=d?.matched&&Number.isFinite(d.speedMps)&&d.speedMps>=0&&
     Number.isFinite(d.accuracy)&&d.accuracy<=75;
   const v=valid?String(Math.round(d.speedMps*3.6)):'—';
   $('jalan-home-speed-value').textContent=v;
   speed.firstElementChild.setAttribute('aria-label',valid?'Speed '+v+' kilometres per hour':'Speed unavailable until reliable GPS');
 });
 setState('a');
 // Offer shortcuts once on launch. Any touch, keyboard action or map interaction takes priority.
 const opening=new AbortController();
 const cancelOpening=()=>opening.abort();
 for(const type of ['pointerdown','touchstart','wheel','keydown','click','focusin']){
   window.addEventListener(type,cancelOpening,{capture:true,passive:true,signal:opening.signal});
 }
 window.JalanLaunch.mainScreenReady.then(shownAt=>{
   if(opening.signal.aborted)return;
   const timer=setTimeout(()=>{
     cancelOpening();
     if(!document.hidden && sheet.dataset.state==='a' && !sheet.classList.contains('jalan-sheet-route') &&
        !routeSearch && !routes.length && menuPanel.classList.contains('hidden')){
       setState('b');
     }
   },Math.max(0,500-(performance.now()-shownAt)));
   opening.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
 });
})();
