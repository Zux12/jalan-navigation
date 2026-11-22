(() => {
 'use strict';
 if(!passengerMode)return;
 const data=window.JalanStationData,planner=window.JalanStationPlanner;
 const toggle=$('passenger-stations'),listButton=$('passenger-stations-list'),preference='jalan-nearby-stations-v1';
 const lang=(en,ms)=>window.JalanLanguage?.code==='ms'?ms:en;
 const pins=new Map(),cache=[];let googleRows=[];
 let enabled=true,current=null,loading=null,timer,paintZoom,retryAfter=0,directoryJob=null;
 try{enabled=localStorage.getItem(preference)!=='off';}catch{}
 toggle.checked=enabled;listButton.hidden=!enabled;
 const directory=document.createElement('section');directory.id='station-directory';directory.hidden=true;
 directory.setAttribute('role','dialog');directory.setAttribute('aria-labelledby','station-directory-heading');
 directory.innerHTML='<header><h2 id="station-directory-heading">Nearby stations</h2><button type="button" class="station-dismiss" aria-label="Close">×</button></header><div class="station-local-list"></div><div class="station-google-list"></div>';
 document.body.append(directory);
 function closeDirectory(){
   directory.hidden=true;directoryJob?.abort();directoryJob=null;
   const hadGoogle=googleRows.length;googleRows=[];if(hadGoogle&&enabled)paint(current?.rows||[]);
   directory.querySelector('.station-google-list').replaceChildren();
   document.body.classList.remove('passenger-station-directory');
 }
 function select(site){
   if(site.googleId){
     const matched=data.withGoogle(current?.rows||[],[site]).find(s=>s.googleId===site.googleId);
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
   rows=data.withGoogle(rows,googleRows);paintZoom=Math.floor(map.getZoom());
   // Keep nearby forecourts separate at street zoom. At city scale their
   // text plates can cover several blocks, so group adjacent stations first.
   if(paintZoom<15)rows=overview(rows,paintZoom);
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
   const center=[Number(c.lat.toFixed(2)),Number(c.lng.toFixed(2))];
   const radius=Math.ceil(Math.max(...[b.getNorthEast(),b.getNorthWest(),b.getSouthEast(),b.getSouthWest()].map(p=>data.meters(center,[p.lat,p.lng]))));
   return {center,radius};
 }
 const contains=(area,v)=>data.meters(area.center,v.center)+v.radius<=area.radius;
 function schedule(){if(!timer&&enabled&&!document.hidden)timer=setTimeout(()=>{timer=null;refresh();},300);}
 async function refresh(){
   if(!enabled||document.hidden)return;
   const v=view(),key=$('tt-key')?.value.trim();
   if(!key||!v){
     loading?.controller.abort();loading=null;current=null;resetPins();paintDirectory();return;
   }
   if(current&&current.until>Date.now()&&contains(current,v)){
     if(loading){loading.controller.abort();loading=null;}
     if(paintZoom!==Math.floor(map.getZoom()))paint(current.rows);
     return;
   }
   const cached=[...cache].reverse().find(a=>a.until>Date.now()&&contains(a,v));
   if(cached){loading?.controller.abort();loading=null;current=cached;paint(cached.rows);return;}
   if(loading&&contains(loading,v)||Date.now()<retryAfter)return;
   loading?.controller.abort();
   const area={center:v.center,radius:Math.max(1200,Math.ceil(v.radius*1.35)),controller:new AbortController()};
   loading=area;
   try{
     const rows=await data.nearby(area.center,area.radius,key,area.controller.signal);
     if(loading!==area||!enabled)return;
     current={center:area.center,radius:area.radius,rows,until:Date.now()+300000};
     cache.push(current);if(cache.length>6)cache.shift();
     paint(rows);
   }catch{if(loading===area){retryAfter=Date.now()+12000;setTimeout(schedule,12500);}}
   finally{if(loading===area)loading=null;}
 }
 function paintDirectory(){
   if(directory.hidden)return;
   const list=directory.querySelector('.station-local-list'),b=map.getBounds();list.replaceChildren();
   const sites=(current?.rows||[]).filter(s=>b.contains(s.point));
   for(const site of sites){
     const button=document.createElement('button');button.type='button';
     button.textContent=site.name+' · '+(site.petrol&&site.ev?'Petrol + EV':site.petrol?'Petrol':'EV');
     button.onclick=()=>select(site);list.append(button);
   }
   if(!sites.length)list.textContent=lang('No stations shown in this area.','Tiada stesen dipaparkan di kawasan ini.');
 }
 function openDirectory(){
   if(!enabled)return;
   $('jalan-home-menu-close').click();planner.close();closeDirectory();directory.hidden=false;
   document.body.classList.add('passenger-station-directory');
   paintDirectory();schedule();directory.querySelector('button').focus({preventScroll:true});
   const google=window.JalanGooglePlaceSearch;if(!google.configured())return;
   const container=directory.querySelector('.station-google-list'),controller=new AbortController();directoryJob=controller;
   const failed=()=>{if(!controller.signal.aborted)container.textContent=lang('Google Maps results unavailable.','Hasil Google Maps tidak tersedia.');};
   const area=view();if(!area)return;
   google.nearby({...area,container,signal:controller.signal,onSelect:select,onError:failed,onPlaces:places=>{
     googleRows=places;paint(current?.rows||[]);
   }}).catch(failed);
 }
 function switchPins(){
   enabled=toggle.checked;listButton.hidden=!enabled;
   try{localStorage.setItem(preference,enabled?'on':'off');}catch{}
   if(enabled)schedule();else{loading?.controller.abort();loading=null;current=null;resetPins();closeDirectory();planner.close();}
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
 map.on('moveend zoomend',schedule);window.addEventListener('jalan:vector-gesture-end',schedule);
 window.addEventListener('jalan:gps-fix',schedule);document.addEventListener('visibilitychange',schedule);
 for(const [id,event] of [['tt-key','input'],['tt-remove-key','click']])$(id)?.addEventListener(event,()=>{
   loading?.controller.abort();loading=null;current=null;cache.length=0;retryAfter=0;resetPins();schedule();
 });
 window.JalanStations={marker};schedule();
})();
