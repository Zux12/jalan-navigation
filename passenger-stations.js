(() => {
 'use strict';
 if(!passengerMode)return;
 const data=window.JalanStationData,planner=window.JalanStationPlanner;
 const toggle=$('passenger-stations'),listButton=$('passenger-stations-list'),preference='jalan-nearby-stations-v1';
 const lang=(en,ms)=>window.JalanLanguage?.code==='ms'?ms:en;
 const pins=new Map(),cache=new Map(),pending=new Map();
 let enabled=true,located=false,timer,wake,directoryJob=null,googleRows=[],currentRows=[],wanted=[],signature='';
 try{enabled=localStorage.getItem(preference)!=='off';}catch{}
 toggle.checked=enabled;listButton.hidden=!enabled;
 const directory=document.createElement('section');directory.id='station-directory';directory.hidden=true;
 directory.setAttribute('role','dialog');directory.setAttribute('aria-labelledby','station-directory-heading');
 directory.innerHTML='<header><h2 id="station-directory-heading">Nearby stations</h2><button type="button" class="station-dismiss" aria-label="Close">×</button></header><div class="station-local-list"></div><div class="station-google-list"></div>';
 document.body.append(directory);
 function closeDirectory(){
   directory.hidden=true;directoryJob?.abort();directoryJob=null;
   const hadGoogle=googleRows.length;googleRows=[];if(hadGoogle&&enabled)paint(currentRows);
   directory.querySelector('.station-google-list').replaceChildren();
   document.body.classList.remove('passenger-station-directory');
 }
 function select(site){
   if(site.googleId){
     const matched=data.withGoogle(currentRows,[site]).find(s=>s.googleId===site.googleId);
     if(matched)site=matched;
   }
   closeDirectory();const access=site.access||site.point;
   planner.open({kind:'station',point:access,name:site.name||lang('Station','Stesen'),station:site});
 }
 const drop='M17 1.5C8.4 1.5 1.5 8.1 1.5 16.5c0 6.1 3.6 10.3 7.6 15.1 2.8 3.3 4.9 7 6.3 10a1.8 1.8 0 0 0 3.2 0c1.4-3 3.5-6.7 6.3-10 4-4.8 7.6-9 7.6-15.1C32.5 8.1 25.6 1.5 17 1.5Z';
 const pump='<path fill="#25251f" fill-rule="evenodd" d="M2 2.5h10v15h1v2H1v-2h1zm2 2v5h6v-5z"/><path d="M12 8h1.2c2 0 2.5 1.5 2.5 3.5v2.8c0 1.6 2.4 1.6 2.4 0V8l-3.5-4" fill="none" stroke="#25251f" stroke-width="1.8" stroke-linecap="round"/>';
 const bolt='<path d="M13.3 0 3 12h6.4l-2 8L18 7.5h-6.5z" fill="white"/>';
 function glyph(content,x,y,size){return '<svg x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" viewBox="0 0 20 20">'+content+'</svg>';}
 function artwork(petrol,ev){
   const both=petrol&&ev;
   const split=both?'<path class="station-ev-fill" d="M17 1.5v41.1c.7 0 1.3-.4 1.6-1 1.4-3 3.5-6.7 6.3-10 4-4.8 7.6-9 7.6-15.1C32.5 8.1 25.6 1.5 17 1.5Z"/>':'';
   const symbols=both?glyph(pump,3,8.5,14)+glyph(bolt,16.5,8,14):glyph(petrol?pump:bolt,7,6.3,20);
   return '<svg class="station-drop" viewBox="0 0 34 44" aria-hidden="true"><path class="'+(petrol?'station-petrol-fill':'station-ev-fill')+'" d="'+drop+'"/>'+split+symbols+'<path fill="none" stroke="white" stroke-width="2" d="'+drop+'"/></svg>';
 }
 function marker(site,interactive=true){
   const both=site.petrol&&site.ev;
   const frame=document.createElement('span');frame.className='station-marker-face';
   frame.innerHTML=artwork(site.petrol,site.ev);
   const label=document.createElement('span');label.className='station-pin-label';
   const lines=data.chargeLabels(site);
   if(site.ev&&!lines.length)lines.push('EV');
   if(site.petrol)lines.unshift(site.brandName||site.name||'Petrol');
   for(const line of lines){
     const row=document.createElement('span');row.textContent=line;label.append(row);
   }
   frame.append(label);
   const icon=L.divIcon({className:'jalan-station-pin'+(both?' combined':'')+(site.petrol?' petrol':' ev'),
     iconSize:[34,44],iconAnchor:[17,43],html:frame.outerHTML});
   const pin=L.marker(site.point,{icon,interactive,keyboard:interactive,title:site.name||lines.join(' · '),zIndexOffset:interactive?50:400});
   if(interactive)pin.on('click',()=>select(site));
   return pin.addTo(map);
 }
 function resetPins(){pins.forEach(({pin})=>map.removeLayer(pin));pins.clear();}
 function overview(rows,zoom){
   const groups=new Map(),size=360*48/(256*2**zoom);
   for(const site of rows){
     const key=site.point.map(n=>Math.floor(n/size)).join('/');
     if(!groups.has(key))groups.set(key,[]);groups.get(key).push(site);
   }
   return [...groups].map(([key,items])=>items.length===1?items[0]:{id:'area/'+key,count:items.length,
     point:items.reduce((p,s)=>[p[0]+s.point[0]/items.length,p[1]+s.point[1]/items.length],[0,0])});
 }
 function expand(site){map.setView(site.point,Math.max(11,map.getZoom()+2));}
 function cluster(site){
   const icon=L.divIcon({className:'jalan-station-count',iconSize:[36,30],iconAnchor:[18,15],html:String(site.count)});
   const pin=L.marker(site.point,{icon,title:site.count+' '+lang('stations','stesen')}).addTo(map);
   pin.on('click',()=>expand(site));return pin;
 }
 function paint(rows){
   rows=data.withGoogle(rows,googleRows.filter(s=>map.getBounds().contains(s.point)));
   // Keep nearby forecourts separate at street zoom. At city scale their
   // text plates can cover several blocks, so group adjacent stations first.
   if(Math.floor(map.getZoom())<15)rows=overview(rows,Math.floor(map.getZoom()));
   const keep=new Set(rows.map(s=>s.id));
   pins.forEach(({pin},id)=>{if(!keep.has(id)){map.removeLayer(pin);pins.delete(id);}});
   for(const site of rows)if(!pins.has(site.id)||pins.get(site.id).site!==site){
     if(pins.has(site.id))map.removeLayer(pins.get(site.id).pin);
     pins.set(site.id,{pin:site.count?cluster(site):marker(site),site});
   }
   paintDirectory();
 }
 function view(){
   const bounds=map.getBounds();
   const south=Math.max(.5,bounds.getSouth()),north=Math.min(7.7,bounds.getNorth()),west=Math.max(99.3,bounds.getWest()),east=Math.min(119.6,bounds.getEast());
   if(south>=north||west>=east)return null;
   const b=L.latLngBounds([south,west],[north,east]),c=b.getCenter();
   const center=[c.lat,c.lng];
   const radius=Math.ceil(Math.max(...[b.getNorthEast(),b.getNorthWest(),b.getSouthEast(),b.getSouthWest()].map(p=>data.meters(center,[p.lat,p.lng]))));
   return {center,radius,south,west,north,east};
 }
 function releaseStartup(){located=true;schedule();}
 function schedule(){if(!timer&&enabled&&!document.hidden)timer=setTimeout(()=>{timer=null;refresh();},300);}
 function stopDownloads(){
   clearTimeout(wake);clearTimeout(timer);timer=null;
   for(const job of pending.values())job.abort();
   pending.clear();wanted=[];signature='';currentRows=[];resetPins();
 }
 function paintCells(){
   // A cell can supply its first page before the next page or its neighbours finish.
   const next=Math.floor(map.getZoom())+'|'+wanted.map(c=>c.id+':'+cache.get(c.id)?.revision).sort().join('|');
   if(next===signature){paintDirectory();return;}
   signature=next;currentRows=data.merge(wanted.flatMap(c=>cache.get(c.id)?.rows||[]));paint(currentRows);
 }
 async function download(area,key,entry){
   const controller=new AbortController();pending.set(area.id,controller);
   const previous=entry.rows;
   const publish=rows=>{
     if(pending.get(area.id)!==controller)return;
     entry.rows=rows;entry.revision++;paintCells();
   };
   try{
     const rows=await data.nearby(area,key,controller.signal,rows=>publish(previous.length?[...previous,...rows]:rows));
     if(pending.get(area.id)!==controller)return;
     entry.until=Date.now()+300000;entry.retry=0;
     if(previous.length||!rows.length)publish(rows);
   }catch{if(pending.get(area.id)===controller)entry.retry=Date.now()+12000;}
   finally{if(pending.get(area.id)===controller){pending.delete(area.id);schedule();}}
 }
 function refresh(){
   if(!enabled||document.hidden||!located)return;
   const v=view(),key=$('tt-key')?.value.trim();
   if(!key||!v){stopDownloads();paintDirectory();return;}
   const state=document.body.classList.contains('passenger-following-location')&&window.JalanGPS?.getState();
   const fix=state?.gpsReliable?state.gpsPosition:window.JalanPassengerStartup?.followingPoint;
   const focus=fix&&fix[0]>=v.south&&fix[0]<=v.north&&fix[1]>=v.west&&fix[1]<=v.east?fix:v.center;
   wanted=data.cellsForView(v,focus);
   const ids=new Set(wanted.map(c=>c.id)),now=Date.now();
   for(const [id,job] of pending)if(!ids.has(id)){pending.delete(id);job.abort();}
   const first=wanted[0].id,local=cache.get(first);
   if(pending.size===2&&!pending.has(first)&&Math.max(local?.until||0,local?.retry||0)<=now){
     const last=wanted.findLast(c=>pending.has(c.id)).id;
     pending.get(last).abort();pending.delete(last);
   }
   for(const area of wanted){
     const entry=cache.get(area.id)||{rows:[],revision:0,until:0,retry:0};
     cache.delete(area.id);cache.set(area.id,entry);
     if(pending.size<2&&!pending.has(area.id)&&Math.max(entry.until,entry.retry)<=now)download(area,key,entry);
   }
   while(cache.size>48)cache.delete(cache.keys().next().value);
   paintCells();
   clearTimeout(wake);
   const times=wanted.map(c=>{const e=cache.get(c.id);return Math.max(e.until,e.retry);}).filter(t=>t>now);
   if(times.length)wake=setTimeout(schedule,Math.min(...times)-now+10);
 }
 function paintDirectory(){
   if(directory.hidden)return;
   const list=directory.querySelector('.station-local-list'),b=map.getBounds();list.replaceChildren();
   const sites=currentRows.filter(s=>b.contains(s.point));
   for(const site of sites){
     const button=document.createElement('button');button.type='button';
     button.textContent=site.name+' · '+(site.petrol&&site.ev?'Petrol + EV':site.petrol?'Petrol':'EV');
     button.onclick=()=>select(site);list.append(button);
   }
   if(!sites.length){
     if(pending.size||!located)list.textContent=lang('Loading nearby stations…','Memuatkan stesen berhampiran…');
     else if(wanted.some(c=>cache.get(c.id)?.retry>Date.now()))list.textContent=lang('Station lookup interrupted. Retrying…','Carian stesen terganggu. Mencuba semula…');
     else list.textContent=lang('No stations shown in this area.','Tiada stesen dipaparkan di kawasan ini.');
   }
 }
 function openDirectory(){
   if(!enabled)return;
   $('jalan-home-menu-close').click();planner.close();closeDirectory();directory.hidden=false;
   document.body.classList.add('passenger-station-directory');
   releaseStartup();paintDirectory();directory.querySelector('button').focus({preventScroll:true});
   const google=window.JalanGooglePlaceSearch;if(!google.configured())return;
   const container=directory.querySelector('.station-google-list'),controller=new AbortController();directoryJob=controller;
   const failed=()=>{if(!controller.signal.aborted)container.textContent=lang('Google Maps results unavailable.','Hasil Google Maps tidak tersedia.');};
   const area=view();if(!area)return;
   google.nearby({...area,container,signal:controller.signal,onSelect:select,onError:failed,onPlaces:places=>{
     googleRows=places;paint(currentRows);
   }}).catch(failed);
 }
 function switchPins(){
   enabled=toggle.checked;listButton.hidden=!enabled;
   try{localStorage.setItem(preference,enabled?'on':'off');}catch{}
   if(enabled)releaseStartup();else{stopDownloads();closeDirectory();planner.close();}
 }
 toggle.addEventListener('change',switchPins);listButton.onclick=openDirectory;directory.querySelector('button').onclick=closeDirectory;
 window.addEventListener('keydown',e=>{if(e.key==='Escape')closeDirectory();});
 window.addEventListener('jalan:pin-open',closeDirectory);window.addEventListener('jalan:language-change',paintDirectory);
 // The basic-map gesture surface sits over Leaflet while following the vehicle.
 function hitAt(x,y){
   let best=null,distance=Infinity;
   for(const row of pins.values()){
     const element=row.pin.getElement();if(!element)continue;
     const targets=row.site.count?[element]:element.querySelectorAll('.station-drop,.station-pin-label');
     for(const target of targets){
       const rect=target.getBoundingClientRect();if(!rect.width)continue;
       if(x<rect.left-4||x>rect.right+4||y<rect.top-4||y>rect.bottom+4)continue;
       const d=Math.hypot(x-rect.left-rect.width/2,y-rect.top-rect.height/2);
       if(d<distance){distance=d;best=row;}
     }
   }
   return best;
 }
 let touch=null,lastTouch=0;
 const surface=$('passenger-map-gestures');
 surface?.addEventListener('touchstart',e=>{
   const p=e.touches[0];touch=e.touches.length===1?{x:p.clientX,y:p.clientY,at:performance.now()}:null;
 },{passive:true});
 surface?.addEventListener('touchmove',e=>{
   const p=e.touches[0];if(e.touches.length!==1||touch&&Math.hypot(p.clientX-touch.x,p.clientY-touch.y)>9)touch=null;
 },{passive:true});
 surface?.addEventListener('touchcancel',()=>{touch=null;});
 surface?.addEventListener('touchend',()=>{
   if(enabled&&touch&&performance.now()-touch.at<650){
     const row=hitAt(touch.x,touch.y);if(row){lastTouch=performance.now();row.site.count?expand(row.site):select(row.site);}
   }
   touch=null;
 });
 window.addEventListener('click',event=>{
   if(event.target!==surface||!enabled||performance.now()-lastTouch<650)return;
   const row=hitAt(event.clientX,event.clientY);
   if(row){event.stopImmediatePropagation();row.site.count?expand(row.site):select(row.site);}
 },true);
 map.on('moveend zoomend',schedule);map.on('dragstart',releaseStartup);
 map.getContainer().addEventListener('wheel',releaseStartup,{passive:true});
 map.getContainer().addEventListener('touchstart',releaseStartup,{passive:true});
 for(const event of ['jalan:initial-location','jalan:initial-location-error','jalan:free-location','jalan:gps-fix','jalan:routes-rendered','jalan:vector-gesture-end'])window.addEventListener(event,releaseStartup);
 document.addEventListener('visibilitychange',schedule);
 window.addEventListener('online',()=>{for(const entry of cache.values())entry.retry=0;schedule();});
 for(const [id,event] of [['tt-key','input'],['tt-remove-key','click']])$(id)?.addEventListener(event,()=>{
   stopDownloads();cache.clear();schedule();
 });
 // Give startup GPS a chance to centre the map before requesting the KL fallback.
 // Browsing still works if the permission prompt is left unanswered.
 window.JalanStations={marker};setTimeout(releaseStartup,14500);
})();
