/* Predictive place lookup uses TomTom; public Nominatim remains submit-only. */
(() => {
 'use strict';
 const input=document.getElementById('destination'),list=document.getElementById('results'),form=document.getElementById('search-form');
 if(!input||!list||!form)return;
 let timer,blurTimer,request,epoch=0,ownsList=false,items=[],active=-1,composing=false,cooldown=0;
 const cache=new Map();
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
 input.setAttribute('aria-controls','results');input.setAttribute('aria-expanded','false');input.autocomplete='off';
 const key=()=>document.getElementById('tt-key')?.value.trim()||'';
 const canSearch=()=>/^[\w-]{8,160}$/.test(key());
 function cancel(){
  clearTimeout(timer);clearTimeout(blurTimer);request?.abort();request=null;epoch++;active=-1;items=[];
  input.setAttribute('aria-controls','results');
  input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
  list.removeAttribute('aria-busy');
  if(ownsList){list.replaceChildren();list.classList.add('hidden');list.removeAttribute('role');list.removeAttribute('aria-label');}
  ownsList=false;window.dispatchEvent(new Event('jalan:destination-search-cancel'));
 }
 function open(){ownsList=true;list.classList.remove('hidden');list.setAttribute('role','listbox');list.setAttribute('aria-label','Destination suggestions');input.setAttribute('aria-expanded','true');}
 function message(text){list.replaceChildren();const row=document.createElement('p');row.className='destination-search-note';row.setAttribute('role','status');row.textContent=text;list.append(row);open();}
 function select(index){const place=items[index];if(!place)return;cancel();input.blur();selectDestinationPlace(place);}
 function render(places){
  list.replaceChildren();items=places;active=-1;input.removeAttribute('aria-activedescendant');
  if(!places.length){message('No suggestions yet. Try a fuller place name or tap Search.');return;}
  open();
  list.setAttribute('role','region');
  const container=document.createElement('div');
  container.id='tomtom-destination-results';
  container.setAttribute('role','listbox');
  container.setAttribute('aria-label','Destination suggestions');
  list.append(container);
  input.setAttribute('aria-controls',container.id);
  places.forEach((place,index)=>{
   const button=document.createElement('button');button.type='button';button.id='destination-suggestion-'+index;
   button.className='destination-suggestion';button.setAttribute('role','option');button.setAttribute('aria-selected','false');
   const icon=document.createElement('span');icon.className='destination-suggestion-pin';icon.setAttribute('aria-hidden','true');icon.textContent='↗';
   const copy=document.createElement('span'),name=document.createElement('strong'),address=document.createElement('small');
   copy.translate=false;
   name.textContent=place.name;address.textContent=place.address;copy.append(name,address);button.append(icon,copy);
   button.addEventListener('click',()=>select(index));container.append(button);
  });
 }
 function normalize(payload){
  const seen=new Set();return (Array.isArray(payload?.results)?payload.results:[]).flatMap(result=>{
   const lat=result.position?.lat,lon=result.position?.lon;
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return [];
   const address=String(result.address?.freeformAddress||'').trim(),name=String(result.poi?.name||address).trim();
   if(!name)return [];const id=name+'|'+lat+'|'+lon;if(seen.has(id))return [];seen.add(id);
   return [{lat,lon,name,address:address===name?'':address,display_name:address&&address!==name?name+', '+address:name}];
  }).slice(0,5);
 }
 async function fetchTomTom(query,signal){
  if(Date.now()<cooldown)throw Error('TomTom temporarily busy');
  const url=new URL('https://api.tomtom.com/search/2/search/'+encodeURIComponent(query)+'.json');
  url.searchParams.set('key',key());
  url.searchParams.set('typeahead','true');
  url.searchParams.set('countrySet','MY');
  url.searchParams.set('limit','5');
  const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(response.status===429)cooldown=Date.now()+30000;
  if(!response.ok)throw Error('TomTom suggestions unavailable');
  return normalize(await response.json());
 }
 async function search(query,id){
  const google=window.JalanGooglePlaceSearch;
  const withGoogle=google?.configured()===true;
  if(id!==epoch||document.hidden||(!canSearch()&&!withGoogle))return;
  const current=()=>id===epoch&&input.value.trim()===query&&!document.hidden;
  const cached=cache.get(query.toLowerCase());
  if(!withGoogle&&cached&&Date.now()-cached.at<300000){render(cached.places);return;}

  const controller=new AbortController();
  request=controller;
  message('Finding places…');
  list.setAttribute('aria-busy','true');
  let places=[];
  let tomTomFailed=false;
  if(canSearch()){
   const provider=new AbortController();
   const abortTomTom=()=>provider.abort();
   controller.signal.addEventListener('abort',abortTomTom,{once:true});
   const timeout=setTimeout(abortTomTom,8000);
   try{places=await fetchTomTom(query,provider.signal);}
   catch{tomTomFailed=true;}
   finally{clearTimeout(timeout);controller.signal.removeEventListener('abort',abortTomTom);}
  }
  if(!current())return;
  list.removeAttribute('aria-busy');
  // A single term may be a provider-known alias (for example KLCC).
  // A business plus a locality must match together, with either provider configuration.
  const words=query.match(/[\p{L}\p{N}]+/gu)||[];
  const matching=words.length>1||withGoogle
   ?places.filter(place=>window.JalanDestinationMatch.matches(query,place))
   :places;
  if(!withGoogle){
   if(tomTomFailed){
    message(Date.now()<cooldown?'Suggestions are busy. Tap Search or try again shortly.':'Suggestions unavailable. Tap Search to try again.');
   }else{
    cache.set(query.toLowerCase(),{at:Date.now(),places:matching});
    if(cache.size>20)cache.delete(cache.keys().next().value);
    render(matching);
   }
   return;
  }

  list.replaceChildren();
  list.setAttribute('role','region');
  list.setAttribute('aria-label','Destination suggestions');
  if(matching.length)render(matching);
  input.setAttribute('aria-expanded',String(matching.length>0));
  const section=document.createElement('div');
  section.className='destination-google-section';
  section.setAttribute('role','region');
  section.setAttribute('aria-label','Google Maps Results');
  section.setAttribute('aria-busy','true');
  list.append(section);
  function googleNote(text){
   const note=document.createElement('p');
   note.className='destination-search-note';
   note.setAttribute('role','status');
   note.textContent=text;
   section.replaceChildren(note);
  }
  googleNote('Checking Google for places…');
  const caption=document.createElement('h3');
  caption.className='destination-google-caption';
  caption.textContent='Results';
  caption.setAttribute('aria-label','Google Maps Results');
  function finished(){section.removeAttribute('aria-busy');}
  function googleReady(){
   if(!current())return;
   finished();
   section.prepend(caption);
  }
  function failed(){
   if(!current())return;
   finished();
   googleNote('Google suggestions unavailable. Try again shortly.');
  }
  try{
   await google.mount({query,container:section,signal:controller.signal,
    onSelect:place=>{if(current()){cancel();input.blur();selectDestinationPlace(place);}},
    onEmpty:()=>{
     if(!current())return;
     finished();
     if(matching.length)section.remove();
     else googleNote(tomTomFailed?'TomTom is unavailable and Google found no matches.':'No matching places found. Try a fuller place name.');
    },
    onError:failed,onReady:googleReady
   });
  }catch{failed();}
 }
 function schedule(){
  cancel();if(composing)return;
  // Hide old submitted results as soon as the user edits the query.
  list.replaceChildren();list.classList.add('hidden');
  const query=input.value.trim();if(query.length<3||(!canSearch()&&!window.JalanGooglePlaceSearch?.configured()))return;
  const id=epoch;timer=setTimeout(()=>search(query,id),450);
 }
 input.addEventListener('input',schedule);
 input.addEventListener('compositionstart',()=>{composing=true;cancel();});
 input.addEventListener('compositionend',()=>{composing=false;schedule();});
 input.addEventListener('blur',()=>{blurTimer=setTimeout(()=>{if(!list.contains(document.activeElement))cancel();},180);});
 list.addEventListener('focusout',()=>{blurTimer=setTimeout(()=>{if(document.activeElement!==input&&!list.contains(document.activeElement))cancel();},180);});
 input.addEventListener('keydown',event=>{
  if(composing||event.isComposing||!ownsList)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();return;}
  if(!items.length)return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();active=(active+(event.key==='ArrowDown'?1:active<0?0:-1)+items.length)%items.length;
   for(const [index,button]of [...list.querySelectorAll('[role=option]')].entries())button.setAttribute('aria-selected',String(index===active));
   input.setAttribute('aria-activedescendant','destination-suggestion-'+active);
   document.getElementById('destination-suggestion-'+active).scrollIntoView({block:'nearest'});
  }else if(event.key==='Enter'&&active>=0){event.preventDefault();event.stopPropagation();select(active);}
 });
 form.addEventListener('submit',event=>{
  const useFallback=window.JalanGooglePlaceSearch?.configured()===true;
  cancel();
  if(useFallback){
   event.preventDefault();event.stopImmediatePropagation();input.focus();
   const query=input.value.trim();if(query.length>=3)search(query,epoch);
  }
 },true);
 document.getElementById('tt-key')?.addEventListener('input',()=>{cache.clear();cancel();});
 document.getElementById('tt-remove-key')?.addEventListener('click',()=>{cache.clear();cancel();});
 window.addEventListener('jalan:destination-selected',cancel);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 window.JalanDestinationSuggestions=Object.freeze({cancel});
})();
