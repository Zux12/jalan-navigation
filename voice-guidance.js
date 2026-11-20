/* Device voice preferences are independent for English and Malay. */
(() => {
 'use strict';
 const thresholds=[2000,1000,500,200,50],spoken=new Set();
 const language=()=>window.JalanLanguage?.code||'en';
 const bm=()=>language()==='ms';
 const storageKey=()=>bm()?'jalan-voice-choice-ms-v1':'jalan-voice-choice-v1';
 let lastAt=0,preference='',saved=true,voices=[],mode='mute',generation=0,latestPreview=0;
 try{const value=localStorage.getItem('jalan-voice-mode-v1');if(['full','alerts','mute'].includes(value))mode=value;}catch{}
 function loadChoice(){
  try{preference=localStorage.getItem(storageKey())||'';saved=true;}catch{preference='';saved=false;}
 }
 const synthesis=!!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';
 const recordings=()=>bm()&&window.JalanMalayAudio?.available?window.JalanMalayAudio:null;
 const voiceId=v=>JSON.stringify([v.voiceURI||'',v.name,v.lang]);
 const selected=()=>voices.find(v=>voiceId(v)===preference)||null;
 const notify=()=>window.dispatchEvent(new CustomEvent('jalan:voices-changed'));
 const refresh=()=>{
  const wanted=bm()?/^ms(?:[-_]|$)/i:/^en(?:[-_]|$)/i;
  try{voices=synthesis?Array.from(speechSynthesis.getVoices()).filter(v=>wanted.test(v.lang)):[];}catch{voices=[];}
  voices=voices.filter((v,i,a)=>a.findIndex(x=>voiceId(x)===voiceId(v))===i)
   .sort((a,b)=>a.name.localeCompare(b.name)||a.lang.localeCompare(b.lang));
  notify();
 };
 function getState(){return {supported:bm()?voices.length>0||!!recordings():synthesis,recorded:!!recordings()&&!voices.length,saved,preference,
  selected:selected()?preference:'',unavailable:!!preference&&!selected(),
  voices:voices.map(v=>({id:voiceId(v),name:v.name,lang:v.lang,local:v.localService}))};}
 function choose(id){
  if(id&&!voices.some(v=>voiceId(v)===id))return false;
  preference=id;
  try{if(id)localStorage.setItem(storageKey(),id);else localStorage.removeItem(storageKey());saved=true;}
  catch{saved=false;}
  notify();return true;
 }
 function cancel(){
  generation++;
  window.JalanMalayAudio?.cancel();
  if(synthesis)speechSynthesis.cancel();
 }
 function speak(text,record,preview=false,previewVoice=undefined){
  if(document.hidden)return false;
  cancel();const id=generation;
  if(preview)latestPreview=id;
  const result=state=>{if(preview&&id===latestPreview)window.dispatchEvent(new CustomEvent('jalan:voice-preview',{detail:{state}}));};
  const fallback=()=>id===generation&&!!recordings()&&record(recordings(),result);
  let voice=previewVoice===undefined?selected():voices.find(v=>voiceId(v)===previewVoice);
  if(bm()&&!voice)voice=voices.find(v=>/^ms[-_]MY$/i.test(v.lang))||voices[0];
  if(bm()&&!voice)return fallback();
  if(!synthesis)return false;
  try{
   const utterance=new SpeechSynthesisUtterance(text);
   if(voice)utterance.voice=voice;
   utterance.lang=voice?.lang||(bm()?'ms-MY':'en-GB');utterance.rate=.95;
   utterance.onend=()=>result('done');
   utterance.onerror=e=>{
    if(id!==generation){result(['interrupted','canceled'].includes(e?.error)?'done':'error');return;}
    if(['interrupted','canceled'].includes(e?.error)){result('done');return;}
    if(!fallback())result('error');
   };
   if(speechSynthesis.paused)speechSynthesis.resume();
   speechSynthesis.speak(utterance);return true;
  }catch{return fallback();}
 }
 function preview(id=undefined){
  const text=bm()?'Dalam 200 meter, belok kiri. Kemudian teruskan perjalanan. Ini suara navigasi JALAN anda.':
    'In 200 meters, turn left. Then continue straight. This is your JALAN navigation voice.';
  return speak(text,(audio,done)=>audio.preview(done),true,id);
 }
 function setMode(value){
  if(!['full','alerts','mute'].includes(value))return false;
  const changed=mode!==value;
  mode=value;
  try{localStorage.setItem('jalan-voice-mode-v1',value);}catch{}
  if(mode==='mute'||document.hidden){cancel();return true;}
  if(changed){
   // Start audio in the tap that confirms Sound. Later GPS fixes have no tap.
   // The confirmation must not consume a turn milestone or delay the first turn.
   if(mode==='full')reset();
   recordings()?.unlock();
   const text=label(mode);
   speak(bm()?window.JalanLanguage.translate(text):text,(audio,done)=>audio.alert(text,done));
  }
  return true;
 }
 function reset(){spoken.clear();lastAt=0;}
 function announce(mode,id,distance,action,step){
  if(mode!=='full'||!Number.isFinite(distance)||distance<0||document.hidden)return;
  const threshold=thresholds.find(t=>distance<=t&&distance>Math.max(0,t===50?12:t===200?50:t===500?200:t===1000?500:1000));
  if(!threshold)return;
  const token=String(id)+':'+threshold;
  if(spoken.has(token)||Date.now()-lastAt<3500)return;
  let phrase;
  if(bm()){
   const direction=window.JalanManeuvers.action(step,action,'ms');
   phrase=threshold===50?direction:`Dalam ${threshold>=1000?threshold/1000+' kilometer':threshold+' meter'}, ${direction.charAt(0).toLowerCase()+direction.slice(1)}`;
  }else phrase=threshold===50?String(action):`In ${threshold>=1000?threshold/1000+' kilometer'+(threshold>1000?'s':''):threshold+' meters'}, ${action}`;
  const record=(audio,done)=>{
   let key=window.JalanManeuvers.audioKey(step,action);
   if(key==='roundabout'){const exit=window.JalanManeuvers.roundaboutExit(step,action);if(exit)key+='-'+exit;}
   return audio.speak(key,threshold,done);
  };
  if(speak(phrase,record)){spoken.add(token);lastAt=Date.now();}
 }
 function alert(mode,text){
  if(mode==='mute'||Date.now()-lastAt<3500)return;
  const phrase=bm()?window.JalanLanguage.translate(text):text;
  if(speak(phrase,(audio,done)=>audio.alert(text,done)))lastAt=Date.now();
 }
 const nextMode=mode=>mode==='mute'?'full':mode==='full'?'alerts':'mute';
 const label=mode=>mode==='full'?'Full guidance':mode==='alerts'?'Alerts only':'Mute';
 window.JalanVoice={reset,cancel,announce,alert,nextMode,label,getState,choose,preview,refresh,setMode,getMode:()=>mode};
 if(synthesis)speechSynthesis.addEventListener('voiceschanged',refresh);
 window.addEventListener?.('jalan:language-change',()=>{latestPreview=0;cancel();loadChoice();refresh();});
 window.addEventListener?.('jalan:journey-stop',cancel);
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden)cancel();});
 loadChoice();refresh();
})();
