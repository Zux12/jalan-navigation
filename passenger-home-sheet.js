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
 menu.setAttribute('aria-label','Open user menu');menu.textContent='☰';
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
  '<button type="button" data-menu="profile">User profile · Coming soon</button>'+
  '<button type="button" data-menu="settings">Routing settings</button>'+
  '<button type="button" data-menu="help">Help · Coming soon</button>'+
  '<p>Passenger preview only. No account profile is connected.</p>';
 document.body.append(menu,speed,report,notice,menuPanel);
 const input=$('destination'),form=$('search-form'),list=$('jalan-recent-list');
 const recentNames=[];
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
   sheet.dataset.state=state;
   header.inert=state!=='c';
   handle.setAttribute('aria-expanded',String(state!=='a'));
   handle.setAttribute('aria-label',state==='c'?'Collapse destination panel':'Expand destination panel');
   sheet.setAttribute('aria-label','Destination search bottom sheet · state '+state.toUpperCase());
 };
 let dragStart=null;
 const start=e=>{if(e.button!==undefined&&e.button!==0)return;
   dragStart={y:e.clientY,at:sheet.dataset.state};
   if(e.pointerId!==undefined)handle.setPointerCapture?.(e.pointerId);
 };
 const end=e=>{
   if(!dragStart)return;const delta=e.clientY-dragStart.y,prior=dragStart.at;dragStart=null;
   if(delta< -32)setState(prior==='a'?'b':'c');
   else if(delta>32)setState(prior==='c'?'b':'a');
   else setState(prior==='a'?'b':prior==='b'?'c':'b');
 };
 handle.addEventListener('pointerdown',start);
 handle.addEventListener('pointerup',end);
 handle.addEventListener('pointercancel',()=>{dragStart=null;});
 // A/B use a stationary search trigger; after its click the real input
 // appears in C and receives focus, without moving the touch target mid-tap.
 searchTrigger.addEventListener('click',()=>{
   setState('c');input.focus({preventScroll:true});
 });
 input.addEventListener('focus',()=>setState('c'));
 form.addEventListener('submit',()=>setState('c'));
 sheet.addEventListener('pointerdown',e=>{
   if(e.target===sheet&&e.pointerType==='touch')start(e);
 });
 sheet.addEventListener('pointerup',e=>{
   if(dragStart&&e.target===sheet)end(e);
 });
 quick.addEventListener('click',e=>{
   const shortcut=e.target.closest('button[data-shortcut]')?.dataset.shortcut;
   if(!shortcut)return;
   if(shortcut==='new'){setState('c');input.focus();}
   else showNotice((shortcut==='home'?'Home':'Work')+' shortcut is a placeholder. Address setup comes later.');
 });
 const toggleMenu=visible=>menuPanel.classList.toggle('hidden',!visible);
 menu.addEventListener('click',()=>toggleMenu(menuPanel.classList.contains('hidden')));
 $('jalan-home-menu-close').addEventListener('click',()=>toggleMenu(false));
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
 },true);
 window.addEventListener('jalan:routes-rendered',()=>{sheet.classList.add('jalan-sheet-route');input.blur();});
 window.addEventListener('jalan:route-cleared',()=>{sheet.classList.remove('jalan-sheet-route');setState('a');});
 window.addEventListener('jalan:journey-start',()=>{sheet.classList.add('jalan-sheet-route');toggleMenu(false);});
 window.addEventListener('jalan:journey-stop',()=>{sheet.classList.toggle('jalan-sheet-route',routes.length>0);});
 window.addEventListener('jalan:gps-fix',e=>{
   const d=e.detail,valid=d?.matched&&Number.isFinite(d.speedMps)&&d.speedMps>=0&&
     Number.isFinite(d.accuracy)&&d.accuracy<=75;
   const v=valid?String(Math.round(d.speedMps*3.6)):'—';
   $('jalan-home-speed-value').textContent=v;
   speed.setAttribute('aria-label',valid?'Speed '+v+' kilometres per hour':'Speed unavailable until reliable GPS');
 });
 renderRecent();setState('a');
})();
