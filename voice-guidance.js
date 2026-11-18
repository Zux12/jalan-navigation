/* JALAN voice guidance: device voices shared by GPS and simulation. */
(() => {
 'use strict';
 const thresholds=[2000,1000,500,200,50],spoken=new Set();
 const storageKey='jalan-voice-choice-v1';
 let lastAt=0,preference='',saved=true,voices=[],mode='mute';
 try{const value=localStorage.getItem('jalan-voice-mode-v1');if(['full','alerts','mute'].includes(value))mode=value;}catch{}
 try{preference=localStorage.getItem(storageKey)||'';}catch{saved=false;}
 const supported=!!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';
 const voiceId=v=>JSON.stringify([v.voiceURI||'',v.name,v.lang]);
 const selected=()=>voices.find(v=>voiceId(v)===preference)||null;
 const notify=()=>window.dispatchEvent(new CustomEvent('jalan:voices-changed'));
 const refresh=()=>{
  try{voices=supported?Array.from(speechSynthesis.getVoices()).filter(v=>/^en(?:[-_]|$)/i.test(v.lang)):[];}
  catch{voices=[];}
  voices=voices.filter((v,i,a)=>a.findIndex(x=>voiceId(x)===voiceId(v))===i)
   .sort((a,b)=>a.name.localeCompare(b.name)||a.lang.localeCompare(b.lang));
  notify();
 };
 function getState(){return {supported,saved,preference,selected:selected()?preference:'',
  unavailable:!!preference&&!selected(),
  voices:voices.map(v=>({id:voiceId(v),name:v.name,lang:v.lang,local:v.localService}))};}
 function choose(id){
  if(id&&!voices.some(v=>voiceId(v)===id))return false;
  preference=id;
  try{if(id)localStorage.setItem(storageKey,id);else localStorage.removeItem(storageKey);saved=true;}
  catch{saved=false;}
  notify();return true;
 }
 function speak(text,preview=false,previewVoice=undefined){
  if(!supported||document.hidden)return false;
  try{
   speechSynthesis.cancel();
   const utterance=new SpeechSynthesisUtterance(String(text)),voice=previewVoice===undefined?selected():voices.find(v=>voiceId(v)===previewVoice);
   if(voice)utterance.voice=voice;
   utterance.lang=voice?.lang||'en-GB';utterance.rate=.95;
   if(preview){
    const result=state=>window.dispatchEvent(new CustomEvent('jalan:voice-preview',{detail:{state}}));
    utterance.onend=()=>result('done');
    utterance.onerror=e=>result(['interrupted','canceled'].includes(e?.error)?'done':'error');
   }
   speechSynthesis.speak(utterance);return true;
  }catch{return false;}
 }
 function preview(id=undefined){return speak('In 200 meters, turn left. Then continue straight. This is your JALAN navigation voice.',true,id);}
 function setMode(value){if(!['full','alerts','mute'].includes(value))return false;mode=value;
  try{localStorage.setItem('jalan-voice-mode-v1',value);}catch{}return true;}
 function reset(){spoken.clear();lastAt=0;}
 function announce(mode,id,distance,action){
  if(mode!=='full'||!Number.isFinite(distance)||distance<0||!supported||document.hidden)return;
  const threshold=thresholds.find(t=>distance<=t&&distance>Math.max(0,t===50?12:t===200?50:t===500?200:t===1000?500:1000));
  if(!threshold)return;
  const token=String(id)+':'+threshold;
  if(spoken.has(token)||Date.now()-lastAt<3500)return;
  const phrase=threshold===50?String(action):`In ${threshold>=1000?threshold/1000+' kilometer'+(threshold>1000?'s':''):threshold+' meters'}, ${action}`;
  if(speak(phrase)){spoken.add(token);lastAt=Date.now();}
 }
 function alert(mode,text){
  if(mode==='mute'||Date.now()-lastAt<3500)return;
  if(speak(text))lastAt=Date.now();
 }
 const nextMode=mode=>mode==='mute'?'full':mode==='full'?'alerts':'mute';
 const label=mode=>mode==='full'?'Full guidance':mode==='alerts'?'Alerts only':'Mute';
 window.JalanVoice={reset,announce,alert,nextMode,label,getState,choose,preview,refresh,setMode,getMode:()=>mode};
 if(supported)speechSynthesis.addEventListener('voiceschanged',refresh);
 refresh();
})();
