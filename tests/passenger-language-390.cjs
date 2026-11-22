'use strict';
const assert=require('node:assert/strict');

module.exports=async function passengerLanguage(page){
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>Object.defineProperty(navigator,'language',{configurable:true,value:'ms-MY'}));
 await page.evaluate(()=>{
   localStorage.removeItem('jalan-passenger-language-v1');
   localStorage.removeItem('jalan-voice-mode-v1');
 });
 const reload=async()=>{
   await page.reload();
   await page.locator('#jalan-launch').waitFor({state:'hidden'});
 };
 const menu=page.locator('#jalan-home-menu'),choice=page.locator('#passenger-language');
 async function select(language){
   await menu.click();await choice.selectOption(language);
   assert.equal(await page.locator('html').getAttribute('lang'),language);
   await page.locator('#jalan-home-menu-close').click();
 }
 const placeholder=()=>page.locator('#destination').getAttribute('placeholder');
 await reload();
 assert.equal(await page.evaluate(()=>navigator.language),'ms-MY');
 assert.equal(await choice.inputValue(),'en');
 assert.match(await placeholder(),/^Where to/);
 await select('ms');
 assert.match(await placeholder(),/^Hendak ke mana/);
 assert.equal(await page.locator('[data-shortcut=home] strong').textContent(),'Rumah');
 await menu.click();await page.getByRole('button',{name:'Perihal JALAN'}).click();
 const about=page.getByRole('dialog',{name:'Perihal JALAN'});
 assert.equal(await about.getByText('Buatan Malaysia').isVisible(),true);
 assert.match(await about.locator('#passenger-app-version').innerText(),/^Versi /);
 assert.equal(await about.getByRole('link',{name:'Privasi & terma'}).getAttribute('href'),'https://igniteinnov.com/jalan/policy.html?lang=ms');
 await about.getByRole('button',{name:'Selesai'}).click();
 await menu.click();await page.locator('#passenger-voice').click();
 assert.equal(await page.locator('#passenger-voice-choice option:checked').textContent(),'Rakaman Bahasa Melayu');
 assert.match(await page.locator('#passenger-voice-status').textContent(),/Nama jalan dipaparkan/);
 await page.locator('#passenger-sound-ok').click();await page.locator('#jalan-home-menu-close').click();
 await reload();
 assert.equal(await choice.inputValue(),'ms');
 assert.match(await placeholder(),/^Hendak ke mana/);
 await select('en');
 assert.match(await placeholder(),/^Where to/);
 const showRoute=()=>page.evaluate(()=>{
   setStart([3.139,101.6869],'Fixture start');destination=[3.1478,101.6953];destinationName='Q Bistro Taman Melati';
   routes=[{duration:240,distance:1400,provider:'tomtom',
     geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6953,3.1478]]},
     legs:[{steps:[{street:'Jalan Ampang',message:'Turn left onto Jalan Ampang',routeOffsetInMeters:180,
       maneuver:{type:'TURN_LEFT'}}]}]}];
   selectedRoute=0;renderRoutes();
 });
 await showRoute();
 await page.locator('#passenger-go').click();
 await page.evaluate(()=>{
   window.__offlineGPSWatch({timestamp:Date.now(),coords:{latitude:3.139,longitude:101.6869,accuracy:5,speed:0,heading:0}});
   window.__languageJourney={route:JalanGPS.getState().route,watch:window.__offlineGPSWatch,destination};
 });
 const instruction=page.locator('#passenger-instruction');
 await page.waitForFunction(()=>document.getElementById('passenger-instruction').textContent.includes('Turn left onto Jalan Ampang'));
 const original=await instruction.textContent();
 // Model a phone that ignores GPS-triggered speech until the first utterance
 // is spoken in the user's tap. A subsequent cancel would cut that speech off.
 await page.evaluate(()=>{
   let confirmTap,unlocked=false;
   document.addEventListener('click',e=>{confirmTap=e;},true);
   const synth=window.speechSynthesis;
   synth.speak=utterance=>{
     if(confirmTap?.isTrusted&&confirmTap.eventPhase!==Event.NONE)unlocked=true;
     if(unlocked&&utterance.volume!==0)window.__audibleGuidance=utterance.text;
   };
   synth.cancel=()=>{window.__audibleGuidance=null;};
 });
 await menu.click();await page.locator('#passenger-voice').click();
 await page.getByRole('radio',{name:'Full guidance'}).check();
 await page.locator('#passenger-sound-ok').click();
 assert.equal(await page.evaluate(()=>window.__audibleGuidance??null),null,'armed and quiet until a turn is due');
 await page.locator('#jalan-home-menu-close').click();
 await page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now(),coords:{
   latitude:3.139,longitude:101.6869,accuracy:5,speed:0,heading:0
 }}));
 assert.match(await page.evaluate(()=>window.__audibleGuidance),/turn left onto Jalan Ampang/i);
 await select('ms');
 assert.match(await instruction.textContent(),/Belok kiri ke Jalan Ampang/);
 assert.equal(await page.locator('#passenger-turn-arrow').textContent(),'↰');
 await page.locator('#passenger-turn-toggle').click();
 assert.equal(await page.locator('#passenger-tab-reports').textContent(),'Laporan');
 await page.locator('#passenger-tab-directions').click();
 assert.match(await page.locator('#passenger-maneuver-list').textContent(),/Belok kiri ke Jalan Ampang/);
 await page.locator('#passenger-turn-toggle').click();
 await select('en');
 assert.equal(await instruction.textContent(),original);
 assert.equal(await page.evaluate(()=>JalanGPS.getState().active&&JalanGPS.getState().route===__languageJourney.route&&
   window.__offlineGPSWatch===__languageJourney.watch&&destination===__languageJourney.destination),true);
 await menu.click();await page.locator('#passenger-voice').click();
 await page.getByRole('radio',{name:'Mute',exact:true}).check();
 await page.locator('#passenger-sound-ok').click();
 await page.locator('#jalan-home-menu-close').click();
 assert.equal(await page.evaluate(()=>window.__audibleGuidance),null);
 // A saved voice mode must work on a fresh launch for manual and automatic Go.
 for(const automatic of [false,true]){
   await page.evaluate(()=>localStorage.setItem('jalan-voice-mode-v1','full'));
   await reload();
   await page.evaluate(()=>{
     let tap,unlocked=false;
     window.addEventListener('click',event=>{tap=event;},true);
     window.__spokenTurns=[];
     speechSynthesis.speak=utterance=>{
       if(tap?.isTrusted&&tap.eventPhase!==Event.NONE)unlocked=true;
       if(unlocked&&utterance.volume!==0)window.__spokenTurns.push(utterance.text);
       if(unlocked){utterance.onstart?.();utterance.onend?.();}
     };
   });
   await showRoute();
   await page.locator(automatic?'#passenger-route-list button':'#passenger-go').first().click();
   await page.waitForFunction(()=>JalanGPS.getState().active,null,{timeout:13000});
   await page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now(),coords:{
     latitude:3.139,longitude:101.6869,accuracy:5,speed:0,heading:0
   }}));
   assert.match(await page.evaluate(()=>window.__spokenTurns.at(-1)),/turn left onto Jalan Ampang/i);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS English first launch, BM persistence, recorded fallback and switching during an active GPS journey');
};
