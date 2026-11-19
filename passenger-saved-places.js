/* Explicitly saved passenger shortcuts live in this browser. */
'use strict';
function installSavedPlaces({sheet,quick,recent,header,input,results,expand}){
 const key='jalan-passenger-saved-places-v1';
 const fixedName=id=>id==='home'?'Home':id==='work'?'Work':'';
 const editor=document.createElement('section');
 editor.className='jalan-place-editor';editor.hidden=true;
 editor.innerHTML='<div class="jalan-place-heading"><h2></h2><button type="button" data-action="cancel">Cancel</button></div>'+
   '<label>Shortcut name<input maxlength="64" autocomplete="off" placeholder="e.g. Parents’ house"></label>'+
   '<div class="jalan-place-details"></div><p role="status" aria-live="polite"></p>'+
   '<button type="button" data-action="save">Save</button> '+
   '<button type="button" data-action="remove" hidden></button>';
 sheet.insertBefore(editor,header);
 const saved=document.createElement('section');saved.className='jalan-saved-places';
 saved.innerHTML='<h3>Saved places</h3><ul></ul>';recent.prepend(saved);
 const title=editor.querySelector('h2'),label=editor.querySelector('label'),name=label.querySelector('input'),
   message=editor.querySelector('[role=status]'),details=editor.querySelector('.jalan-place-details'),
   save=editor.querySelector('[data-action=save]'),list=saved.querySelector('ul');
 const remove=editor.querySelector('[data-action=remove]');
 const originalPlaceholder=window.JalanLanguage.sourceAttribute(input,'placeholder');
 let draft=null;
 function entries(){
   const stored=JSON.parse(localStorage.getItem(key)||'[]');
   return Array.isArray(stored)?stored.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&
     (typeof p.googleId==='string'&&p.googleId.length>0||Array.isArray(p.point)&&validCoordinates(p.point))):[];
 }
 function render(){
   let places=[];
   try{places=entries();}catch{/* The Save action reports unavailable browser storage. */}
   list.replaceChildren();saved.hidden=!places.length;
   for(const place of places){
     const row=document.createElement('li'),go=document.createElement('button'),edit=document.createElement('button');
     go.type=edit.type='button';go.translate=!!fixedName(place.id);go.textContent=place.name;
     if(place.address){const address=document.createElement('small');address.translate=false;address.textContent=place.address;go.append(address);}
     go.addEventListener('click',()=>open(place.id));
     edit.className='jalan-edit-place';edit.textContent='Edit';edit.setAttribute('aria-label','Edit '+place.name);
     edit.addEventListener('click',()=>editPlace(place.id,place));
     row.append(go,edit);list.append(row);
   }
 }
 function cancel(focus=false){
   if(!draft)return false;
   const old=draft;draft=null;old.controller.abort();
   window.JalanDestinationSuggestions?.cancel();
   results.replaceChildren();results.classList.add('hidden');
   input.value=old.inputValue;input.placeholder=originalPlaceholder;editor.hidden=true;
   details.replaceChildren();sheet.removeAttribute('data-place-mode');
   if(focus&&old.trigger?.isConnected)old.trigger.focus({preventScroll:true});
   return true;
 }
 function begin(id){
   cancel();expand();
   draft={id,inputValue:input.value,trigger:document.activeElement,controller:new AbortController(),place:null};
   window.JalanDestinationSuggestions?.cancel();results.replaceChildren();results.classList.add('hidden');
   title.translate=true;message.translate=true;remove.hidden=true;input.value='';editor.hidden=false;message.textContent='';details.replaceChildren();return draft;
 }
 function editPlace(id,stored){
   const current=begin(id);
   sheet.dataset.placeMode='edit';
   current.place=stored||null;
   remove.hidden=!stored;
   if(stored)remove.textContent=fixedName(id)?'Remove address':'Remove saved place';
   title.textContent=fixedName(id)?(stored?'Edit ':'Set ')+fixedName(id):stored?'Edit saved place':'New saved place';
   label.hidden=Boolean(fixedName(id));name.value=stored?.name||'';
   input.placeholder='Search for an address or place';
   message.translate=!stored?.address;message.textContent=stored?(stored.address||'Choose a new address to replace the saved location.'):'Choose an address from the search results.';
   save.hidden=false;save.disabled=!current.place||(!fixedName(id)&&!name.value.trim());
   input.focus({preventScroll:true});
 }
 function pick(place){
   if(!draft||sheet.dataset.placeMode!=='edit')return false;
   const address=String(place.display_name||place.name||'Selected place');
   if(place.source==='google'&&!place.googleId){
     message.translate=true;message.textContent='This result has no place ID. Choose another result.';return true;
   }
   draft.place=place.googleId?{googleId:place.googleId}:{point:[Number(place.lat),Number(place.lon)],address};
   message.translate=true;input.value=address;results.classList.add('hidden');message.textContent='Selected · '+address;
   if(!fixedName(draft.id)&&!name.value.trim())name.focus({preventScroll:true});
   save.disabled=!fixedName(draft.id)&&!name.value.trim();
   return true;
 }
 async function open(id){
   let place;
   try{place=entries().find(p=>p.id===id);}catch{}
   if(!place){editPlace(id==='new'?crypto.randomUUID():id);return;}
   cancel();
   if(!place.googleId){
     selectDestinationPlace({lat:place.point[0],lon:place.point[1],name:place.name,display_name:place.address||place.name});
     return;
   }
   const current=begin(id);sheet.dataset.placeMode='resolve';
   title.translate=!!fixedName(id);title.textContent=place.name;label.hidden=true;save.hidden=true;message.textContent='Finding saved place…';
   try{
     const point=await window.JalanGooglePlaceSearch.resolve(place.googleId,details,current.controller.signal);
     if(draft!==current)return;
     cancel();selectDestinationPlace({...point,name:place.name,display_name:place.name,source:'google',googleId:place.googleId});
   }catch{
     if(draft!==current)return;
     editPlace(id,place);message.translate=true;message.textContent='Could not open the saved location. Cancel to keep it, or choose a new address.';
   }
 }
 name.addEventListener('input',()=>{save.disabled=!draft?.place||!name.value.trim();});
 input.addEventListener('input',()=>{
   if(!draft||sheet.dataset.placeMode!=='edit')return;
   draft.place=null;save.disabled=true;message.translate=true;message.textContent='Choose an address from the search results.';
 });
 save.addEventListener('click',()=>{
   if(!draft?.place)return;
   const id=draft.id,shortName=fixedName(id)||name.value.trim();if(!shortName)return;
   try{
     const places=entries(),entry={...draft.place,id,name:shortName},i=places.findIndex(p=>p.id===id);
     if(i<0)places.push(entry);else places[i]=entry;
     localStorage.setItem(key,JSON.stringify(places));
   }catch{message.translate=true;message.textContent='Could not save on this device. Check browser storage and try again.';return;}
   cancel(true);render();
 });
 remove.addEventListener('click',()=>{
   if(!draft||remove.hidden)return;
   const id=draft.id,fixed=fixedName(id);
   try{
     const places=entries(),place=places.find(entry=>entry.id===id);
     if(place){
       const question=fixed?'Remove the saved address for '+fixed+'?':'Remove “'+place.name+'” from your saved places?';
       if(!window.confirm(window.JalanLanguage?.translate(question)??question))return;
       const remaining=entries().filter(entry=>entry.id!==id);
       if(remaining.length)localStorage.setItem(key,JSON.stringify(remaining));
       else localStorage.removeItem(key);
     }
   }catch{message.translate=true;message.textContent='Could not remove this place. Check browser storage and try again.';return;}
   cancel();render();
   quick.querySelector('[data-shortcut="'+(fixed?id:'new')+'"]')?.focus({preventScroll:true});
 });
 editor.querySelector('[data-action=cancel]').addEventListener('click',()=>cancel(true));
 quick.addEventListener('click',event=>{
   const id=event.target.closest('button[data-shortcut]')?.dataset.shortcut;
   if(id)open(id);
 });
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)render();});
 render();
 return {pick,cancel};
}
