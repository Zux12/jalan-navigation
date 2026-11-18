'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../passenger-gps-status.js'),'utf8');
function scene({supported=true,mode='passenger',syncDenied=false}={}){
 let now=100000,nextWatch=0;const nodes=[],events=new Map(),docEvents=new Map(),timers=new Map(),microtasks=[],watches=new Map(),cleared=[];
 const listen=(registry,type,fn)=>{const a=registry.get(type)||[];a.push(fn);registry.set(type,a);};
 const fire=(registry,type,detail)=>{for(const fn of registry.get(type)||[])fn({type,detail});};
 const element=()=>({dataset:{},attrs:{},hidden:false,textContent:'',events:new Map(),
  setAttribute(k,v){this.attrs[k]=v;},contains(target){return target===this;},
  addEventListener(type,fn){listen(this.events,type,fn);}});
 const document={hidden:false,createElement:element,body:{append(...v){nodes.push(...v);}},
  addEventListener:(type,fn)=>listen(docEvents,type,fn)};
 const geo={watchPosition(ok,fail,options){const id=++nextWatch;watches.set(id,{ok,fail,options});
  if(syncDenied)fail({code:1});return id;},clearWatch(id){cleared.push(id);watches.delete(id);}};
 const ctx={window:{addEventListener:(type,fn)=>listen(events,type,fn),dispatchEvent:e=>fire(events,e.type,e.detail)},document,
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  navigator:{geolocation:supported?geo:null},location:{search:'?mode='+mode},URLSearchParams,
  Date:{now:()=>now},Math,Number,Array,queueMicrotask:fn=>microtasks.push(fn),
  setInterval:fn=>{const id=timers.size+1;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id)};
 vm.runInNewContext(source,ctx);
 const emit=(type,detail)=>fire(events,type,detail);
 const fix=(accuracy=8,extra={})=>({accuracy,timestamp:now,valid:true,...extra});
 return {nodes,watches,cleared,document,fix,emit,
  get button(){return nodes.find(n=>n.id==='passenger-gps-status');},
  get detail(){return nodes.find(n=>n.id==='passenger-gps-status-detail');},
  get starts(){return nextWatch;},get timerCount(){return timers.size;},
  advance(ms){now+=ms;for(const fn of timers.values())fn();},
  initial(accuracy=8){emit('jalan:initial-location',{point:[3.14,101.68],accuracy,timestamp:now});},
  quality(accuracy=8,extra={}){emit('jalan:location-quality',fix(accuracy,extra));},
  visibility(hidden){document.hidden=hidden;fire(docEvents,'visibilitychange');},
  flush(){while(microtasks.length)microtasks.shift()();},
  click(){fire(this.button.events,'click');}
 };
}
test('badge uses measured accuracy and freshness, independent from route match',()=>{
 const s=scene();assert.equal(s.button.dataset.quality,'yellow');
 s.emit('jalan:journey-start');s.quality(8,{matched:false});assert.equal(s.button.dataset.quality,'green');
 s.quality(80);assert.equal(s.button.dataset.quality,'yellow');
 s.quality(180);assert.equal(s.button.dataset.quality,'red');
 s.quality(8);s.advance(11000);assert.equal(s.button.dataset.quality,'yellow');
 s.advance(20000);assert.equal(s.button.dataset.quality,'red');
 s.quality(8);assert.equal(s.button.dataset.quality,'green');
 assert.equal(s.starts,0,'navigation provides its own measurements without a duplicate watcher');
});
test('invalid, missing, stale and far-future location data never becomes green',()=>{
 for(const extra of [{accuracy:NaN},{accuracy:-1},{accuracy:undefined},{valid:false},{timestamp:140000},{timestamp:50000}]){
  const s=scene();s.quality(8,extra);assert.equal(s.button.dataset.quality,'red');
  s.quality(8);assert.equal(s.button.dataset.quality,'green','fresh readings recover from invalid or future data');
 }
 const s=scene();s.quality(8);s.quality(8,{timestamp:90000});
 assert.equal(s.button.dataset.quality,'green','older cached samples cannot replace newer measured readings');
 s.advance(31000);assert.equal(s.button.dataset.quality,'red');
});
test('location access failure and unsupported browser are red; no new permission prompt on page opening',()=>{
 const s=scene();assert.equal(s.starts,0);
 s.emit('jalan:initial-location-error');assert.equal(s.button.dataset.quality,'red');assert.equal(s.starts,0);
 const absent=scene({supported:false});assert.equal(absent.button.dataset.quality,'red');
 const waiting=scene();waiting.advance(31000);assert.equal(waiting.button.dataset.quality,'red');
 const denied=scene({syncDenied:true});denied.initial();
 assert.equal(denied.button.dataset.quality,'red');assert.equal(denied.watches.size,0,'synchronous denial cannot leak a watcher');
});
test('one pre-route watcher updates quality and yields to navigation, backgrounding and page lifecycle',()=>{
 const s=scene();s.initial();s.initial();assert.equal(s.watches.size,1);assert.equal(s.starts,1);
 const watch=s.watches.values().next().value;
 watch.ok({coords:{latitude:3.2,longitude:101.8,accuracy:80},timestamp:s.fix().timestamp});
 assert.equal(s.button.dataset.quality,'yellow');
 s.emit('jalan:journey-start');assert.equal(s.watches.size,0);
 s.quality(8);assert.equal(s.button.dataset.quality,'green');
 s.emit('jalan:journey-stop');s.flush();assert.equal(s.watches.size,1);
 s.visibility(true);assert.equal(s.watches.size,0);assert.equal(s.button.dataset.quality,'yellow');
 s.visibility(false);assert.equal(s.watches.size,1);
 s.emit('pagehide');assert.equal(s.watches.size,0);assert.equal(s.timerCount,0);
 s.emit('pageshow');assert.equal(s.watches.size,1);assert.equal(s.timerCount,1);
 s.emit('pageshow');assert.equal(s.watches.size,1);assert.equal(s.timerCount,1);
});
test('watch errors recover and the icon exposes a textual quality explanation',()=>{
 const s=scene();s.initial();const watch=s.watches.values().next().value;
 watch.fail({code:2});assert.equal(s.button.dataset.quality,'red');
 watch.ok({coords:{latitude:3.14,longitude:101.68,accuracy:8},timestamp:s.fix().timestamp});
 assert.equal(s.button.dataset.quality,'green');assert.match(s.button.attrs['aria-label'],/GPS good/);
 s.click();assert.equal(s.detail.hidden,false);assert.equal(s.button.attrs['aria-expanded'],'true');
 s.click();assert.equal(s.detail.hidden,true);
});
test('engineering mode has no status badge or extra tracking',()=>{
 const s=scene({mode:'engineering'});assert.equal(s.nodes.length,0);assert.equal(s.starts,0);assert.equal(s.timerCount,0);
});
