'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../passenger-connectivity.js'), 'utf8');

function setup(t) {
  t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
  const win = new EventTarget(), doc = new EventTarget(), navigator = {onLine:true};
  const banner = {hidden:true,dataset:{}}, message = {textContent:''}, requests = [];
  const state = {auto:true,deviationConfirmed:false,primary:true,backup:true};
  const nodes = {'passenger-offline-banner':banner,'passenger-offline-message':message,
    'gps-auto':{getAttribute:()=>String(state.auto)}};
  Object.assign(doc,{hidden:false,body:{classList:{contains:()=>true}},getElementById:id=>nodes[id]});
  Object.assign(win,{JalanLanguage:{code:'en'}, JalanGPS:{getState:()=>state}});
  async function fetch(url, options) {
    requests.push({url,options});
    const primary = url === 'passenger.webmanifest';
    if (!(primary ? state.primary : state.backup)) throw Error('unreachable');
    return {ok:true,json:async()=>primary ? {name:'JALAN'} : {ok:true,service:'jalan'}};
  }
  vm.runInNewContext(source,{window:win,document:doc,navigator,Date,setTimeout,clearTimeout,AbortController,Event,fetch});
  const emit=(name,detail)=>win.dispatchEvent(new CustomEvent(name,{detail}));
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  async function tick(ms) {t.mock.timers.tick(ms);await flush();}
  return {win,doc,navigator,banner,message,state,requests,emit,tick,flush};
}

test('waits 15 continuous seconds in an active trip; reconnection clears the strip and resets the delay', async t => {
  const s=setup(t);
  s.navigator.onLine=false;s.emit('offline');await s.tick(25000);
  assert.equal(s.banner.hidden,true);assert.equal(s.requests.length,0);
  s.emit('jalan:journey-start');await s.tick(12000);
  s.navigator.onLine=true;s.emit('online');await s.flush();
  s.navigator.onLine=false;s.emit('offline');await s.tick(14999);
  assert.equal(s.banner.hidden,true);
  await s.tick(1);assert.equal(s.message.textContent,'No internet · Your route is still available');
  s.navigator.onLine=true;s.emit('online');await s.flush();assert.equal(s.banner.hidden,true);
});

test('checks for working internet behind an apparently connected network and tolerates a single service outage', async t => {
  const s=setup(t);s.state.primary=false;
  s.emit('jalan:journey-start');await s.flush();await s.tick(15000);
  assert.equal(s.banner.hidden,true);assert.equal(s.requests.length,4);
  s.state.backup=false;await s.tick(15000);await s.tick(14999);
  assert.equal(s.banner.hidden,true);await s.tick(1);assert.equal(s.banner.hidden,false);
  s.state.primary=true;await s.tick(5000);assert.equal(s.banner.hidden,true);
  for(const {options} of s.requests)assert.equal(options.cache,'no-store');
});

test('only confirmed deviations change the message; supports manual rerouting, Malay and returning to the selected road', async t => {
  const s=setup(t);s.navigator.onLine=false;s.emit('jalan:journey-start');await s.tick(15000);
  const fix=(gpsReliable,matched)=>s.emit('jalan:gps-fix',{gpsReliable,matched});
  s.state.deviationConfirmed=true;fix(false,false);assert.equal(s.banner.dataset.route,'on');
  fix(true,false);assert.equal(s.message.textContent,'No internet · Reconnecting to update your route');
  s.state.deviationConfirmed=false;fix(false,false);assert.equal(s.banner.dataset.route,'off');
  s.state.auto=false;s.emit('jalan:navigation-settings');assert.match(s.message.textContent,/rerouting is off/);
  s.win.JalanLanguage.code='ms';s.emit('jalan:language-change');assert.match(s.message.textContent,/Tiada internet/);
  fix(true,true);assert.equal(s.message.textContent,'Tiada internet · Laluan anda masih tersedia');
  s.emit('jalan:journey-stop');assert.equal(s.banner.hidden,true);
  await s.tick(60000);assert.equal(s.banner.hidden,true);
});

test('suspends checks in the background and ignores an obsolete check after Stop', async t => {
  const s=setup(t);s.emit('jalan:journey-start');
  s.emit('jalan:journey-stop');await s.flush();await s.tick(60000);
  assert.equal(s.requests.length,1);assert.equal(s.banner.hidden,true);
  s.emit('jalan:journey-start');await s.flush();
  s.doc.hidden=true;s.doc.dispatchEvent(new Event('visibilitychange'));
  const count=s.requests.length;await s.tick(60000);assert.equal(s.requests.length,count);
  s.navigator.onLine=false;s.doc.hidden=false;s.doc.dispatchEvent(new Event('visibilitychange'));
  await s.tick(15000);assert.equal(s.banner.hidden,false);
});
