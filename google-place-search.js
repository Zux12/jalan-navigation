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
   url.searchParams.set('v','weekly');url.searchParams.set('language','en');url.searchParams.set('region','MY');
   script.src=url.href;script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.onerror=fail;
   document.head.append(script);
  });
  return loading;
 }
 async function mount({query,container,signal,onSelect,onEmpty,onError,onReady}){
  await load();if(signal.aborted)return;
  const widget=document.createElement('gmp-place-search');
  widget.setAttribute('selectable','');widget.setAttribute('attribution-position','top');
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
   // Do not call ordinary Places fetchFields: this integration uses UI Kit.
   // When Google returns just an ID and point, identify the passenger's search.
   const searchText=query.replace(/[^\p{L}\p{M}\p{N} .’'-]+/gu,' ').trim();
   const choices=widget.places||[];
   const index=choices.findIndex(choice=>choice===place||(place.id&&choice.id===place.id));
   const prefix=choices.length>1&&index>=0?'Result '+(index+1)+' for':'Search';
   let name=typeof place.displayName==='string'?place.displayName:'';
   if(!name)name=searchText?prefix+' “'+searchText+'”':'Selected destination';
   onSelect({lat,lon,name,display_name:name,source:'google',googleId:place.id});
  });
  container.replaceChildren(widget);
  visibility.observe(widget);
  request.textQuery=query;
 }
 // Save only the Google place ID. Resolve it on use with an attributed UI Kit
 // component so saved shortcuts do not retain Google's address or coordinates.
 async function resolve(id,container,signal){
  await load();if(signal.aborted)throw new Error('Saved place lookup cancelled');
  return new Promise((done,fail)=>{
   const widget=document.createElement('gmp-place-details-compact');
   const request=document.createElement('gmp-place-details-place-request');
   widget.append(request,document.createElement('gmp-place-name'),document.createElement('gmp-place-address'),document.createElement('gmp-place-attribution'));
   container.replaceChildren(widget);
   const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);widget.remove();};
   const abort=()=>{stop();fail(new Error('Saved place lookup cancelled'));};
   const timer=setTimeout(abort,12000);
   signal.addEventListener('abort',abort,{once:true});
   widget.addEventListener('gmp-error',abort,{once:true});
   widget.addEventListener('gmp-load',()=>{
    const loc=widget.place?.location;
    const lat=typeof loc?.lat==='function'?loc.lat():loc?.lat;
    const lon=typeof loc?.lng==='function'?loc.lng():loc?.lng;
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){abort();return;}
    stop();done({lat,lon});
   },{once:true});
   request.place=id;
  });
 }
 window.JalanGooglePlaceSearch=Object.freeze({configured,mount,resolve});
})();
