'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../voice-guidance.js'),'utf8');
const uk={voiceURI:'fixture-uk',name:'Fixture UK',lang:'en-GB',localService:true};
const us={voiceURI:'fixture-us',name:'Fixture US',lang:'en-US',localService:false};
const id=v=>JSON.stringify([v.voiceURI,v.name,v.lang]);
function scene({voices=[],store=new Map(),blocked=false,supported=true}={}){
 let currentVoices=voices,now=100000;const utterances=[],listeners={},events=[];
 const synth={getVoices:()=>currentVoices,addEventListener:(type,fn)=>listeners[type]=fn,
  cancel(){},speak:u=>utterances.push(u)};
 const document={hidden:false};
 const storage={getItem:k=>{if(blocked)throw Error('blocked');return store.get(k)||null;},
  setItem:(k,v)=>{if(blocked)throw Error('blocked');store.set(k,v);},
  removeItem:k=>{if(blocked)throw Error('blocked');store.delete(k);}};
 const context={window:{dispatchEvent:e=>events.push(e)},document,localStorage:storage,
  Date:{now:()=>now},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}}};
 if(supported){context.speechSynthesis=synth;context.window.speechSynthesis=synth;
  context.SpeechSynthesisUtterance=context.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};}
 vm.runInNewContext(source,context);
 return {api:context.window.JalanVoice,utterances,events,document,store,
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
