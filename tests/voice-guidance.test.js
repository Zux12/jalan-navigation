'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../voice-guidance.js'),'utf8');
const uk={voiceURI:'fixture-uk',name:'Fixture UK',lang:'en-GB',localService:true};
const us={voiceURI:'fixture-us',name:'Fixture US',lang:'en-US',localService:false};
const id=v=>JSON.stringify([v.voiceURI,v.name,v.lang]);
function scene({voices=[],store=new Map(),blocked=false,supported=true,language="en",audio=false}={}){
 let currentVoices=voices,now=100000;const utterances=[],listeners={},events=[],clips=[],handlers={};
 const synth={getVoices:()=>currentVoices,addEventListener:(type,fn)=>listeners[type]=fn,
  cancel(){},speak:u=>utterances.push(u)};
 const document={hidden:false};
 const timers=new Map();let timerId=0;
 const storage={getItem:k=>{if(blocked)throw Error('blocked');return store.get(k)||null;},
  setItem:(k,v)=>{if(blocked)throw Error('blocked');store.set(k,v);},
  removeItem:k=>{if(blocked)throw Error('blocked');store.delete(k);}};
 const context={window:{setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:key=>timers.delete(key),dispatchEvent:e=>events.push(e),addEventListener:(type,fn)=>handlers[type]=fn,
   JalanLanguage:{code:language,translate:require('../passenger-language-copy.js').translate},
   JalanManeuvers:require('../passenger-maneuvers.js')},document,localStorage:storage,
  Date:{now:()=>now},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}}};
 if(supported){context.speechSynthesis=synth;context.window.speechSynthesis=synth;
  context.SpeechSynthesisUtterance=context.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};}
 if(audio)context.window.JalanEnglishAudio=context.window.JalanMalayAudio={available:true,cancel(){},unlock(){},
  speak:(key,d)=>{clips.push([key,d]);return true;},preview:()=>{clips.push(['preview']);return true;},
  alert:text=>{clips.push(['alert',text]);return true;}};
 vm.runInNewContext(source,context);
 return {api:context.window.JalanVoice,utterances,events,document,store,clips,fireTimers:()=>{for(const fn of [...timers.values()])fn();},
  switchTo:lang=>{context.window.JalanLanguage.code=lang;handlers['jalan:language-change']();},
  voices:v=>{currentVoices=v;listeners.voiceschanged();},advance:()=>now+=4000};
}
test('asynchronous device voices populate English choices and selected voice reaches guidance and alerts',()=>{
 const s=scene();assert.equal(s.api.getState().voices.length,0);
 s.voices([uk,us,{voiceURI:'ms',name:'Malay fixture',lang:'ms-MY'}]);
 assert.equal(s.api.getState().voices.length,2);
 assert.equal(s.api.choose(id(us)),true);
 s.api.announce('full','left',180,'turn left');assert.equal(s.utterances[0].voice,us);
 assert.equal(s.utterances[0].lang,'en-US');
 s.advance();s.api.alert('alerts','Recalculating');assert.equal(s.utterances[1].voice,us);
 assert.equal(s.api.choose('invented voice'),false);
});
test('sample is independent from mute, milestones and guidance throttle',()=>{
 const s=scene({voices:[uk]});s.api.choose(id(uk));
 s.api.announce('mute','left',180,'turn left');s.api.alert('mute','Recalculating');
 assert.equal(s.utterances.length,0);assert.equal(s.api.preview(),true);
 assert.equal(s.utterances[0].voice,uk);
 s.api.announce('full','left',180,'turn left');assert.equal(s.utterances.length,2);
 s.advance();s.api.announce('full','left',180,'turn left');assert.equal(s.utterances.length,2,'milestone only once');
 s.utterances[0].onerror();assert.equal(s.events.at(-1).detail.state,'error');
});
test('enabling guidance silently prepares the chosen voice and leaves the next turn eligible immediately',()=>{
 const s=scene({voices:[us]});s.api.choose(id(us));
 s.api.announce('mute','turn',180,'turn left');
 s.api.setMode('full');
 assert.equal(s.utterances[0]?.volume,0);
 assert.equal(s.utterances[0].voice,us);
 s.api.announce('full','turn',180,'turn left');
 assert.match(s.utterances.at(-1).text,/turn left/);
 s.api.setMode('full');
 s.api.announce('full','turn',180,'turn left');
 assert.equal(s.utterances.length,2,'saving the same mode does not repeat a prompt');
 s.api.setMode('mute');s.api.setMode('full');
 s.api.announce('full','turn',180,'turn left');
 assert.equal(s.utterances.length,4,'re-enabling lets the current turn be heard again');
});
test('recorded Malay mode waits quietly and respects Alerts only and Mute',()=>{
 const s=scene({voices:[uk],language:'ms',audio:true});
 s.api.setMode('alerts');s.api.announce('alerts','turn',180,'turn left');
 s.api.setMode('mute');
 assert.deepEqual(s.clips,[]);
 s.api.setMode('full');
 s.api.announce('full','turn',180,'turn left');
 assert.deepEqual(s.clips,[['left',200]]);
});
test('voice choice survives reload and temporary missing voice uses default until voices arrive',()=>{
 const s=scene({voices:[us]});s.api.choose(id(us));
 const reloaded=scene({store:s.store});assert.equal(reloaded.api.getState().unavailable,true);
 reloaded.api.preview();assert.equal(reloaded.utterances[0].voice,undefined);
 assert.equal(reloaded.utterances[0].lang,'en-GB');
 reloaded.voices([us]);assert.equal(reloaded.api.getState().selected,id(us));
 reloaded.api.preview();assert.equal(reloaded.utterances[1].voice,us);
 reloaded.api.choose('');assert.equal(scene({store:s.store,voices:[us]}).api.getState().preference,'');
});
test('blocked storage allows page-only choice, and unsupported or hidden contexts do not speak',()=>{
 const s=scene({voices:[uk],blocked:true});s.api.choose(id(uk));
 assert.equal(s.api.getState().saved,false);assert.equal(s.api.preview(),true);
 s.document.hidden=true;assert.equal(s.api.preview(),false);
 const absent=scene({supported:false});assert.equal(absent.api.getState().supported,false);
 assert.equal(absent.api.preview(),false);absent.api.announce('full','left',180,'left');
 assert.equal(absent.utterances.length,0);
});

test('pending voice sample does not save choice and sound mode persists independently',()=>{
 const s=scene({voices:[uk,us]});s.api.choose(id(uk));
 assert.equal(s.api.preview(id(us)),true);assert.equal(s.utterances[0].voice,us);
 assert.equal(s.api.getState().preference,id(uk));
 assert.equal(s.api.setMode('alerts'),true);assert.equal(scene({store:s.store}).api.getMode(),'alerts');
 assert.equal(s.api.setMode('invalid'),false);assert.equal(s.api.getMode(),'alerts');
 const blocked=scene({blocked:true});blocked.api.setMode('full');assert.equal(blocked.api.getMode(),'full');
});

const ms={voiceURI:'fixture-ms',name:'Malay fixture',lang:'ms-MY',localService:true};
const left={street:'Jalan Ampang',message:'Turn left onto Jalan Ampang',maneuver:{type:'TURN_LEFT'}};
test('switching languages uses the matching installed voice, street and separately saved choice',()=>{
 const s=scene({voices:[uk,ms],audio:true});
 s.api.choose(id(uk));s.switchTo('ms');
 assert.equal(s.api.getState().recorded,false);
 assert.deepEqual(Array.from(s.api.getState().voices,v=>v.lang),['ms-MY']);
 s.api.choose(id(ms));s.api.announce('full',1,190,left.message,left);
 assert.equal(s.utterances[0].voice,ms);assert.equal(s.utterances[0].lang,'ms-MY');
 assert.match(s.utterances[0].text,/Dalam 200 meter, belok kiri ke Jalan Ampang/);
 s.advance();s.api.alert('alerts','You are near your destination.');
 assert.doesNotMatch(s.utterances[1].text,/you|destination/i);
 s.switchTo('en');assert.equal(s.api.getState().preference,id(uk));
 s.api.preview();assert.equal(s.utterances.at(-1).voice,uk);
 s.switchTo('ms');assert.equal(s.api.getState().preference,id(ms));
 assert.deepEqual(s.clips,[]);
});
test('BM uses recorded maneuvers and preview when only English voices or no speech engine exist',()=>{
 for(const supported of [true,false]){
  const s=scene({voices:[us],language:'ms',supported,audio:true});
  assert.equal(s.api.getState().recorded,true);assert.equal(s.api.getState().supported,true);
  s.api.announce('mute',1,190,left.message,left);assert.deepEqual(s.clips,[]);
  s.api.announce('full',1,190,left.message,left);
  s.api.preview();s.advance();s.api.alert('alerts','You are near your destination.');
  assert.deepEqual(s.clips,[['left',200],['preview'],['alert','You are near your destination.']]);
  assert.deepEqual(s.utterances,[]);
 }
});
test('an installed Malay voice that fails falls back only for the current prompt',()=>{
 const s=scene({voices:[ms],language:'ms',audio:true});
 s.api.announce('full',1,190,left.message,left);
 const failed=s.utterances[0].onerror;failed({error:'language-unavailable'});
 assert.deepEqual(s.clips,[['left',200]]);
 s.switchTo('en');failed({error:'language-unavailable'});
 assert.equal(s.clips.length,1);
});
test('a silent English speech engine falls back once, and muting cancels a pending fallback',()=>{
 const s=scene({voices:[uk],audio:true});
 s.api.setMode('full');s.api.announce('full',1,190,left.message,left);
 s.fireTimers();s.fireTimers();
 assert.deepEqual(s.clips,[['left',200]]);
 s.advance();s.api.alert('full','Speed camera ahead.');
 s.api.setMode('mute');s.fireTimers();
 assert.equal(s.clips.length,1);
 s.api.setMode('alerts');s.advance();s.api.alert('alerts','Speed camera ahead.');
 s.utterances.at(-1).onstart();s.fireTimers();
 assert.equal(s.clips.length,1,'a working native voice is never doubled');
});
