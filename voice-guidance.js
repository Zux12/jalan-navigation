/* Jalan V4.5.1 — milestone-based voice guidance for GPS and simulation. */
(() => {
 'use strict';
 const thresholds=[2000,1000,500,200,50];
 const spoken=new Set();
 let lastAt=0;
 function reset(){spoken.clear();lastAt=0;}
 function announce(mode,id,distance,action){
  if(mode!=='full'||!Number.isFinite(distance)||distance<0||!('speechSynthesis' in window)||document.hidden)return;
  const key=String(id);
  // Speak only the nearest relevant milestone, once per maneuver/milestone.
  const threshold=thresholds.find(t=>distance<=t&&distance>Math.max(0,t===50?12:t===200?50:t===500?200:t===1000?500:1000));
  if(!threshold)return;
  const token=key+':'+threshold;
  if(spoken.has(token))return;
  if(Date.now()-lastAt<3500)return;
  spoken.add(token);lastAt=Date.now();
  const phrase=threshold===50?String(action):`In ${threshold>=1000?threshold/1000+' kilometer'+(threshold>1000?'s':''):threshold+' meters'}, ${action}`;
  try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(phrase);u.lang='en-GB';u.rate=.95;speechSynthesis.speak(u);}catch(e){console.warn('Voice unavailable',e);}
 }
 function alert(mode,text){if(mode==='mute'||!('speechSynthesis'in window)||document.hidden)return;if(Date.now()-lastAt<3500)return;lastAt=Date.now();try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-GB';u.rate=.95;speechSynthesis.speak(u);}catch(e){console.warn(e);}}
 const nextMode=mode=>mode==='mute'?'full':mode==='full'?'alerts':'mute';
 const label=mode=>mode==='full'?'Full guidance':mode==='alerts'?'Alerts only':'Mute';
 window.JalanVoice={reset,announce,alert,nextMode,label};
})();
