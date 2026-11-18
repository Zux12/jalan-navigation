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
  const content=document.createElement('gmp-place-standard-content');
  const request=document.createElement('gmp-place-text-search-request');
  request.maxResultCount=5;
  // Fixed Malaysia bounds, never the user's precise location. Bounds include
  // Peninsular and East Malaysia; Google may also use its normal IP bias.
  request.locationRestriction={south:0.8,west:99.5,north:7.5,east:119.5};
  widget.append(content,request);
  let timeout=setTimeout(()=>{if(!signal.aborted){widget.remove();onError();}},12000);
  const cleanup=()=>{clearTimeout(timeout);widget.remove();};
  signal.addEventListener('abort',cleanup,{once:true});
  widget.addEventListener('gmp-load',()=>{
   if(signal.aborted)return;clearTimeout(timeout);
   if(!widget.places?.length){widget.remove();onEmpty();}else onReady();
  });
  widget.addEventListener('gmp-error',()=>{if(!signal.aborted){clearTimeout(timeout);widget.remove();onError();}});
  widget.addEventListener('gmp-select',event=>{
   if(signal.aborted)return;
   const place=event.place,location=place?.location;
   const lat=typeof location?.lat==='function'?location.lat():location?.lat;
   const lon=typeof location?.lng==='function'?location.lng():location?.lng;
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){onError();return;}
   // Do not call ordinary Places fetchFields: this integration uses UI Kit.
   // Some widget versions return only ID/point; never invent a business name.
   const name=typeof place.displayName==='string'?place.displayName:'Selected destination';
   onSelect({lat,lon,name,display_name:name});
  });
  container.replaceChildren(widget);
  request.textQuery=query;
 }
 window.JalanGooglePlaceSearch=Object.freeze({configured,mount});
})();
