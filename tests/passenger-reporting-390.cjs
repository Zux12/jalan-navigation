'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async(browser,base,root)=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.addInitScript(()=>{window.__reportPosition=[101.687,3.139];window.__reportAccuracy=8;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){ok({timestamp:Date.now(),coords:{longitude:window.__reportPosition[0],latitude:window.__reportPosition[1],accuracy:window.__reportAccuracy,heading:90,speed:5}});},watchPosition(){return 1;},clearWatch(){}}});});
 await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 for(const ext of ['js','css'])await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.'+ext,r=>r.fulfill({contentType:ext==='js'?'application/javascript':'text/css',body:fs.readFileSync(path.join(root,'node_modules/leaflet/dist/leaflet.'+ext))}));
 let failed=true,submissions=[],responses=[],nearby=[],nearbyPosts=0;
 const event=(id,type='accident',position=[101.687,3.139])=>({id,type,position,heading:90,road:{key:'fixture-road',level:'0:surface'},createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+3600000,contributors:1,active:true});
 await page.route('https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/reports/**',async r=>{assert.equal(r.request().method(),'POST');assert.equal(new URL(r.request().url()).search,'');const body=r.request().postDataJSON(),kind=new URL(r.request().url()).pathname.split('/').pop();let data,status=200;
 if(kind==='submit'){submissions.push(body);if(failed){status=503;data={error:'Reporting service unavailable.'};}else data={event:{...event('own-event',body.type,body.position),trafficSeverity:body.trafficSeverity,contributors:submissions.length>2?2:1},merged:submissions.length>2};}
 else if(kind==='read')data={sections:[]};else if(kind==='observe')data={ok:true};else if(kind==='nearby'){nearbyPosts++;data={events:nearby};}else{responses.push(body);data={event:event(body.id,'accident',[101.689,3.139])};}
 await r.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});});
 await page.goto(base+'/index.html?mode=passenger');
 const preference=page.locator('#passenger-share-speed');
 assert.equal(await preference.isChecked(),true,'first trip shares by default');
 await preference.evaluate(el=>{el.click();});await page.reload();
 assert.equal(await preference.isChecked(),false,'switching sharing off survives reload');
 // Simulate browser storage becoming unavailable AFTER a first-trip opt-in.
 await preference.evaluate(el=>el.click());assert.equal(await preference.isChecked(),true);
 await page.evaluate(()=>{
  const original=Storage.prototype.getItem;
  Storage.prototype.getItem=()=>{throw Error('storage denied after launch');};
  try{window.dispatchEvent(new StorageEvent('storage',{key:'jalan-traffic-sharing-v1'}));}
  finally{Storage.prototype.getItem=original;}
 });
 assert.equal(await preference.isChecked(),false,'late storage denial cannot re-enable observation');
 await preference.evaluate(el=>el.click());
 assert.equal(await preference.isChecked(),false,'failed storage preference save leaves sharing disabled');
 const restricted=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
  await restricted.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked');};});
  const noStorage=await restricted.newPage();let outgoing=0;
  await noStorage.route('**/*',r=>{
   const u=r.request().url();
   if(u.includes('/api/jalan/reports/'))outgoing++;
   if(u.startsWith(base+'/'))return r.continue();
   if(u.startsWith('https://unpkg.com/leaflet@1.9.4/dist/leaflet.')){
    const ext=u.endsWith('.js')?'js':'css';return r.fulfill({contentType:ext==='js'?'application/javascript':'text/css',body:fs.readFileSync(path.join(root,'node_modules/leaflet/dist/leaflet.'+ext))});
   }
   return r.abort();
  });
  await noStorage.goto(base+'/index.html?mode=passenger');assert.equal(await noStorage.locator('#passenger-share-speed').isChecked(),false);
  assert.equal(outgoing,0);
 }finally{await restricted.close();}

 assert.equal(await page.locator('#passenger-reports-panel input[type=checkbox]').count(),0);
 const sharing=page.locator('#passenger-navigation-settings .passenger-nearby-consent');
 assert.equal(await sharing.locator('input').count(),1);
 assert.equal(await sharing.evaluate(el=>getComputedStyle(el).display),'none','per-journey option is hidden before Go');
 await page.evaluate(()=>{JalanVectorMap.getReportRoad=()=>({key:'fixture-road',level:'0:surface'});});
 await page.locator('#jalan-home-report').click();await page.locator('[data-type=weather]').click();await page.locator('[data-type=flood]').click();
 assert.equal(await page.locator('#passenger-report-location').count(),0);
 assert.equal(await page.locator('#passenger-report-status').isVisible(),false,'no explanatory or expiry notes beneath choices');
 await page.screenshot({path:path.join(root,'test-artifacts/passenger-report-weather.png')});
 await page.locator('#passenger-report-submit').click();await page.waitForFunction(()=>document.getElementById('passenger-report-status').textContent.includes('Could not confirm submission'));
 assert.equal(await page.locator('.jalan-community-report-pin').count(),0,'server failure cannot claim success or add an icon');
 failed=false;await page.locator('#passenger-report-submit').click();await page.waitForFunction(()=>!document.getElementById('passenger-report-dialog').open);
 assert.deepEqual(submissions.at(-1).position,[101.687,3.139]);assert.equal(submissions.at(-1).heading,90);assert.equal(submissions.at(-1).type,'flood');
 assert.equal(await page.locator('.jalan-community-report-pin').count(),1);
 await page.locator('#jalan-home-report').click();await page.locator('[data-type=weather]').click();await page.locator('[data-type=flood]').click();await page.locator('#passenger-report-submit').click();await page.waitForFunction(()=>!document.getElementById('passenger-report-dialog').open);
 assert.equal(await page.locator('.jalan-community-report-pin').count(),1,'merged event replaces existing pin');
 await page.evaluate(()=>{const original=JalanGPS.getState;window.__reportFixtureActive=true;JalanGPS.getState=()=>({...original(),active:window.__reportFixtureActive,gpsFixAgeMs:0,gpsPosition:[window.__reportPosition[1],window.__reportPosition[0]],route:{geometry:{coordinates:[[101.68,3.139],[101.70,3.139]]}}});});
 // Explicit one-tap reporting works while passive sharing and nearby lookup are off.
 const beforePrompt=submissions.length;
 await page.evaluate(()=>{document.getElementById('smart-demo').click();document.getElementById('smart-yes').click();});
 await page.waitForFunction(()=>document.getElementById('passenger-report-toast').textContent==='Traffic report sent.');
 assert.equal(submissions.length,beforePrompt+1);assert.equal(submissions.at(-1).type,'traffic');
 assert.equal(nearbyPosts,0);
 nearby=[event('ahead-event','accident',[101.689,3.139])];
 await page.evaluate(()=>{window.__reportPosition=[101.688,3.139];window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{gpsReliable:true,gpsPosition:[3.139,101.688],gpsAccuracy:8,gpsFixAgeMs:0,heading:90}}));});
 assert.equal(nearbyPosts,0,'GPS events alone must not upload position or fetch nearby reports');
 assert.equal(await page.evaluate(()=>JalanCommunityReports.getEvents().some(e=>e.id==='ahead-event')),false);
 await page.evaluate(()=>{const box=document.getElementById('passenger-nearby-consent');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>JalanCommunityReports.getEvents().some(e=>e.id==='ahead-event'));
 assert.equal(nearbyPosts,1,'explicit opt-in allows one body-only nearby lookup');
 await page.evaluate(()=>{const box=document.getElementById('passenger-nearby-consent');box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>JalanCommunityReports.getEvents().some(e=>e.id==='ahead-event')),false,'opt-out removes nearby community event from the screen');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{gpsReliable:true,gpsPosition:[3.139,101.688],gpsAccuracy:8,gpsFixAgeMs:0,heading:90}})));
 assert.equal(nearbyPosts,1,'opt-out prevents subsequent location POST requests');
 await page.evaluate(()=>{const box=document.getElementById('passenger-nearby-consent');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>JalanCommunityReports.getEvents().some(e=>e.id==='ahead-event'));
 assert.equal(nearbyPosts,2,'fresh opt-in can resume nearby lookup');
 assert.equal(await page.locator('#passenger-report-confirm').isVisible(),false,'more than 50m ahead does not prompt');
 const move=async(lon,heading=90)=>page.evaluate(({lon,heading})=>{window.__reportPosition=[lon,3.139];window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{gpsReliable:true,gpsPosition:[3.139,lon],gpsAccuracy:8,gpsFixAgeMs:0,heading}}));},{lon,heading});
 await move(101.68864);assert.equal(await page.locator('#passenger-report-confirm').isVisible(),true,'card begins within 50m before event');
 // Real navigation's transparent gesture plane has stacking level 1500.
 // Confirmation must remain clickable above it, not merely look visible.
 await page.evaluate(()=>{const overlay=document.createElement('div');overlay.id='report-navigation-gesture-fixture';overlay.style.cssText='position:fixed;inset:0;z-index:1500;pointer-events:auto';document.body.append(overlay);});
 await page.locator('[data-answer=still]').click();
 await page.evaluate(()=>document.getElementById('report-navigation-gesture-fixture').remove());await page.waitForFunction(()=>document.getElementById('passenger-report-toast').textContent.includes('timer was refreshed'));
 assert.equal(responses.length,1);assert.equal(responses[0].answer,'still');
 await move(101.68863);assert.equal(await page.locator('#passenger-report-confirm').isVisible(),false,'no repeat for updated event');
 await page.evaluate(()=>window.dispatchEvent(new Event('jalan:journey-start')));await move(101.68864);assert.equal(await page.locator('#passenger-report-confirm').isVisible(),false,'internal guidance restart does not repeat confirmation');
 await page.screenshot({path:path.join(root,'test-artifacts/passenger-report-submitted.png')});
 // New trip permits one card again; no answer times out without a server response.
 await page.evaluate(()=>{window.__reportFixtureActive=false;document.getElementById('passenger-go').dispatchEvent(new Event('click'));window.__reportFixtureActive=true;});
 await move(101.68864,270);assert.equal(await page.locator('#passenger-report-confirm').isVisible(),false,'opposite traffic does not prompt');
 await move(101.68864);assert.equal(await page.locator('#passenger-report-confirm').isVisible(),true);
 const card=await page.locator('#passenger-report-confirm').boundingBox(),control=await page.locator('#jalan-home-report').boundingBox();
 assert.ok(card.y+card.height<control.y,'confirmation card clears map controls');
 assert.equal(await page.locator('#passenger-report-toast').isVisible(),false,'old toast does not cover confirmation');
 await page.screenshot({path:path.join(root,'test-artifacts/passenger-report-confirm.png')});
 await page.waitForTimeout(10200);assert.equal(await page.locator('#passenger-report-confirm').isVisible(),false);assert.equal(responses.length,1,'timeout sends no vote');
 await page.evaluate(()=>document.getElementById('jalan-home-report').click());await page.locator('[data-type=hazard]').click();await page.evaluate(()=>window.__reportAccuracy=200);const count=submissions.length;
 await page.locator('#passenger-report-submit').click();await page.waitForFunction(()=>document.getElementById('passenger-report-status').textContent.includes('Could not confirm submission'));
 assert.equal(submissions.length,count,'poor GPS cannot submit');await page.keyboard.press('Escape');assert.equal(await page.locator('#passenger-report-dialog').isVisible(),false);
 await page.evaluate(()=>window.dispatchEvent(new Event('jalan:journey-stop')));
 assert.equal(await page.locator('#passenger-nearby-consent').isChecked(),false,'Stop revokes the nearby GPS-upload opt-in');
 const afterStop=nearbyPosts;
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{gpsReliable:true,gpsPosition:[3.139,101.688],gpsAccuracy:8,gpsFixAgeMs:0,heading:90}})));
 assert.equal(nearbyPosts,afterStop,'even a delayed GPS fix cannot restart uploads after Stop');
 await page.evaluate(()=>window.__reportAccuracy=8);
 await page.locator('#jalan-home-report').click();
 await page.getByRole('button',{name:'Traffic',exact:true}).click();
 const choices=page.locator('#passenger-report-categories');
 assert.deepEqual(await choices.getByRole('button').allTextContents(),['Light Traffic Jam','Moderate Traffic Jam','Heavy Traffic Jam','Back']);
 assert.equal(await page.locator('#passenger-report-submit').isEnabled(),false);
 await choices.getByRole('button',{name:'Light Traffic Jam'}).click();
 await choices.getByRole('button',{name:'Back'}).click();
 assert.equal(await page.locator('#passenger-report-submit').isEnabled(),false);
 await choices.getByRole('button',{name:'Traffic',exact:true}).click();
 await choices.getByRole('button',{name:'Moderate Traffic Jam'}).click();
 await choices.getByRole('button',{name:'Heavy Traffic Jam'}).click();
 assert.deepEqual(await choices.locator('[aria-pressed=true]').allTextContents(),['Heavy Traffic Jam']);
 await page.screenshot({path:path.join(root,'test-artifacts/passenger-traffic-choices.png')});
 await page.locator('#passenger-report-submit').click();
 await page.waitForFunction(()=>!document.getElementById('passenger-report-dialog').open);
 assert.equal(submissions.at(-1).type,'traffic');assert.equal(submissions.at(-1).trafficSeverity,'heavy');
 assert.equal(await page.locator('.jalan-community-report-pin[title*="Heavy Traffic Jam"]').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS community reports: weather, submit-time GPS, failed upload, merged icon, directional 50m prompt, once per journey, timeout and inaccurate GPS');
 }finally{await context.close();}
};
