'use strict';
// Real 390px DOM/keyboard/touch flow; provider fixtures only, no real key/GPS.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({context,base,root}){
 const page=await context.newPage(),errors=[],requests=[];let manual=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort('blockedbyclient'));
 const leaflet=path.join(root,'node_modules/leaflet/dist');
 for(const ext of ['js','css'])await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.'+ext,route=>route.fulfill({contentType:ext==='js'?'application/javascript':'text/css',body:fs.readFileSync(path.join(leaflet,'leaflet.'+ext))}));
 await page.route('**/jalan-config.js*',route=>route.fulfill({contentType:'application/javascript',body:"window.JalanPublicConfig={managedTomTom:true,tomtomBrowserKey:'SYNTHETIC_SEARCH_FIXTURE',appVersion:'4.8.0-test'};"}));
 const headers={'access-control-allow-origin':'*'};
 const result=(name,lat=3.15785,lon=101.71165)=>({poi:{name},address:{freeformAddress:'Kuala Lumpur, Malaysia'},position:{lat,lon}});
 await page.route('https://api.tomtom.com/search/2/search/**',async route=>{
  const url=new URL(route.request().url()),query=decodeURIComponent(url.pathname.split('/').pop().replace(/\.json$/,''));requests.push(query);
  assert.equal(url.searchParams.get('typeahead'),'true');assert.equal(url.searchParams.get('countrySet'),'MY');assert.equal(url.searchParams.get('limit'),'5');
  for(const name of ['lat','lon','geobias'])assert.equal(url.searchParams.has(name),false,'typing never shares current coordinates');
  if(['Slow','Clear','Collapse'].includes(query))await new Promise(resolve=>setTimeout(resolve,900));
  if(query==='Failure')return route.fulfill({status:503,headers,body:'Unavailable'}).catch(()=>{});
  const branches=[
   result('Q Bistro TTDI',3.15,101.62),result('Q Bistro Cheras',3.10,101.71),
   result('Restoran Zaynas Bistro',3.22,101.73)
  ];
  const results=query.startsWith('q bistro')?branches:query==='KLCC'?[result('Petronas Twin Towers'),result('KLCC Park',3.155,101.715),result('Invalid',NaN,101),result('<img src=x onerror=alert(1)>')]:[result(query+' place')];
  await route.fulfill({contentType:'application/json',headers,body:JSON.stringify({results})}).catch(()=>{});
 });
 await page.route('https://api.tomtom.com/routing/**',route=>route.fulfill({contentType:'application/json',headers,body:JSON.stringify({routes:[{summary:{travelTimeInSeconds:420,lengthInMeters:3200,trafficDelayInSeconds:0},legs:[{points:[{latitude:3.139,longitude:101.6869},{latitude:3.15785,longitude:101.71165}]}],guidance:{instructions:[]}}]})}));
 await page.route('https://nominatim.openstreetmap.org/search*',route=>{manual++;return route.fulfill({contentType:'application/json',headers,body:JSON.stringify([{lat:'3.15785',lon:'101.71165',display_name:'Manual destination'}])});});
 const input=page.locator('#destination'),options=page.locator('#results [role=option]');
 const boot=async()=>{await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});await page.locator('#jalan-search-trigger').click();await input.focus();};
 await boot();
 const quick=page.locator('.jalan-sheet-quick'),recent=page.locator('.jalan-sheet-recent');
 const results=page.locator('#results');
 assert.ok(await quick.isVisible()&&await recent.isVisible(),'empty search offers shortcuts and Recent');
 for(const control of ['#jalan-home-menu','#passenger-gps-status'])assert.equal(await page.locator(control).isVisible(),false);
 await input.fill('K');
 assert.equal(await quick.isVisible()||await recent.isVisible(),false,'the first character gives the space to results');
 assert.ok(await page.locator('link[rel=apple-touch-icon]').getAttribute('href'));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'passenger.webmanifest'),'utf8'));
 assert.equal(manifest.short_name,'JALAN');assert.equal(manifest.start_url,'./index.html?mode=passenger');
 for(const icon of manifest.icons){const png=fs.readFileSync(path.join(root,icon.src)),size=Number(icon.sizes.split('x')[0]);assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 const touch=fs.readFileSync(path.join(root,'icons/jalan-touch-180.png'));assert.equal(touch.readUInt32BE(16),180);
 await input.fill('KL');await page.waitForTimeout(550);assert.equal(requests.length,0,'short query makes no network lookup');
 await input.fill('q bistro');await options.first().waitFor();
 assert.deepEqual(await options.locator('strong').allTextContents(),['Q Bistro TTDI','Q Bistro Cheras']);
 await input.fill('q bistro taman melati');await page.getByText('No suggestions yet. Try a fuller place name or tap Search.').waitFor();
 assert.equal(await options.count(),0,'unrelated TomTom names stay hidden with no Google key');
 await input.fill('q bistro');await options.first().waitFor();
 assert.equal(await options.count(),2,'cached broad query retains multiple matching branches');
 requests.length=0;
 await input.fill('KLC');await page.waitForTimeout(100);await input.fill('KLCC');
 await options.first().waitFor();assert.deepEqual(requests,['KLCC'],'rapid edits collapse to one debounced request');
 assert.equal(await options.count(),3,'invalid coordinates are ignored');assert.equal(await page.locator('#results img').count(),0,'provider names render as text');
 // Model iOS resizing and panning only the visual viewport over a full-height layout.
 await page.evaluate(()=>{
   Object.defineProperties(visualViewport,{height:{configurable:true,value:410},offsetTop:{configurable:true,value:20}});
   visualViewport.dispatchEvent(new Event('resize'));
 });
 const keyboardList=await results.boundingBox();
 const field=await page.locator('#search-form').boundingBox();
 assert.ok(Math.abs(keyboardList.y-field.y-field.height)<16,'results start directly below the search field');
 assert.ok(Math.abs(keyboardList.y+keyboardList.height-430)<16,'results extend down to the keyboard');
 await input.evaluate(el=>el.blur());
 await page.evaluate(()=>{
   delete visualViewport.height;delete visualViewport.offsetTop;
   visualViewport.dispatchEvent(new Event('resize'));
 });
 await page.waitForTimeout(250);
 assert.equal(await input.inputValue(),'KLCC');
 assert.equal(await options.count(),3,'keyboard dismissal preserves every result');
 assert.ok((await results.boundingBox()).height>keyboardList.height+200,'results expand when the keyboard closes');
 await page.screenshot({path:path.join(root,'test-artifacts/destination-suggestions.png')});
 await page.evaluate(()=>{document.getElementById('start-choice').value='map';setStart([3.139,101.6869],'Fixture start');});
 await options.first().tap();await page.waitForFunction(()=>routes.length===1);
 assert.deepEqual(await page.evaluate(()=>destination),[3.15785,101.71165],'tap uses the exact provider point and proceeds to routes');
 assert.equal(await page.locator('#passenger-overview').isVisible(),true);assert.equal(manual,0);
 await boot();
 await input.fill('Slow');await page.waitForFunction(()=>document.getElementById('results').getAttribute('aria-busy')==='true');
 await input.fill('Fresh');await options.first().waitFor();await page.waitForTimeout(650);
 assert.match(await options.first().innerText(),/Fresh place/,'late old response cannot overwrite a newer query');
 const before=requests.length;await input.fill('Fresh');await options.first().waitFor();assert.equal(requests.length,before,'repeated query uses page-memory cache');
 await input.fill('Clear');await page.waitForFunction(()=>document.getElementById('results').getAttribute('aria-busy')==='true');await input.fill('');await page.waitForTimeout(1000);
 assert.equal(await page.locator('#results').isVisible(),false,'clear cancels pending results');
 assert.ok(await quick.isVisible()&&await recent.isVisible(),'clearing restores shortcuts and Recent');
 await input.fill('Collapse');await page.waitForFunction(()=>document.getElementById('results').getAttribute('aria-busy')==='true');await page.locator('#jalan-sheet-handle').click();await page.waitForTimeout(1000);
 assert.equal(await page.locator('#results').isVisible(),false,'collapse cannot be reopened by a late response');
 for(const control of ['#jalan-home-menu','#passenger-gps-status'])assert.ok(await page.locator(control).isVisible());
 await page.locator('#jalan-search-trigger').click();await input.fill('Failure');await page.getByText('Suggestions unavailable. Tap Search to try again.').waitFor();
 await input.press('Escape');assert.equal(await input.getAttribute('aria-expanded'),'false');
 const beforeIME=requests.length;await input.dispatchEvent('compositionstart');await input.fill('Compose');await page.waitForTimeout(550);assert.equal(requests.length,beforeIME);
 await input.dispatchEvent('compositionend');await options.first().waitFor();
 await input.press('ArrowDown');assert.equal(await options.first().getAttribute('aria-selected'),'true');
 await input.press('Enter');assert.equal(await input.inputValue(),'Compose place','keyboard Enter selects the highlighted suggestion');assert.equal(manual,0);
 await boot();await page.evaluate(()=>{const key=document.getElementById('tt-key');key.value='';key.dispatchEvent(new Event('input'));});
 const noKey=requests.length;await input.fill('Manual');await page.waitForTimeout(600);assert.equal(requests.length,noKey,'no key does not silently autocomplete through public Nominatim');assert.equal(manual,0);
 await input.press('Enter');await page.locator('#results button').first().waitFor();assert.equal(manual,1,'explicit Search fallback still works');
 // The native shell handles permission. Exercise the web handoff through real search and route controls.
 await page.addInitScript(()=>{
   let permission='denied';
   window.__openedSettings=0;
   window.JalanNativeLocation={get permission(){return permission;},openSettings(){window.__openedSettings++;}};
   window.__allowLocation=()=>{
     permission='allowed';dispatchEvent(new CustomEvent('jalan:iphone-permission',{detail:{previous:'denied',permission}}));
   };
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
     getCurrentPosition(ok,fail){queueMicrotask(()=>permission==='allowed'
       ?ok({coords:{latitude:3.139,longitude:101.6869,accuracy:5},timestamp:Date.now()}):fail({code:1}));},
     watchPosition(){return 1;},clearWatch(){}
   }});
 });
 await boot();
 await input.fill('KLCC');await options.first().click();
 const card=page.locator('#iphone-location-destination'),prompt=page.locator('#iphone-location-title');
 await card.waitFor();assert.equal(await prompt.isVisible(),false);
 await card.getByRole('button',{name:'Go',exact:true}).click();await prompt.waitFor();
 await page.getByRole('button',{name:'Keep browsing'}).click();
 assert.equal(await page.evaluate(()=>destinationName),'Petronas Twin Towers');
 await card.getByRole('button',{name:'Go',exact:true}).click();
 await page.getByRole('button',{name:'Open Settings'}).click();
 assert.equal(await page.evaluate(()=>window.__openedSettings),1);
 await page.evaluate(()=>window.__allowLocation());
 await page.waitForFunction(()=>routes.length===1);
 assert.deepEqual(await page.evaluate(()=>destination),[3.15785,101.71165]);
 assert.equal(await card.isVisible(),false);
 console.log('PASS iPhone denial allows search, Go opens Settings, and return keeps the chosen destination');
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS destination typeahead: debounce, text safety, exact route selection, stale/clear/collapse/IME, keyboard, cache, no-key manual fallback and install icons');
};

