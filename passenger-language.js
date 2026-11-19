// Passenger UI keeps the original text so a language switch never rebuilds the journey.
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const key='jalan-passenger-language-v1',sources=new WeakMap(),phrases=new WeakMap();
 const attributes=['aria-label','aria-description','placeholder','title','alt'];
 const excluded='script,style,svg,canvas,template,[translate="no"],#info-panel,#gps-hud,#nav-hud,gmp-place-search,gmp-place-details-compact,.maplibregl-ctrl-attrib,.leaflet-control-attribution';
 const mapLabels='.leaflet-popup-content,.maplibregl-popup-content,.leaflet-tooltip,.leaflet-control-zoom a,.leaflet-marker-icon,.passenger-delta-pin,.jalan-vector-pin,.maplibregl-canvas-container .maplibregl-marker';
 let code='en';
 try{if(localStorage.getItem(key)==='ms')code='ms';}catch{}
 const translate=value=>code==='ms'?(window.JalanMalayCopy?.translate(value)??value):value;
 function accepts(element){
   if(!element||element.closest(excluded))return false;
   return !element.closest('#map')||!!element.closest(mapLabels);
 }
 function localize(node,field,raw){
   if(!raw||!raw.trim())return;
   let record=sources.get(node);
   const previous=record?.get(field);
   const original=previous?.shown===raw?previous.original:raw;
   const phrase=field==='text'?phrases.get(node.parentElement):null;
   const shown=code==='ms'&&phrase?.english===original?phrase.malay:
     original.replace(/\S(?:[\s\S]*\S)?/,text=>translate(text));
   if(raw!==shown){
     if(!record){record=new Map();sources.set(node,record);}
     record.set(field,{original,shown});
     if(field==='text')node.data=shown;else node.setAttribute(field,shown);
   }else if(previous&&previous.shown!==raw)record.delete(field);
 }
 function visit(node){
   if(node.nodeType===Node.TEXT_NODE){
     if(accepts(node.parentElement))localize(node,'text',node.data);
     return;
   }
   if(node.nodeType!==Node.ELEMENT_NODE||node.matches(excluded))return;
   if(node.id==='map'){
     for(const field of attributes)if(node.hasAttribute(field))localize(node,field,node.getAttribute(field));
     node.querySelectorAll(mapLabels).forEach(visit);
     return;
   }
   if(!accepts(node))return;
   for(const field of attributes)if(node.hasAttribute(field))localize(node,field,node.getAttribute(field));
   for(const child of node.childNodes)visit(child);
 }
 const observer=new MutationObserver(records=>{
   for(const record of records){
     if(record.type==='attributes'){
       if(accepts(record.target))localize(record.target,record.attributeName,record.target.getAttribute(record.attributeName));
     }else if(record.type==='characterData')visit(record.target);
     else for(const node of record.addedNodes)visit(node);
   }
 });
 function observe(){
   if(code==='ms')observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
 }
 function change(value,persist=true){
   if(value!=='ms'&&value!=='en')return;
   if(persist)try{localStorage.setItem(key,value);}catch{}
   if(value===code)return;
   observer.disconnect();code=value;document.documentElement.lang=code;
   const title=document.querySelector('title');if(title)visit(title);
   if(document.body)visit(document.body);
   observe();window.dispatchEvent(new CustomEvent('jalan:language-change',{detail:{language:code}}));
 }
 function write(element,english,malay){
   if(typeof malay==='string')phrases.set(element,{english,malay});else phrases.delete(element);
   const shown=code==='ms'?(malay??translate(english)):english;
   element.textContent=shown;
   if(shown!==english&&element.firstChild)sources.set(element.firstChild,new Map([['text',{original:english,shown}]]));
 }
 function sourceAttribute(element,field){
   const raw=element.getAttribute(field),last=sources.get(element)?.get(field);
   return last?.shown===raw?last.original:raw;
 }
 window.JalanLanguage={get code(){return code;},set:change,translate,write,sourceAttribute};
 document.documentElement.lang=code;observe();
 window.addEventListener('storage',e=>{if(e.key===key||e.key===null)change(e.newValue==='ms'?'ms':'en',false);});
})();
