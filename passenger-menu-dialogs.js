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
 about.innerHTML='<h2 id="passenger-about-title">About JALAN</h2>'+
  '<p class="jalan-about-version" id="passenger-app-version"></p>'+
  '<section class="jalan-about-developer" aria-label="JALAN development"><p>Developed by</p>'+
  '<strong class="jalan-about-brand">IgniteInno Ventures</strong>'+
  '<dl><dt>Application algorithms &amp; navigation logic</dt><dd>IgniteInno Ventures</dd></dl></section>'+
  '<h3 class="jalan-about-support-title">Supporting technology &amp; services</h3><dl class="jalan-about-support">'+
  '<dt>Map and map data</dt><dd><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · '+
  '<a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> · '+
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></dd>'+
  '<dt>Routing and traffic</dt><dd><a href="https://www.tomtom.com/" target="_blank" rel="noopener noreferrer">TomTom</a></dd>'+
  '<dt>Destination search</dt><dd>OpenStreetMap Nominatim</dd>'+
  '<dt>Map software</dt><dd><a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre GL JS</a> · '+
  '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a></dd></dl>'+
  '<button type="button" id="passenger-about-ok" class="jalan-dialog-ok">OK</button>';
 document.body.append(sound,about);
 const choice=el('passenger-voice-choice'),status=el('passenger-voice-status');
 const paintVoices=()=>{
  const state=window.JalanVoice.getState(),pending=sound.open?choice.value:state.selected;
  choice.replaceChildren(new Option('Automatic · device default',''));
  for(const voice of state.voices)choice.add(new Option(voice.name+' · '+voice.lang,voice.id));
  choice.value=Array.from(choice.options).some(x=>x.value===pending)?pending:state.selected;
  choice.disabled=!state.supported;el('passenger-voice-preview').disabled=!state.supported;
  status.textContent=!state.supported?'Voice playback is unavailable in this browser.':
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
 });
 el('passenger-about').addEventListener('click',()=>{
  const config=window.JalanPublicConfig||{};
  const version=String(config.appVersion||'4.8.0').replace(/[-\s]+test(?:ing)?\b/gi,'').trim();
  el('passenger-app-version').textContent='Version '+version+' · '+(config.buildDate||'2026-11-18');
  about.showModal();modalState();
 });
 el('passenger-about-ok').addEventListener('click',()=>about.close());
 sound.addEventListener('close',()=>{modalState();el('passenger-voice').focus({preventScroll:true});});
 about.addEventListener('close',()=>{modalState();el('passenger-about').focus({preventScroll:true});});
 paintVoices();
})();
