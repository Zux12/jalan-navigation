(() => {
 'use strict';
 if(!passengerMode)return;
 const model=window.JalanStationRoute,card=document.createElement('section');
 card.id='jalan-station-card';card.hidden=true;card.setAttribute('role','dialog');card.setAttribute('aria-labelledby','station-heading');card.setAttribute('translate','no');
 card.innerHTML='<header><h2 id="station-heading"></h2><button class="station-dismiss" type="button">×</button></header><div class="station-info"></div><div class="station-google"></div><div class="station-order"></div><p role="status"></p><div class="station-options"></div><div class="station-actions"></div>';
 document.body.append(card);
 const box=selector=>card.querySelector(selector),t=(en,ms)=>window.JalanLanguage?.code==='ms'?ms:en;
 let session=null,job=null,timer,preview=[],paused=false,holding=false;
 const origin=s=>s.active?(s.gpsReliable&&s.gpsFixAgeMs<=10000?s.gpsPosition:null):startPoint||userLocation;
 function removePreview(){preview.forEach(layer=>map.removeLayer(layer));preview=[];}
 function line(path,start,end,color,scale){
   return L.polyline(window.JalanRouteDisplay.section(path,start,end).map(([lon,lat])=>[lat,lon]),
    {pane:'passenger-stop',className:'jalan-stop-route',jalanRouteScale:scale,color,weight:9*scale,opacity:1,interactive:false,smoothFactor:0}).addTo(map);
 }
 function draw(route,_pane,marker,previewing=false){
   const layers=[],path=window.JalanRouteDisplay.shape(route);let index=0;
   for(let stop=route.pinnedStop;stop;stop=stop.onward?.pinnedStop){
     const start=path.lengths[index];index+=stop.index;const end=path.lengths[index];
     if(stop.kind==='station'){
       layers.push(line(path,start,end,'#e47508',1.45),line(path,start,end,'#ffca28',1));
       if(!previewing)layers.push(window.JalanStations.marker(stop.station||{point:stop.point,name:stop.name,ev:true},false));
     }else{
       layers.push(line(path,start,end,'#8047c7',1));
       if(marker&&!previewing)layers.push(marker(stop.point));
     }
   }
   if(previewing)layers.push(line(path,path.lengths[index],path.lengths.at(-1),'#087af5',1));
   return layers;
 }
 function close(){
   if(!session)return;
   clearTimeout(timer);job?.abort();job=null;session.details.abort();session=null;removePreview();
   holding=false;card.hidden=true;document.body.classList.remove('passenger-station-open');
 }
 function button(parent,label,fn,selected){
   const b=document.createElement('button');b.type='button';b.textContent=label;
   if(typeof selected==='boolean')b.setAttribute('aria-pressed',String(selected));b.onclick=fn;parent.append(b);return b;
 }
 const defaultName=s=>s?.name||t('Pinned stop','Hentian pin');
 function restart(){
   clearTimeout(timer);
   const s=session;
   if(!s?.adding||!s.choices?.length||document.hidden||paused||holding)return;
   const until=Date.now()+7000;
   function tick(){
     if(s!==session)return;
     const left=Math.ceil((until-Date.now())/1000);
     if(left<=0){confirm();return;}
     s.go.textContent=t('Confirm','Sahkan')+' · '+left+'s';
     timer=setTimeout(tick,Math.min(1000,Math.max(1,until-Date.now())));
   }
   tick();
 }
 function minutes(value){return Math.max(0,Math.round(value/60))+' '+t('min','min');}
 function paint(){
   const s=session;if(!s)return;
   const place=s.add.station,regular=s.stops.find(x=>x.kind==='regular'),station=s.stops.find(x=>x.kind==='station');
   box('h2').textContent=defaultName(s.add);box('.station-dismiss').setAttribute('aria-label',t('Close','Tutup'));
   const info=box('.station-info');info.replaceChildren();
   if(place){
     const category=place.ev&&place.petrol?t('Petrol + EV charging','Petrol + pengecas EV'):place.ev?t('EV charging','Pengecas EV'):place.petrol?t('Petrol station','Stesen minyak'):'';
     const text=[category,place.hpc?'HPC':'',place.evName!==place.name?place.evName:'',...(place.details||[]),place.address].filter(Boolean);
     info.textContent=text.join(' · ');
   }
   const order=box('.station-order'),routesBox=box('.station-options'),actions=box('.station-actions'),status=box('p');
   order.replaceChildren();routesBox.replaceChildren();actions.replaceChildren();removePreview();
   if(!s.base){
     status.textContent='';button(actions,t('Route to station','Laluan ke stesen'),()=>{
       const p=s.add,point=p.point;close();
       selectDestinationPlace({name:p.name,display_name:p.name,lat:point[0],lon:point[1],source:p.station?.googleId?'google':undefined,googleId:p.station?.googleId});
     });return;
   }
   if(s.adding&&regular&&station){
     const label=document.createElement('strong');label.textContent=t('Stop order','Susunan hentian');order.append(label);
     for(const first of [true,false]){
       const pair=first?[station,regular]:[regular,station];
       button(order,pair.map(defaultName).join(' → '),()=>{if(first!==s.first){s.first=first;calculate();}else restart();},first===s.first);
     }
   }
   if(!s.choices?.length){
     status.textContent=s.error||t('Calculating driving time…','Mengira masa memandu…');
     if(s.error){
       if(s.conflict)button(actions,t('Allow tolls on this leg','Benarkan tol pada bahagian ini'),()=>{
         s.policy={...s.policy,legs:{...s.policy?.legs,[s.conflict]:true}};calculate();
       });else button(actions,t('Retry','Cuba lagi'),calculate);
     }
   }else{
     const choice=s.choices[s.index];
     const delta=choice.duration-s.baseline;
     status.textContent=(delta<0?'−':'+')+minutes(Math.abs(delta))+' '+t('driving vs current route','memandu berbanding laluan semasa');
     if(s.adding){
       s.choices.forEach((r,i)=>{
         const toll=r.tolls===true?t('Has tolls','Ada tol'):r.tolls===false?t('Toll-free','Tanpa tol'):t('Tolls unknown','Tol tidak diketahui');
         const via=window.JalanJourneyModel?.longestRoad(r);
         button(routesBox,(i+1)+'. '+(via?t('Via ','Melalui ')+via+' · ':'')+minutes(r.duration)+' · '+(r.distance/1000).toFixed(1)+' km · '+toll,()=>{s.index=i;paint();restart();},i===s.index);
       });
       preview=draw(choice,null,null,true);
       s.go=button(actions,t('Confirm','Sahkan'),confirm);
     }
   }
   if(!s.adding&&!s.error)button(actions,t('Add stop','Tambah hentian'),()=>{s.adding=true;paint();restart();});
   button(actions,t('Cancel','Batal'),close);
 }
 async function calculate(){
   const s=session;if(!s)return;
   job?.abort();clearTimeout(timer);
   const controller=new AbortController();job=controller;
   const timeout=setTimeout(()=>controller.abort(),18000);
   s.choices=null;s.error='';s.conflict=null;s.index=0;
   s.stops=model.order(s.base,s.add,s.first);
   const state=window.JalanGPS.getState();s.from=origin(state);
   s.baseline=state.active&&Number.isFinite(state.remainingSeconds)?state.remainingSeconds:s.base.duration;paint();
   try{
     if(!s.from)throw Error('gps');
     const choices=await requestDrivingRoutes(s.from,s.target,{signal:controller.signal,stops:s.stops,tollPolicy:s.policy});
     if(job!==controller||session!==s)return;
     controller.signal.throwIfAborted();s.choices=choices;
   }catch(e){
     if(job!==controller||session!==s)return;
     s.conflict=e.stationTollLeg;
     const tollTarget=s.stops.find(stop=>stop.kind===s.conflict)?.name|| (s.conflict==='destination'?destinationName:t('pinned stop','hentian pin'));
     s.error=s.conflict?t('The route to ','Laluan ke ')+tollTarget+t(' has tolls.',' mempunyai tol.'):
       e.message==='gps'?t('Waiting for your current location.','Menunggu lokasi semasa anda.'):t('Could not load a driving route.','Laluan memandu tidak dapat dimuatkan.');
   }finally{clearTimeout(timeout);if(job===controller){job=null;paint();restart();}}
 }
 function confirm(){
   const s=session;if(!s?.choices?.length)return;clearTimeout(timer);
   const state=window.JalanGPS.getState();
   if(routes[selectedRoute]!==s.base||destination!==s.target||s.active!==state.active){close();return;}
   const from=origin(state);
   if(!from||window.JalanPinnedRoute.meters(from,s.from)>150){calculate();return;}
   const route=s.choices[s.index];
   if(s.base.pinnedDestinationAccess)route.pinnedDestinationAccess=s.base.pinnedDestinationAccess;
   if(s.active&&!window.JalanGPS.applyPinnedRoute(route,s.from,'station-stop')){
     s.choices=null;s.error=t('Could not update the route.','Laluan tidak dapat dikemas kini.');paint();return;
   }
   close();
   if(!s.active){routes=[route];selectedRoute=0;renderRoutes();}
   window.dispatchEvent(new CustomEvent('jalan:route-change',{detail:{reason:'station-stop',provider:route.provider||'osrm'}}));
   window.JalanTomTom?.refreshRouteIncidents?.(true);
 }
 function open(add,adding=false){
   if(window.JalanTollChoices?.blocked)return;
   close();window.dispatchEvent(new Event('jalan:station-open'));
   const base=routes[selectedRoute],state=window.JalanGPS.getState();
   session={add,adding,base,target:destination,active:state.active,first:true,stops:model.order(base,add,true),details:new AbortController(),
     policy:base?.tollPolicy?{}:undefined};
   card.hidden=false;document.body.classList.add('passenger-station-open');
   const google=box('.station-google');google.replaceChildren();
   if(add.station?.googleId)window.JalanGooglePlaceSearch.showDetails(add.station.googleId,google,session.details.signal,true).catch(()=>{});
   if(base&&destination)calculate();else paint();
   box('.station-dismiss').focus({preventScroll:true});
 }
 card.addEventListener('pointerdown',()=>{holding=true;clearTimeout(timer);});
 for(const event of ['pointerup','pointercancel'])window.addEventListener(event,()=>{if(holding){holding=false;restart();}});
 box('.station-dismiss').onclick=close;
 for(const ev of ['jalan:journey-stop','jalan:journey-start','jalan:route-cleared','jalan:pin-open','jalan:toll-choice-changing'])window.addEventListener(ev,close);
 window.addEventListener('jalan:routes-rendered',()=>{if(session&&routes[selectedRoute]!==session.base)close();});
 window.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 document.addEventListener('visibilitychange',restart);
 window.addEventListener('blur',()=>{paused=true;clearTimeout(timer);});
 window.addEventListener('focus',()=>{paused=false;restart();});
 window.addEventListener('jalan:language-change',()=>{paint();restart();});
 window.JalanStationPlanner={open,close,draw};
})();
