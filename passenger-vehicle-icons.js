// The chosen artwork shares the existing GPS marker, camera and heading.
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const models={classic:'Classic triangle',sedan:'Sedan',hatchback:'Hatchback',suv:'SUV',mpv:'MPV',pickup:'Pickup',motorcycle:'Motorcycle'};
 // The six frames in each model image follow this order.
 const colours={teal:['Teal','#00aaa0'],blue:['Blue','#1975d9'],red:['Red','#cf3447'],
   yellow:['Yellow','#efbb28'],white:['White','#fff'],charcoal:['Charcoal','#38414d']};
 const colourNames=Object.keys(colours);
 const key='jalan-passenger-vehicle-icon-v1';
 const sprite=model=>'icons/vehicles/'+model+'.webp';
 const ns='http://www.w3.org/2000/svg';
 const loaded=new Map();
 let saved=readPreference();
 function readPreference(){
   let value;
   try{value=JSON.parse(localStorage.getItem(key));}catch{}
   const model=Object.hasOwn(models,value?.model)?value.model:'classic';
   const colour=model==='classic'?'blue':Object.hasOwn(colours,value?.colour)?value.colour:'teal';
   return {model,colour};
 }
 function announce(){window.dispatchEvent(new Event('jalan:vehicle-icon-change'));}
 function loadSprite(model){
   if(model==='classic'||loaded.has(model))return;
   const img=new Image();loaded.set(model,img);
   img.onload=()=>{if(saved.model===model)announce();};
   img.onerror=()=>{loaded.delete(model);};
   img.src=sprite(model);
 }
 loadSprite(saved.model);
 window.addEventListener('storage',event=>{
   if(event.key!==key&&event.key!==null)return;
   saved=readPreference();loadSprite(saved.model);announce();
 });

 // Keep the triangle visible while the selected asset is loading.
 function drawModel(svg,heading){
   const {model,colour}=saved;
   const image=loaded.get(model);
   if(model==='classic'||!image?.complete||!image.naturalWidth){
     if(svg.hasAttribute('data-vehicle-model')){
       svg.lastElementChild.remove();
       delete svg.dataset.vehicleModel;delete svg.dataset.heading;delete svg.dataset.pitch;
       svg.setAttribute('viewBox','-42 -42 84 84');
     }
     return false;
   }
   let viewport=svg.lastElementChild;
   if(svg.dataset.vehicleModel!==model){
     if(svg.hasAttribute('data-vehicle-model'))viewport.remove();
     viewport=document.createElementNS(ns,'svg');
     for(const [attr,value] of Object.entries({x:-34,y:-34,width:68,height:68,overflow:'hidden'}))viewport.setAttribute(attr,value);
     const strip=document.createElementNS(ns,'image');
     strip.setAttribute('width','960');strip.setAttribute('height','160');strip.setAttribute('href',sprite(model));
     viewport.append(strip);svg.append(viewport);
     svg.dataset.vehicleModel=model;
     svg.setAttribute('viewBox','-42 -42 84 84');
   }
   if(viewport.dataset.colour!==colour){
     viewport.setAttribute('viewBox',(160*colourNames.indexOf(colour))+' 0 160 160');
     viewport.dataset.colour=colour;
   }
   const rotation='rotate('+heading+')';
   if(viewport.getAttribute('transform')!==rotation)viewport.setAttribute('transform',rotation);
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
     <fieldset class="vehicle-models"><legend>Model</legend><div class="vehicle-model-grid"></div></fieldset>
     <fieldset class="vehicle-colours"><legend>Colour</legend><div class="vehicle-colour-grid"></div></fieldset>
     <div class="vehicle-picker-actions"><button type="button" class="jalan-dialog-secondary">Cancel</button><button type="button" class="jalan-dialog-ok">Save</button></div>`;
   const modelGrid=dialog.querySelector('.vehicle-model-grid'),colourGrid=dialog.querySelector('.vehicle-colour-grid');
   const colourField=dialog.querySelector('.vehicle-colours'),preview=dialog.querySelector('.vehicle-preview-icon');
   let draft;
   function option(group,value,label,art){
     const wrapper=document.createElement('label'),radio=document.createElement('input'),caption=document.createElement('span');
     radio.type='radio';radio.name='vehicle-picker-'+group;radio.value=value;
     caption.textContent=label;wrapper.append(radio,art,caption);
     return wrapper;
   }
   function modelArt(model,colour){
     if(model==='classic')return triangle.cloneNode(true);
     const icon=document.createElement('span');
     icon.className='vehicle-model-art';icon.setAttribute('aria-hidden','true');
     icon.style.backgroundImage='url("'+sprite(model)+'")';
     icon.style.backgroundPositionX=(colourNames.indexOf(colour)*20)+'%';
     return icon;
   }
   function paint(){
     for(const control of modelGrid.querySelectorAll('input')){
       control.checked=control.value===draft.model;
       const art=control.nextElementSibling;
       if(control.value!=='classic')art.style.backgroundPositionX=(colourNames.indexOf(draft.colour)*20)+'%';
     }
     const classic=draft.model==='classic';
     colourField.hidden=classic;colourField.disabled=classic;
     for(const control of colourGrid.querySelectorAll('input'))control.checked=control.value===draft.colour;
     preview.replaceChildren(modelArt(draft.model,draft.colour));
   }
   trigger.addEventListener('click',()=>{
     if(dialog.open)return;
     if(!modelGrid.childElementCount){
       for(const [model,label] of Object.entries(models))modelGrid.append(option('model',model,label,modelArt(model,'teal')));
       for(const [colour,[label,hex]] of Object.entries(colours)){
         const swatch=document.createElement('i');swatch.style.backgroundColor=hex;
         colourGrid.append(option('colour',colour,label,swatch));
       }
     }
     draft={model:saved.model,colour:saved.model==='classic'?'teal':saved.colour};
     loadSprite(saved.model);paint();
     window.JalanPassengerMenu.close();
     const menu=document.getElementById('jalan-home-menu');menu.focus({preventScroll:true});
     dialog.showModal();document.body.classList.add('passenger-modal-open');
     dialog.scrollTop=0;dialog.querySelector('h2').focus({preventScroll:true});
   });
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
     loadSprite(saved.model);announce();dialog.close();
   });
   dialog.querySelector('.jalan-dialog-secondary').addEventListener('click',()=>dialog.close());
   dialog.addEventListener('close',()=>document.body.classList.toggle('passenger-modal-open',!!document.querySelector('dialog[open]')));
   document.body.append(dialog);
 }
 window.JalanVehicleIcons={drawModel,setupPicker};
})();
