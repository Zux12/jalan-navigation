/* Passenger Sound and About dialogs; provider credentials are not user controls. */
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const el=id=>document.getElementById(id),sound=document.createElement('dialog'),about=document.createElement('dialog');
 sound.id='passenger-sound-dialog';about.id='passenger-about-dialog';
 for(const [dialog,title] of [[sound,'passenger-sound-title'],[about,'passenger-about-title']]){
  dialog.className='jalan-menu-dialog';dialog.setAttribute('aria-labelledby',title);
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
 }
 sound.innerHTML='<h2 id="passenger-sound-title">Sound</h2>'+
  '<fieldset><legend>Voice guidance</legend>'+
  '<label><input type="radio" name="passenger-sound-mode" value="full"> Full guidance</label>'+
  '<label><input type="radio" name="passenger-sound-mode" value="alerts"> Alerts only</label>'+
  '<label><input type="radio" name="passenger-sound-mode" value="mute"> Mute</label></fieldset>'+
  '<label for="passenger-voice-choice">Voice</label><select id="passenger-voice-choice" aria-describedby="passenger-voice-status"></select>'+
  '<button type="button" id="passenger-voice-preview" class="jalan-dialog-secondary">Play sample</button>'+
  '<p id="passenger-voice-status" role="status"></p>'+
  '<button type="button" id="passenger-sound-ok" class="jalan-dialog-ok">OK</button>';
 about.innerHTML=`
  <div class="jalan-about-grip" aria-hidden="true"><span></span></div>
  <h2 id="passenger-about-title" tabindex="-1">About JALAN</h2>
  <div class="jalan-about-identity">
   <img src="icons/jalan-192.png" width="64" height="64" alt="">
   <div><strong translate="no">JALAN</strong><p id="passenger-app-version"></p></div>
  </div>
  <p class="jalan-about-description">Navigation for Malaysia with live traffic, road reports, and turn-by-turn directions.</p>
  <p class="jalan-about-developer"><span>Developed by</span> <strong translate="no">IgniteInno Ventures</strong></p>
  <p class="jalan-about-origin"><span aria-hidden="true">🇲🇾</span> <span>Made in Malaysia</span></p>
  <section id="passenger-map-licences" class="jalan-about-licences" aria-label="Map data licences">
   <h3>Map data licences</h3>
   <p translate="no"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a></p>
  </section>
  <a id="passenger-policy" href="https://igniteinnov.com/jalan/policy.html?lang=en" target="_blank" rel="noopener noreferrer">Privacy &amp; terms</a>
  <button type="button" id="passenger-about-ok" class="jalan-dialog-ok">Done</button>`;
 document.body.append(sound,about);
 const choice=el('passenger-voice-choice'),status=el('passenger-voice-status');
 const paintVoices=()=>{
  const state=window.JalanVoice.getState(),pending=sound.open?choice.value:state.selected;
  choice.replaceChildren(new Option(state.recorded?'Rakaman Bahasa Melayu':'Automatic · device default',''));
  for(const voice of state.voices)choice.add(new Option(voice.name+' · '+voice.lang,voice.id));
  choice.value=Array.from(choice.options).some(x=>x.value===pending)?pending:state.selected;
  choice.disabled=!state.supported||state.recorded;el('passenger-voice-preview').disabled=!state.supported;
  status.textContent=!state.supported?'Voice playback is unavailable in this browser.':
   state.recorded?'Panduan menggunakan rakaman Bahasa Melayu. Nama jalan dipaparkan pada skrin.':
   state.unavailable?'Saved voice is unavailable on this device. Using the device default.':
   'Choose an available device voice and play a sample.';
 };
 const modalState=()=>document.body.classList.toggle('passenger-modal-open',sound.open||about.open);
 const openSound=()=>{
  if(sound.open)return;
  paintVoices();
  const mode=window.JalanGPS.getVoiceMode();
  sound.querySelector('input[value="'+mode+'"]').checked=true;
  sound.showModal();modalState();
  sound.querySelector('input:checked').focus();
 };
 window.JalanPassengerSound={open:openSound};
 el('passenger-sound-ok').addEventListener('click',()=>{
  window.JalanVoice.choose(choice.value);
  window.JalanGPS.setVoiceMode(sound.querySelector('input:checked').value);
  sound.close();
 });
 el('passenger-voice-preview').addEventListener('click',()=>{
  status.textContent=window.JalanVoice.preview(choice.value)?'Playing sample…':'Could not play a sample on this device.';
 });
 window.addEventListener('jalan:voices-changed',paintVoices);
 window.addEventListener('jalan:voice-preview',event=>{
  if(sound.open)status.textContent=event.detail?.state==='error'?'Could not play a sample. Try another voice.':
   'Choose an available device voice and play a sample.';
  if(sound.open&&event.detail?.state!=='error'&&window.JalanVoice.getState().recorded)paintVoices();
 });
 const policy=el('passenger-policy');
 function setPolicyLanguage(){
  const url=new URL(policy.href);
  url.searchParams.set('lang',window.JalanLanguage.code);
  policy.href=url.href;
 }
 window.addEventListener('jalan:language-change',setPolicyLanguage);
 el('passenger-about').addEventListener('click',()=>{
  if(about.open)return;
  const version=String(window.JalanPublicConfig?.appVersion||'4.8.0').replace(/[-\s]+test(?:ing)?\b/gi,'').trim();
  window.JalanLanguage.write(el('passenger-app-version'),'Version '+version,'Versi '+version);
  setPolicyLanguage();
  window.JalanPassengerMenu.close();
  // The About menu item is now hidden. Give the native dialog a visible return target.
  el('jalan-home-menu').focus({preventScroll:true});
  about.showModal();
  modalState();
  about.scrollTop=0;
  el('passenger-about-title').focus({preventScroll:true});
 });
 el('passenger-about-ok').addEventListener('click',()=>about.close());

 function outsideSheet(event){
  const r=about.getBoundingClientRect();
  return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;
 }
 let backdropPress=false;
 about.addEventListener('pointerdown',event=>{backdropPress=event.target===about&&outsideSheet(event);});
 about.addEventListener('pointercancel',()=>{backdropPress=false;});
 about.addEventListener('click',event=>{
  if(backdropPress&&event.target===about&&outsideSheet(event))about.close();
  backdropPress=false;
 });

 // Keep native vertical scrolling when large text or landscape makes the sheet taller.
 let swipe=null;
 about.addEventListener('touchstart',event=>{
  swipe=event.touches.length===1&&about.scrollTop<=0&&!outsideSheet(event.touches[0])?event.touches[0]:null;
 },{passive:true});
 about.addEventListener('touchend',event=>{
  if(!swipe)return;
  const end=Array.from(event.changedTouches).find(touch=>touch.identifier===swipe.identifier);
  if(end){
   const dy=end.clientY-swipe.clientY,dx=end.clientX-swipe.clientX;
   if(dy>55&&dy>Math.abs(dx)*1.4)about.close();
  }
  swipe=null;
 },{passive:true});
 about.addEventListener('touchcancel',()=>{swipe=null;});
 sound.addEventListener('close',()=>{modalState();el('passenger-voice').focus({preventScroll:true});});
 about.addEventListener('close',()=>{
  if(about.open)return;
  swipe=null;backdropPress=false;modalState();
 });
 paintVoices();
})();
