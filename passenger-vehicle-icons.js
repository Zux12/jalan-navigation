// The chosen artwork shares the existing GPS marker, camera and heading.
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const models={classic:'Classic triangle',sedan:'Sedan',hatchback:'Hatchback',suv:'SUV',mpv:'MPV',pickup:'Pickup',motorcycle:'Motorcycle',
   balloon:'Hot-air balloon',wau:'Wau bulan',duck:'Rubber duck'};
 // The fallback artwork uses the same six paint choices.
 const colours={teal:['Teal','#00aaa0'],blue:['Blue','#1975d9'],red:['Red','#cf3447'],
   yellow:['Yellow','#efbb28'],white:['White','#ffffff'],charcoal:['Charcoal','#38414d']};
 const colourNames=Object.keys(colours);
 const key='jalan-passenger-vehicle-icon-v1';
 const sprite=model=>'icons/vehicles/'+model+'.webp';
 const renderer=window.JalanVehicleRenderer;
 let saved=readPreference();
 function readPreference(){
   let value;
   try{value=JSON.parse(localStorage.getItem(key));}catch{}
   const model=Object.hasOwn(models,value?.model)?value.model:'classic';
   const colour=model==='classic'?'blue':Object.hasOwn(colours,value?.colour)?value.colour:'teal';
   return {model,colour};
 }
 function announce(){window.dispatchEvent(new Event('jalan:vehicle-icon-change'));}
 window.addEventListener('storage',event=>{
   if(event.key!==key&&event.key!==null)return;
   saved=readPreference();announce();
 });

 function drawModel(svg,heading,pitch,centered){
   // Leaflet first serializes a detached triangle as its marker template.
   // Its live Leaflet and MapLibre instances each own their own drawing surface.
   if(!svg.isConnected)return false;
   const {model,colour}=saved;
   let canvas=svg.nextElementSibling;
   if(!canvas?.classList.contains('vehicle-map-mesh'))canvas=null;
   if(model==='classic'){
     if(canvas){
       canvas.remove();
       delete svg.dataset.vehicleModel;delete svg.dataset.heading;delete svg.dataset.pitch;
     }
     return false;
   }
   if(!canvas){
     canvas=document.createElement('canvas');canvas.className='vehicle-map-mesh';
     canvas.setAttribute('aria-hidden','true');svg.after(canvas);
   }
   if(!renderer.draw(canvas,model,colours[colour][1],heading,pitch,centered)){
     canvas.remove();delete svg.dataset.vehicleModel;return false;
   }
   if(svg.dataset.vehicleModel!==model)svg.dataset.vehicleModel=model;
   return true;
 }

 function setupPicker(triangle){
   const trigger=document.getElementById('passenger-vehicle-choice');
   if(!trigger)return;
   const dialog=document.createElement('dialog');
   dialog.id='passenger-vehicle-picker';dialog.className='jalan-menu-dialog';
   dialog.setAttribute('aria-labelledby','vehicle-picker-title');
   dialog.innerHTML=`
     <h2 id="vehicle-picker-title" tabindex="-1">Vehicle icon</h2>
     <div class="vehicle-road-preview" aria-hidden="true">
       <svg viewBox="0 0 320 92" preserveAspectRatio="none">
         <rect width="320" height="92" fill="#e8eeec"/>
         <path d="M-15 84L71 38 95-8M-8 17L128 44 340 80M217-12L230 27 302 103M18 105L126 73 218 61 335 12" fill="none" stroke="#fff" stroke-width="7"/>
         <path d="M160 103V48Q160 32 177 26L253-9" fill="none" stroke="#fff" stroke-width="12"/>
         <path d="M160 103V48Q160 32 177 26L253-9" fill="none" stroke="#1973ea" stroke-width="7"/>
       </svg>
       <div class="vehicle-preview-icon"></div>
     </div>
     <label class="vehicle-view-choice"><span>Preview angle</span><select>
       <option value="rear">Rear view</option><option value="front">Front view</option>
       <option value="side">Side view</option><option value="top">Top view</option>
     </select></label>
     <fieldset class="vehicle-models"><legend>Model</legend><div class="vehicle-model-grid"></div></fieldset>
     <fieldset class="vehicle-colours"><legend>Colour</legend><div class="vehicle-colour-grid"></div></fieldset>
     <div class="vehicle-picker-actions"><button type="button" class="jalan-dialog-secondary">Cancel</button><button type="button" class="jalan-dialog-ok">Save</button></div>`;
   const modelGrid=dialog.querySelector('.vehicle-model-grid'),colourGrid=dialog.querySelector('.vehicle-colour-grid');
   const colourField=dialog.querySelector('.vehicle-colours'),preview=dialog.querySelector('.vehicle-preview-icon');
   const angleSelect=dialog.querySelector('.vehicle-view-choice select');
   const angles={rear:[-24,53],front:[155,66],side:[90,70],top:[0,0]};
   let draft;
   function option(group,value,label,art){
     const wrapper=document.createElement('label'),radio=document.createElement('input'),caption=document.createElement('span');
     radio.type='radio';radio.name='vehicle-picker-'+group;radio.value=value;
     caption.textContent=label;wrapper.append(radio,art,caption);
     return wrapper;
   }
   function paintArt(icon,model,colour,angle){
     if(!renderer.draw(icon,model,colours[colour][1],angle[0],angle[1],true)){
       icon.style.backgroundImage='url("'+sprite(model)+'")';
       icon.style.backgroundPositionX=(colourNames.indexOf(colour)*20)+'%';
     }
   }
   function modelArt(model){
     if(model==='classic')return triangle.cloneNode(true);
     const icon=document.createElement('canvas');
     icon.className='vehicle-model-art';icon.setAttribute('aria-hidden','true');
     return icon;
   }
   function paintPreview(){
     const {model,colour}=draft;
     preview.replaceChildren(modelArt(model));
     if(model!=='classic')paintArt(preview.firstChild,model,colour,angles[angleSelect.value]);
   }
   function paint(){
     for(const control of modelGrid.querySelectorAll('input')){
       control.checked=control.value===draft.model;
       const art=control.nextElementSibling;
       if(control.value!=='classic')paintArt(art,control.value,draft.colour,angles.rear);
     }
     const classic=draft.model==='classic';
     angleSelect.parentElement.hidden=classic;
     colourField.hidden=classic;colourField.disabled=classic;
     for(const control of colourGrid.querySelectorAll('input'))control.checked=control.value===draft.colour;
     paintPreview();
   }
   trigger.addEventListener('click',()=>{
     if(dialog.open)return;
     if(!modelGrid.childElementCount){
       for(const [model,label] of Object.entries(models))modelGrid.append(option('model',model,label,modelArt(model)));
       for(const [colour,[label,hex]] of Object.entries(colours)){
         const swatch=document.createElement('i');swatch.style.backgroundColor=hex;
         colourGrid.append(option('colour',colour,label,swatch));
       }
     }
     draft={model:saved.model,colour:saved.model==='classic'?'teal':saved.colour};
     angleSelect.value='rear';
     window.JalanPassengerMenu.close();
     const menu=document.getElementById('jalan-home-menu');menu.focus({preventScroll:true});
     dialog.showModal();document.body.classList.add('passenger-modal-open');
     paint();dialog.scrollTop=0;dialog.querySelector('h2').focus({preventScroll:true});
   });
   angleSelect.addEventListener('change',paintPreview);
   dialog.addEventListener('change',event=>{
     const radio=event.target;
     if(radio.name==='vehicle-picker-model')draft.model=radio.value;
     else if(radio.name==='vehicle-picker-colour')draft.colour=radio.value;
     else return;
     paint();
   });
   dialog.querySelector('.jalan-dialog-ok').addEventListener('click',()=>{
     saved={model:draft.model,colour:draft.model==='classic'?'blue':draft.colour};
     try{localStorage.setItem(key,JSON.stringify(saved));}catch{}
     announce();dialog.close();
   });
   dialog.querySelector('.jalan-dialog-secondary').addEventListener('click',()=>dialog.close());
   dialog.addEventListener('close',()=>document.body.classList.toggle('passenger-modal-open',!!document.querySelector('dialog[open]')));
   document.body.append(dialog);
 }
 window.JalanVehicleIcons={drawModel,setupPicker};
})();
