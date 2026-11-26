// The native iPhone build supplies the location service before the map loads.
(() => {
 'use strict';
 const native=window.JalanNativeLocation;
 if(!native)return;
 const el=id=>document.getElementById(id);
 const handoffKey='jalan-iphone-settings-destination-v1';
 const card=document.createElement('section');
 card.id='iphone-location-destination';card.hidden=true;
 card.innerHTML='<strong translate="no"></strong><p role="status" hidden></p><div>'+
   '<button type="button" class="jalan-dialog-ok">Go</button>'+
   '<button type="button" class="jalan-dialog-secondary">Cancel</button></div>';
 const dialog=document.createElement('dialog');
 dialog.className='jalan-menu-dialog';dialog.setAttribute('aria-labelledby','iphone-location-title');
 dialog.innerHTML='<h2 id="iphone-location-title">Turn on location to start navigation</h2>'+
   '<p>JALAN needs your location to follow your vehicle and tell you when to turn.</p>'+
   '<button type="button" class="jalan-dialog-ok">Open Settings</button>'+
   '<button type="button" class="jalan-dialog-secondary">Keep browsing</button>';
 document.body.append(card,dialog);
 const notice=card.querySelector('[role=status]'),go=card.querySelector('button');
 let selected=null,pending=null,working=null,returning=false;
 function forget(){try{localStorage.removeItem(handoffKey);}catch{}}
 function hide(){
   pending=null;working=null;returning=false;card.hidden=true;go.disabled=false;
   document.body.classList.remove('iphone-location-planning');
   if(dialog.open)dialog.close();
 }
 function say(text){notice.textContent=text;notice.hidden=!text;}
 function offer(place){
   pending=place;card.hidden=false;go.disabled=false;say('');
   card.querySelector('strong').textContent=place.name;
   document.body.classList.add('iphone-location-planning');
 }
 function ask(){
   if(!dialog.open){dialog.showModal();dialog.querySelector('.jalan-dialog-secondary').focus();}
 }
 function rememberForSettings(){
   const p=pending||(selected&&destination&&selected.point?.every((v,i)=>v===destination[i])?selected:null)||
     (destination&&{point:destination,name:destinationName});
   if(!p)return;
   const place=p.googleId?{googleId:p.googleId,searchText:p.searchText} : {point:p.point,name:p.name,label:p.label};
   try{localStorage.setItem(handoffKey,JSON.stringify({at:Date.now(),place}));}catch{}
 }
 dialog.querySelector('.jalan-dialog-ok').addEventListener('click',()=>{
   rememberForSettings();returning=true;dialog.close();native.openSettings();
 });
 dialog.querySelector('.jalan-dialog-secondary').addEventListener('click',()=>dialog.close());

 async function plan(){
   const p=pending;
   if(!p||working)return;
   if(native.permission==='denied'){ask();return;}
   working=p;go.disabled=true;say('Finding your starting location…');
   const controller=new AbortController();
   const cancel=()=>controller.abort();
   window.addEventListener('jalan:route-cleared',cancel,{once:true});
   try{
     const origin=await getGPS();
     if(pending!==p||controller.signal.aborted)return;
     let point=p.point;
     if(!point&&p.googleId){
       const details=document.createElement('div');card.insertBefore(details,notice);
       try{
         const loc=await window.JalanGooglePlaceSearch.resolve(p.googleId,details,controller.signal);
         point=[loc.lat,loc.lon];
       }finally{details.remove();}
     }
     if(pending!==p||controller.signal.aborted||!validCoordinates(point))return;
     if(!destination)setDestinationPlace({name:p.name,display_name:p.label||p.name,
       source:p.googleId?'google':undefined,googleId:p.googleId,searchText:p.searchText},point);
     const target=destination;
     setStart(origin,'Your starting location');
     await calculateRoutes();
     if(!routes.length&&destination===target&&!document.body.classList.contains('passenger-guiding')){
       offer(p);say('Could not load routes. Tap Go to try again.');
     }
   }catch{
     if(pending===p)say(native.permission==='denied'?'':'Location or route unavailable. Tap Go to try again.');
   }finally{
     window.removeEventListener('jalan:route-cleared',cancel);
     if(working===p){working=null;go.disabled=false;}
   }
 }
 go.addEventListener('click',plan);
 card.querySelector('.jalan-dialog-secondary').addEventListener('click',()=>window.JalanPassengerJourney.stop());
 window.addEventListener('jalan:destination-selected',event=>{selected=event.detail;forget();});
 window.addEventListener('jalan:iphone-origin-needed',()=>{
   if(selected&&destination)offer(selected);
 });
 window.addEventListener('jalan:route-cleared',()=>{hide();forget();});
 window.addEventListener('jalan:routes-rendered',()=>{hide();forget();});
 document.addEventListener('click',event=>{
   if(!event.target.closest?.('#passenger-go')||native.permission==='allowed')return;
   event.preventDefault();event.stopImmediatePropagation();
   if(native.permission==='denied'){ask();return;}
   if(working)return;
   const route=routes[selectedRoute];
   if(!route)return;
   working=route;
   getGPS().then(()=>{
     if(working===route&&routes[selectedRoute]===route&&native.permission==='allowed')el('passenger-go').click();
   }).catch(()=>{if(working===route&&native.permission==='denied')ask();}).finally(()=>{if(working===route)working=null;});
 },true);
 function resume(){
   if(document.hidden||native.permission!=='allowed')return;
   if(pending){plan();return;}
   if(returning&&routes[selectedRoute]){
     returning=false;forget();el('passenger-go').click();
   }
 }
 window.addEventListener('jalan:iphone-permission',({detail})=>{
   if(detail.permission==='denied'&&window.JalanGPS?.getState().active){
     window.JalanGPS.stop();if(routes.length)renderRoutes();
   }
   if(detail.permission==='allowed'){
     if(dialog.open)dialog.close();
     if(pending||returning)resume();
     else if(detail.previous==='denied'&&!document.hidden)getGPS().catch(()=>{});
   }
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&returning)resume();});
 // iOS may relaunch the app after a Settings change. Save only the explicit handoff.
 try{
   const record=JSON.parse(localStorage.getItem(handoffKey));
   if(record){
     const p=record.place;
     if(Date.now()-record.at>=0&&Date.now()-record.at<3600000&&p&&
        (validCoordinates(p.point)&&typeof p.name==='string'||typeof p.googleId==='string'&&p.googleId)){
       returning=true;offer({...p,name:p.name||p.searchText||window.JalanLanguage.translate('Recent destination')});
       if(p.point)map.setView(p.point,13);
       resume();
     }else forget();
   }
 }catch{forget();}
})();
