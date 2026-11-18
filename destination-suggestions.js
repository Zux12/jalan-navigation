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
  places.forEach((place,index)=>{
   const button=document.createElement('button');button.type='button';button.id='destination-suggestion-'+index;
   button.className='destination-suggestion';button.setAttribute('role','option');button.setAttribute('aria-selected','false');
   const icon=document.createElement('span');icon.className='destination-suggestion-pin';icon.setAttribute('aria-hidden','true');icon.textContent='↗';
   const copy=document.createElement('span'),name=document.createElement('strong'),address=document.createElement('small');
   name.textContent=place.name;address.textContent=place.address;copy.append(name,address);button.append(icon,copy);
   button.addEventListener('click',()=>select(index));list.append(button);
  });open();
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
 async function search(query,id){
  if(id!==epoch||!canSearch()||document.hidden)return;
  const cached=cache.get(query.toLowerCase());
  if(cached&&Date.now()-cached.at<300000){render(cached.places);return;}
  if(Date.now()<cooldown){message('Suggestions are busy. Tap Search or try again shortly.');return;}
  const controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),8000);
  message('Finding places…');list.setAttribute('aria-busy','true');
  const current=()=>id===epoch&&input.value.trim()===query&&!document.hidden&&document.activeElement===input;
  try{
   const url=new URL('https://api.tomtom.com/search/2/search/'+encodeURIComponent(query)+'.json');
   url.searchParams.set('key',key());url.searchParams.set('typeahead','true');url.searchParams.set('countrySet','MY');url.searchParams.set('limit','5');
   // Query text only: typing never requests GPS or sends current coordinates.
   const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(response.status===429)cooldown=Date.now()+30000;
   if(!response.ok)throw Error('Suggestions unavailable');
   const places=normalize(await response.json());if(!current())return;
   cache.set(query.toLowerCase(),{at:Date.now(),places});if(cache.size>20)cache.delete(cache.keys().next().value);
   render(places);
  }catch{if(current())message('Suggestions unavailable. Tap Search to try again.');}
  finally{clearTimeout(timeout);if(id===epoch){list.removeAttribute('aria-busy');request=null;}}
 }
 function schedule(){
  cancel();if(composing)return;
  // Hide old submitted results as soon as the user edits the query.
  list.replaceChildren();list.classList.add('hidden');
  const query=input.value.trim();if(query.length<3||!canSearch())return;
  const id=epoch;timer=setTimeout(()=>search(query,id),450);
 }
 input.addEventListener('input',schedule);
 input.addEventListener('compositionstart',()=>{composing=true;cancel();});
 input.addEventListener('compositionend',()=>{composing=false;schedule();});
 input.addEventListener('blur',()=>{blurTimer=setTimeout(cancel,180);});
 input.addEventListener('keydown',event=>{
  if(composing||event.isComposing||!ownsList)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();return;}
  if(!items.length)return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();active=(active+(event.key==='ArrowDown'?1:active<0?0:-1)+items.length)%items.length;
   for(const [index,button]of [...list.querySelectorAll('[role=option]')].entries())button.setAttribute('aria-selected',String(index===active));
   input.setAttribute('aria-activedescendant','destination-suggestion-'+active);
   list.children[active].scrollIntoView({block:'nearest'});
  }else if(event.key==='Enter'&&active>=0){event.preventDefault();event.stopPropagation();select(active);}
 });
 form.addEventListener('submit',cancel,true);
 document.getElementById('tt-key')?.addEventListener('input',()=>{cache.clear();cancel();});
 document.getElementById('tt-remove-key')?.addEventListener('click',()=>{cache.clear();cancel();});
 window.addEventListener('jalan:destination-selected',cancel);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 window.JalanDestinationSuggestions=Object.freeze({cancel});
})();
