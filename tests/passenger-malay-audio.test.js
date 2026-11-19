'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const player=fs.readFileSync(path.join(__dirname,'../passenger-malay-audio.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function scenario(){
 const tracks=[],requests=[],events=new Map();
 let fail=false;
 class Context{
   currentTime=2;state='suspended';sampleRate=44100;
   resume(){this.state='running';return Promise.resolve();}
   createBuffer(){return {};}
   createBufferSource(){const s={connect(){},disconnect(){},stop(){this.stopped=true;},start(...args){this.args=args;}};tracks.push(s);return s;}
   async decodeAudioData(){return {duration:117.05};}
 }
 const window={AudioContext:Context,addEventListener(){},speechSynthesis:{getVoices(){return [];}}};
 const document={currentScript:{src:'https://example.test/jalan/passenger-malay-audio.js?v=1'},
   documentElement:{lang:'ms'},addEventListener(name,fn){events.set(name,fn);},hidden:false};
 vm.runInNewContext(player,{window,document,URL,fetch:async url=>{
   requests.push(url);return {ok:!fail,arrayBuffer:async()=>new ArrayBuffer(1)};
 }});
 return {audio:window.JalanMalayAudio,document,tracks,requests,events,fail(value){fail=value;}};
}
test('Malay fallback primes one local audio bank and schedules a distance and turn in sequence',async()=>{
 const s=scenario(),status=[];
 s.events.get('click')();await flush();
 assert.equal(s.tracks.length,1);assert.deepEqual(s.tracks[0].args,[]);
 assert.equal(s.audio.speak('left',300,state=>status.push(state)),true);await flush();
 assert.deepEqual(s.requests,['https://example.test/jalan/audio/ms-guidance.mp3?v=1']);
 const [a,b]=s.tracks.slice(-2);assert.ok(a.args[2]>0&&b.args[2]>0);
 assert.ok(b.args[0]>=a.args[0]+a.args[2]);b.onended();assert.deepEqual(status,['done']);
});
test('a new prompt, mute, or hidden page prevents pending/stale recorded playback',async()=>{
 const s=scenario(),statuses=[];
 s.audio.preview(status=>statuses.push(status));s.audio.cancel();await flush();
 assert.equal(s.tracks.length,0);assert.deepEqual(statuses,['done']);
 s.audio.speak('roundabout-2',50);await flush();assert.equal(s.tracks.length,1);
 s.audio.alert('You are near your destination.');await flush();
 assert.equal(s.tracks[0].stopped,true);s.document.hidden=true;s.events.get('visibilitychange')();
 assert.equal(s.tracks[1].stopped,true);assert.equal(s.audio.preview(),false);
});
test('failed Malay audio download reports failure and can retry in the same session',async()=>{
 const s=scenario(),statuses=[];s.fail(true);
 s.audio.preview(status=>statuses.push(status));await flush();
 assert.deepEqual(statuses,['error']);s.fail(false);
 s.audio.preview(status=>statuses.push(status));await flush();s.tracks.at(-1).onended();
 assert.deepEqual(statuses,['error','done']);assert.equal(s.requests.length,2);
});
