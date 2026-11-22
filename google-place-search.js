/* Places UI Kit only: keep Google's entire result/attribution component. */
(() => {
 'use strict';
 let loading,loaderId=0;
 const config=()=>window.JalanPublicConfig||{};
 const configured=()=>config().googlePlacesFallback===true&&/^[\w-]{20,160}$/.test(config().googleMapsBrowserKey||'');
 async function load(){
  if(!configured())throw Error('Google search is not configured');
  if(window.google?.maps?.importLibrary){await google.maps.importLibrary('places');return;}
  if(!loading)loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   const callback='__jalanGoogleReady'+(++loaderId);let settled=false;
   const timeout=setTimeout(()=>fail(),12000);
   const fail=()=>{
    if(settled)return;settled=true;clearTimeout(timeout);script.remove();
    // Removing a script cannot guarantee its download/evaluation is stopped.
    // A late SDK must not call a missing callback or resolve a newer attempt.
    window[callback]=()=>{};loading=null;reject(Error('Google search unavailable'));
   };
   window[callback]=async()=>{
    if(settled)return;
    try{await google.maps.importLibrary('places');if(settled)return;settled=true;clearTimeout(timeout);delete window[callback];resolve();}catch{fail();}
   };
   const url=new URL('https://maps.googleapis.com/maps/api/js');
   url.searchParams.set('key',config().googleMapsBrowserKey);
   url.searchParams.set('loading','async');url.searchParams.set('callback',callback);
   url.searchParams.set('v','weekly');url.searchParams.set('language',window.JalanLanguage?.code||'en');url.searchParams.set('region','MY');
   script.src=url.href;script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.onerror=fail;
   document.head.append(script);
  });
  return loading;
 }
 async function mount({query,container,signal,onSelect,onEmpty,onError,onReady}){
  await load();if(signal.aborted)return;
  const widget=document.createElement('gmp-place-search');
  widget.lang=window.JalanLanguage?.code||'en';widget.setAttribute('selectable','');widget.setAttribute('attribution-position','top');
  widget.className='destination-google-results';
  const content=document.createElement('template');
  content.slot='details-item';
  content.content.append(document.createElement('gmp-place-name'),document.createElement('gmp-place-address'));
  const attribution=document.createElement('gmp-place-attribution');
  const request=document.createElement('gmp-place-text-search-request');
  request.maxResultCount=5;
  // Fixed Malaysia bounds, never the user's precise location. Bounds include
  // Peninsular and East Malaysia; Google may also use its normal IP bias.
  request.locationRestriction={south:0.8,west:99.5,north:7.5,east:119.5};
  widget.append(content,request,attribution);
  // The UI Kit waits for its list to enter view before fetching. The five
  // TomTom rows can fill the scroll area while the passenger reads them.
  let timeout,waiting=true;
  const visibility=new IntersectionObserver(([entry])=>{
   clearTimeout(timeout);
   if(waiting&&entry.isIntersecting)timeout=setTimeout(failSearch,15000);
  });
  function stopWaiting(){waiting=false;visibility.disconnect();clearTimeout(timeout);}
  function failSearch(){
   if(signal.aborted)return;
   stopWaiting();widget.remove();onError();
  }
  const cleanup=()=>{stopWaiting();widget.remove();};
  signal.addEventListener('abort',cleanup,{once:true});
  widget.addEventListener('gmp-load',()=>{
   if(signal.aborted)return;stopWaiting();
   if(!widget.places?.length){widget.remove();onEmpty();}else onReady();
  });
  widget.addEventListener('gmp-error',failSearch);
  widget.addEventListener('gmp-select',event=>{
   if(signal.aborted)return;
   const place=event.place,location=place?.location;
   const lat=typeof location?.lat==='function'?location.lat():location?.lat;
   const lon=typeof location?.lng==='function'?location.lng():location?.lng;
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){onError();return;}
   // The selection event can contain just an ID and a point. Recent displays
   // the provider's name and address by that ID, even for an ambiguous search.
   const name=place.displayName||query.trim()||'Selected destination';
   onSelect({lat,lon,name,display_name:name,source:'google',googleId:place.id});
  });
  container.replaceChildren(widget);
  visibility.observe(widget);
  request.textQuery=query;
 }
 async function nearby({center,radius,container,signal,onSelect,onError,onPlaces}){
  await load();if(signal.aborted)return;
  const widget=document.createElement('gmp-place-search');
  widget.lang=window.JalanLanguage?.code||'en';widget.setAttribute('selectable','');widget.setAttribute('attribution-position','top');
  const request=document.createElement('gmp-place-nearby-search-request');
  request.includedTypes=['gas_station','electric_vehicle_charging_station'];request.maxResultCount=20;
  request.locationRestriction={center:{lat:center[0],lng:center[1]},radius:Math.min(50000,radius)};
  const template=document.createElement('template');template.slot='details-item';
  template.content.append(document.createElement('gmp-place-name'),document.createElement('gmp-place-address'));
  widget.append(template,request,document.createElement('gmp-place-attribution'));
  widget.addEventListener('gmp-error',onError);
  function site(p){
   const lat=p?.location?.lat?.(),lng=p?.location?.lng?.();
   if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
   return {id:p.id,googleId:p.id,name:p.displayName||'',point:[lat,lng],access:[lat,lng],
    petrol:p.types?.includes('gas_station'),ev:p.types?.includes('electric_vehicle_charging_station'),details:[]};
  }
  widget.addEventListener('gmp-load',()=>{if(!signal.aborted)onPlaces((widget.places||[]).map(site).filter(Boolean));});
  widget.addEventListener('gmp-select',e=>{const selected=site(e.place);if(selected&&!signal.aborted)onSelect(selected);});
  signal.addEventListener('abort',()=>widget.remove(),{once:true});container.replaceChildren(widget);
 }
 // Mount an attributed place by its exact ID, without repeating the search.
 async function showDetails(id,container,signal,station=false){
  await load();if(signal.aborted)throw Error('Place lookup cancelled');
  return new Promise((done,fail)=>{
   const widget=document.createElement(station?'gmp-place-details':'gmp-place-details-compact');
   widget.lang=window.JalanLanguage?.code||'en';widget.setAttribute('orientation','horizontal');
   const request=document.createElement('gmp-place-details-place-request');
   widget.append(request,document.createElement('gmp-place-name'),document.createElement('gmp-place-address'),document.createElement('gmp-place-attribution'));
   if(station)widget.insertBefore(document.createElement('gmp-place-type-specific-highlights'),widget.lastElementChild);
   function finish(){
    clearTimeout(timer);signal.removeEventListener('abort',failed);
    widget.removeEventListener('gmp-error',failed);widget.removeEventListener('gmp-load',ready);
   }
   function failed(){finish();widget.remove();fail(new Error('Place details unavailable'));}
   function ready(){finish();done(widget);}
   const timer=setTimeout(failed,12000);
   signal.addEventListener('abort',failed,{once:true});
   widget.addEventListener('gmp-error',failed);
   widget.addEventListener('gmp-load',ready);
   container.replaceChildren(widget);
   request.place=id;
  });
 }
 async function resolve(id,container,signal){
  const widget=await showDetails(id,container,signal);
  const loc=widget.place?.location;
  widget.remove();
  const lat=typeof loc?.lat==='function'?loc.lat():loc?.lat;
  const lon=typeof loc?.lng==='function'?loc.lng():loc?.lng;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Saved place location unavailable');
  return {lat,lon};
 }
 window.addEventListener('jalan:language-change',()=>{
  document.querySelectorAll('gmp-place-search,gmp-place-details-compact').forEach(widget=>{widget.lang=window.JalanLanguage.code;});
 });
 window.JalanGooglePlaceSearch=Object.freeze({configured,mount,nearby,resolve,showDetails});
})();
