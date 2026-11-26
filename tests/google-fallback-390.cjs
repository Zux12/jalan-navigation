'use strict';
// Synthetic UI Kit contract in a real 390px browser. NOT Google live coverage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function sdkFixture(){
 class Request extends HTMLElement{
  set maxResultCount(value){this.count=value;}
  set locationRestriction(value){this.bounds=value;}
  set textQuery(value){
   window.__googleQueries.push({query:value,count:this.count,bounds:this.bounds});
   const widget=this.parentElement;
   setTimeout(()=>{
    if(value==='Google error'){widget.dispatchEvent(new Event('gmp-error'));return;}
    const place={id:'SYNTHETIC_Q_BISTRO',displayName:'Q Bistro Taman Melati',location:{lat:()=>3.222,lng:()=>101.729}};
    const ayer=['North','South'].map(branch=>({id:'FIXTURE_AYER_'+branch,displayName:'Ayer 8 '+branch,location:place.location}));
    widget.places=value==='ayer 8'?ayer:['Nothing here','KLCC'].includes(value)?[]:[place];
    const shadow=widget.shadowRoot;shadow.replaceChildren();
    const attribution=document.createElement('p');attribution.textContent='Google Maps · simulated provider';shadow.append(attribution);
    for(const selected of widget.places){
     const button=document.createElement('button');button.textContent=selected.displayName;
     button.onclick=()=>{const event=new Event('gmp-select');event.place=(value==='q bistro taman melati'||value==='ayer 8')?{id:selected.id,location:selected.location}:selected;widget.dispatchEvent(event);};shadow.append(button);
    }
    widget.dispatchEvent(new Event('gmp-load'));
   },value==='Slow Google'?1000:30);
  }
 }
 customElements.define('gmp-place-search',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'});}});
 customElements.define('gmp-place-text-search-request',Request);
 customElements.define('gmp-place-details-compact',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'});}});
 customElements.define('gmp-place-details-place-request',class extends HTMLElement{
  set place(id){
   const widget=this.parentElement;
   setTimeout(()=>{
    widget.place={id,location:{lat:()=>3.222,lng:()=>101.729}};
    const branch=id.startsWith('FIXTURE_AYER_')?id.slice('FIXTURE_AYER_'.length):'';
    if(branch){
     const root=widget.shadowRoot;
     root.innerHTML='<style>:host{box-sizing:border-box}section{position:relative;padding:10px 56px 6px 10px}strong,span{display:block}strong{font:var(--gmp-mat-font-title-small)}span{font:var(--gmp-mat-font-body-small)}a{position:absolute;right:10px;top:10px}footer{padding:0 10px 10px}</style><section></section><footer>Google Maps <button type="button" aria-label="About Google Maps">ⓘ</button></footer>';
     const section=root.querySelector('section');
     if(widget.querySelector('gmp-place-name')){const name=document.createElement('strong');name.textContent='Ayer 8 '+branch;section.append(name);}
     if(widget.querySelector('gmp-place-address')){const address=document.createElement('span');address.textContent='Fixture '+branch+' Street, Putrajaya';section.append(address);}
     const maps=document.createElement('a');maps.href='#maps-fixture';maps.textContent='↗';maps.setAttribute('aria-label','Open in Maps');section.append(maps);
     maps.onclick=e=>{e.preventDefault();window.__mapsLinkOpened=true;};
     root.querySelector('footer button').onclick=()=>{window.__mapsInfoOpened=true;};
    }
    widget.dispatchEvent(new Event((branch&&!window.__rejectRecentDetails)||id==='SYNTHETIC_Q_BISTRO'?'gmp-load':'gmp-error'));
   },20);
  }
 });
 window.google={maps:{importLibrary:async()=>({})}};
 const callback=new URL(document.currentScript.src).searchParams.get('callback');window[callback]();
}
module.exports=async function({context,base,root}){
 const page=await context.newPage(),errors=[],googleQueries=[],ttQueries=[];let sdkLoads=0,manual=0,routeCalls=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.__googleQueries=[];});
 await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort('blockedbyclient'));
 const leaflet=path.join(root,'node_modules/leaflet/dist');
 for(const ext of ['js','css'])await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.'+ext,route=>route.fulfill({contentType:ext==='js'?'application/javascript':'text/css',body:fs.readFileSync(path.join(leaflet,'leaflet.'+ext))}));
 await page.route('**/jalan-config.js*',route=>route.fulfill({contentType:'application/javascript',body:"window.JalanPublicConfig={managedTomTom:true,tomtomBrowserKey:'SYNTHETIC_SEARCH_FIXTURE',googlePlacesFallback:true,googleMapsBrowserKey:'SYNTHETIC_GOOGLE_BROWSER_KEY'};"}));
 await page.route('https://maps.googleapis.com/maps/api/js?**',route=>{
  sdkLoads++;const url=new URL(route.request().url());assert.equal(url.searchParams.get('region'),'MY');
  return route.fulfill({contentType:'application/javascript',body:'('+sdkFixture.toString()+')()'});
 });
 const headers={'access-control-allow-origin':'*'};let expectedEndpoint=[3.222,101.729];
 await page.route('https://api.tomtom.com/search/2/search/**',route=>{
  const url=new URL(route.request().url()),query=decodeURIComponent(url.pathname.split('/').pop().replace(/\.json$/,''));ttQueries.push(query);
  for(const field of ['lat','lon','geobias'])assert.equal(url.searchParams.has(field),false);
  if(query==='TomTom error')return route.fulfill({status:503,headers,body:'unavailable'});
  const branches=['TTDI','Cheras'].map((label,index)=>({poi:{name:'Q Bistro '+label},address:{freeformAddress:label+', Kuala Lumpur'},position:{lat:3.15+index*0.01,lon:101.7}}));
  const results=query.toLowerCase()==='q bistro'?branches:query==='Google error'?[{poi:{name:'Google error avenue'},position:{lat:3.15,lon:101.7}}]:query==='KLCC'?[{poi:{name:'KLCC'},address:{freeformAddress:'Kuala Lumpur'},position:{lat:3.15785,lon:101.71165}}]:query.toLowerCase().includes('q bistro')?[{poi:{name:'Restoran Zaynas Bistro'},address:{freeformAddress:'Taman Melati'},position:{lat:3.222168,lon:101.728777}}]:[];
  return route.fulfill({contentType:'application/json',headers,body:JSON.stringify({results})});
 });
 await page.route('https://api.tomtom.com/routing/**',route=>{
  routeCalls++;
  const endpoint=new URL(route.request().url()).pathname.split('/').at(-2).split(':').at(-1).split(',').map(Number);
  assert.deepEqual(endpoint,expectedEndpoint,'route request uses the exact synthetic Google destination (provider formats six decimals)');
  return route.fulfill({contentType:'application/json',headers,body:JSON.stringify({routes:[{summary:{travelTimeInSeconds:420,lengthInMeters:3200,trafficDelayInSeconds:0},legs:[{points:[{latitude:3.139,longitude:101.6869},{latitude:3.222,longitude:101.729}]}],guidance:{instructions:[]}}]})});
 });
 await page.route('https://nominatim.openstreetmap.org/search*',route=>{manual++;return route.abort();});
 const input=page.locator('#destination'),widget=page.locator('gmp-place-search');
 const boot=async()=>{await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});await page.locator('#jalan-search-trigger').click();await input.focus();};
 await boot();await input.fill('KLCC');await page.locator('#results [role=option]').waitFor();
 await page.waitForFunction(()=>window.__googleQueries.some(request=>request.query==='KLCC'));
 await widget.waitFor({state:'detached'});
 assert.equal(await page.getByRole('heading',{name:'JALAN Result',exact:true}).count(),0);
 assert.equal(await page.getByRole('heading',{name:'Google Maps Results',exact:true}).count(),0);
 assert.equal(sdkLoads,1,'Google is checked even for a TomTom match');
 await input.fill('q bistro');
 await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).waitFor();
 assert.deepEqual(await page.locator('#results [role=option] strong').allTextContents(),['Q Bistro TTDI','Q Bistro Cheras']);
 const jalanHeading=page.getByRole('heading',{name:'JALAN Result',exact:true});
 const googleHeading=page.getByRole('heading',{name:'Google Maps Results',exact:true});
 await googleHeading.waitFor();
 assert.equal(await googleHeading.innerText(),'Results','the provider supplies its own Google Maps wordmark');
 assert.equal(await jalanHeading.count(),0,'TomTom branches appear without a heading');
 assert.equal(await googleHeading.evaluate(el=>getComputedStyle(el).pointerEvents),'none','caption cannot intercept the info button');
 const rowStyle=await widget.evaluate(el=>{
  const style=getComputedStyle(el);
  return [style.borderTopWidth,style.borderRadius,style.getPropertyValue('--gmp-card-border-radius').trim()];
 });
 assert.deepEqual(rowStyle,['0px','0px','0px'],'Google suggestions share the list without a second card');
 assert.equal(routeCalls,0,'listing multiple branches must not start a route');
 await input.press('ArrowDown');
 assert.equal(await input.getAttribute('aria-activedescendant'),'destination-suggestion-0');
 await input.fill('q bistro taman melati');await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).waitFor();
 assert.equal(await widget.locator('template[slot="details-item"]').evaluate(template=>Boolean(template.content.querySelector('gmp-place-address'))),true,'Google renders branch addresses inside its attributed result');
 assert.equal(sdkLoads,1);assert.equal(await page.locator('#results input').count(),0,'one search bar; no second Google field');
 assert.equal(await widget.getAttribute('attribution-position'),'top');
 assert.equal(await jalanHeading.count(),0,'no JALAN heading when only Google matches');
 assert.equal(await googleHeading.count(),1);
 googleQueries.push(...await page.evaluate(()=>window.__googleQueries));
 assert.equal(await page.locator('#results [role=option]').count(),0,'a narrowed query hides unrelated TomTom branches');
 assert.deepEqual(googleQueries.at(-1),{query:'q bistro taman melati',count:5,bounds:{south:0.8,west:99.5,north:7.5,east:119.5}});
 fs.mkdirSync(path.join(root,'test-artifacts'),{recursive:true});
 await page.screenshot({path:path.join(root,'test-artifacts/google-fallback-fixture.png')});
 await page.evaluate(()=>{document.getElementById('start-choice').value='map';setStart([3.139,101.6869],'Fixture start');});
 await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).focus();await page.waitForTimeout(250);
 assert.equal(await widget.isVisible(),true,'keyboard focus inside Google results survives input blur');
 await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).press('Enter');await page.waitForFunction(()=>routes.length===1);
 assert.equal(await input.inputValue(),'q bistro taman melati','an ID-only event uses the query as its temporary label');
 assert.deepEqual(await page.evaluate(()=>destination),[3.222,101.729]);assert.equal(routeCalls,1);assert.equal(manual,0);
 await boot();await input.fill('Slow Google');await widget.waitFor({state:'attached'});
 await input.fill('KLCC');await page.locator('#results [role=option]').waitFor();await page.waitForTimeout(1100);
 assert.equal(await widget.count(),0,'late Google response cannot overwrite newer TomTom results');
 assert.match(await page.locator('#results').innerText(),/KLCC/);
 await input.fill('Slow Google');await widget.waitFor({state:'attached'});await input.fill('');await page.waitForTimeout(1100);
 assert.equal(await page.locator('#results').isVisible(),false,'clear detaches pending Google component');
 await input.fill('Nothing here');await page.getByText('No matching places found. Try a fuller place name.').waitFor();
 assert.equal(await googleHeading.count(),0,'no Google heading on an empty response');
 await input.fill('Google error');await page.getByText('Google suggestions unavailable. Try again shortly.').waitFor();
 assert.equal(await googleHeading.count(),0,'no Google heading on provider error');
 assert.match(await page.locator('#results [role=option]').innerText(),/Google error avenue/,'Google failure retains TomTom matches');
 await input.fill('TomTom error');await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).waitFor();
 await input.fill('Slow Google');await widget.waitFor({state:'attached'});await page.locator('#jalan-sheet-handle').click();await page.waitForTimeout(1100);
 assert.equal(await page.locator('#results').isVisible(),false,'sheet collapse dismisses fallback');
 await page.locator('#jalan-search-trigger').click();await input.fill('q bistro taman melati');await input.press('Enter');
 await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).waitFor();assert.equal(manual,0,'submit shares the same provider flow when configured');
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>/google/i.test(key))),false);
 const quick=key=>page.locator('.jalan-sheet-quick [data-shortcut="'+key+'"]');
 const editor=page.locator('.jalan-place-editor');
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('jalan-passenger-saved-places-v1')||'[]'));
 await boot();
 await quick('home').click();await input.fill('q bistro');
 await page.locator('#results [role=option]').filter({hasText:'Cheras'}).click();
 await editor.getByRole('button',{name:'Save',exact:true}).click();
 assert.equal((await saved())[0].name,'Home');assert.equal(routeCalls,1,'saving does not start another journey');
 await quick('work').click();await input.fill('q bistro taman melati');
 await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).click();
 await editor.getByRole('button',{name:'Save',exact:true}).click();
 assert.deepEqual((await saved()).find(p=>p.id==='work'),{id:'work',name:'Work',googleId:'SYNTHETIC_Q_BISTRO'});
 await quick('new').click();await input.fill('KLCC');
 await page.locator('#results [role=option]').click();
 await editor.getByLabel('Shortcut name').fill('Family');
 await editor.getByRole('button',{name:'Save',exact:true}).click();
 assert.equal((await saved()).length,3);
 await page.getByRole('button',{name:'Edit Home',exact:true}).click();
 await input.fill('KLCC');await page.locator('#results [role=option]').click();
 await editor.getByRole('button',{name:'Cancel',exact:true}).click();
 for(const [id,point] of [['home',[3.16,101.7]],['work',[3.222,101.729]],['Family',[3.15785,101.71165]]]){
  expectedEndpoint=point;await boot();
  await page.evaluate(()=>{document.getElementById('start-choice').value='map';setStart([3.139,101.6869],'Fixture start');});
  const target=id==='Family'?page.locator('.jalan-saved-places button').filter({hasText:/^Family/}):quick(id);
  await target.click();await page.waitForFunction(()=>routes.length>0);
  const position=await page.evaluate(()=>destination);
  assert.ok(position.every((value,i)=>Math.abs(value-point[i])<1e-6));
  assert.equal(await page.locator('#passenger-overview').isVisible(),true);
 }
 assert.equal(routeCalls,4);assert.equal((await saved()).length,3);
 await boot();
 const beforeRemoval=await saved();
 async function removePlace(shortcut,accept){
  const fixed=shortcut==='Home'||shortcut==='Work';
  const action=editor.getByRole('button',{name:fixed?'Remove address':'Remove saved place',exact:true});
  if(!await action.isVisible())await page.getByRole('button',{name:'Edit '+shortcut,exact:true}).click();
  const confirmDialog=page.waitForEvent('dialog').then(async dialog=>{
   const prompt=dialog.message();
   if(accept)await dialog.accept();else await dialog.dismiss();
   assert.ok(prompt.includes(shortcut));
  });
  await Promise.all([confirmDialog,action.click()]);
 }
 await removePlace('Home',false);
 assert.deepEqual(await saved(),beforeRemoval);
 await removePlace('Home',true);
 await boot();
 assert.deepEqual(await saved(),beforeRemoval.filter(p=>p.id!=='home'));
 await quick('home').click();
 assert.equal(await editor.locator('h2').innerText(),'Set Home');
 assert.equal(await editor.locator('[data-action=remove]').isVisible(),false);
 await editor.getByRole('button',{name:'Cancel'}).click();
 await removePlace('Work',true);
 assert.deepEqual(await saved(),beforeRemoval.filter(p=>p.name==='Family'));
 await removePlace('Family',true);
 await boot();
 assert.deepEqual(await saved(),[]);
 assert.equal(await page.locator('.jalan-saved-places').isVisible(),false);
 assert.equal(await quick('work').isVisible(),true);
 assert.equal(routeCalls,4,'removing a saved address does not request a route');
 console.log('PASS remove saved phone shortcuts, cancel removal, and verify retained places after reload');
 console.log('PASS saved Home/Work/custom places, cancellation, Google ID resolution, reload and route choices');
 // Two Google branches share the same coordinates. Only the selected ID
 // can identify the right name and street in Recent.
 await page.evaluate(()=>{document.getElementById('start-choice').value='map';startPoint=null;});
 async function chooseAyer(branch){
  await input.fill('ayer 8');
  await widget.getByRole('button',{name:'Ayer 8 '+branch}).click();
  await page.locator('#jalan-search-trigger').click();
 }
 const recent=page.locator('#jalan-recent-list');
 await chooseAyer('South');
 const south=recent.locator('li[data-recent-key="google:FIXTURE_AYER_South"]');
 await south.getByText(/Fixture South Street, Putrajaya/).waitFor();
 assert.equal(await south.locator('gmp-place-attribution').count(),1);
 assert.equal(await south.locator('gmp-place-google-maps-button').count(),0);
 const routeTarget=south.getByRole('button',{name:/Route to/});
 assert.equal(await routeTarget.innerText(),'','no separate visible Route label');
 const googleStyle=await south.locator('gmp-place-details-compact').evaluate(el=>{
  const widget=getComputedStyle(el),row=getComputedStyle(el.closest('li').querySelector('button'));
  return [widget.borderTopWidth,widget.getPropertyValue('--gmp-mat-font-title-small').trim(),widget.getPropertyValue('--gmp-mat-font-body-small').trim(),row.getPropertyValue('--recent-font').trim()];
 });
 assert.deepEqual(googleStyle,['0px',googleStyle[3],googleStyle[3],googleStyle[3]]);
 const beforeControls=routeCalls;
 await south.getByRole('button',{name:'About Google Maps'}).click();
 await south.getByRole('link',{name:'Open in Maps'}).click();
 assert.deepEqual(await page.evaluate(()=>[window.__mapsInfoOpened,window.__mapsLinkOpened]),[true,true]);
 assert.equal(routeCalls,beforeControls);
 assert.equal(await page.locator('#jalan-home-sheet').getAttribute('data-state'),'c');
 await page.evaluate(()=>window.__rejectRecentDetails=true);
 await chooseAyer('North');
 const north=recent.locator('li[data-recent-key="google:FIXTURE_AYER_North"]');
 await north.getByText(/Address unavailable/).waitFor();
 assert.equal(await south.count(),1,'a different Google place at the same entrance retains its row');
 await page.evaluate(()=>window.__rejectRecentDetails=false);
 await page.evaluate(async()=>{clearRoute(true);await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});
 await page.locator('#jalan-search-trigger').click();
 await north.getByText(/Fixture North Street, Putrajaya/).waitFor();
 await page.evaluate(()=>{setStart([3.139,101.6869],'Fixture start');});
 expectedEndpoint=[3.222,101.729];const beforeRecentRoute=routeCalls;
 const address=await south.getByText('Fixture South Street, Putrajaya').boundingBox();
 // Press the visible address as a passenger would; the native row button handles the tap.
 await page.mouse.click(address.x+5,address.y+address.height/2);
 await page.waitForFunction(()=>routes.length>0);
 assert.equal(routeCalls,beforeRecentRoute+1,'Recent routes directly to the selected point');
 assert.equal(await recent.locator('li').first().getAttribute('data-recent-key'),'google:FIXTURE_AYER_South');
 assert.equal(await recent.locator('li[data-recent-key^="google:FIXTURE_AYER_"]').count(),2,'reselection reorders the existing branch');
 const history=await page.evaluate(()=>JSON.parse(localStorage.getItem('jalan-passenger-recent-v1')));
 assert.deepEqual(history[0],{googleId:'FIXTURE_AYER_South',searchText:'ayer 8'},'only the place ID and typed query persist for Google');
 await boot();
 assert.equal(await recent.locator('li').first().getAttribute('data-recent-key'),'google:FIXTURE_AYER_South');
 await south.getByText('Fixture South Street, Putrajaya').waitFor();
 await page.evaluate(()=>{document.getElementById('start-choice').value='map';setStart([3.139,101.6869],'Fixture start');});
 await south.getByRole('button',{name:/Route to/}).click();
 await page.waitForFunction(()=>routes.length>0);
 assert.deepEqual(await page.evaluate(()=>destination),expectedEndpoint,'reopened Recent resolves to the selected Google branch');
 await page.evaluate(()=>{
   for(let i=0;i<9;i++)setDestinationPlace({name:'Stop '+i,display_name:'Address '+i},[3.1+i*.01,101.7]);
 });
 await boot();
 assert.deepEqual(await recent.locator('li button').allTextContents(),[8,7,6,5,4,3,2].map(i=>'Address '+i));
 await page.evaluate(()=>{document.getElementById('start-choice').value='map';setStart([3.139,101.6869],'Fixture start');});
 expectedEndpoint=[3.15,101.7];
 await recent.getByRole('button',{name:'Address 5',exact:true}).click();
 await page.waitForFunction(()=>routes.length>0);
 await boot();
 assert.deepEqual(await recent.locator('li button').allTextContents(),[5,8,7,6,4,3,2].map(i=>'Address '+i),'revisiting a saved coordinate moves it to the top after restart');
 const stationTypes=await page.evaluate(async()=>{
   const host=document.createElement('div');document.body.append(host);
   const controller=new AbortController();let all,selected;
   await JalanGooglePlaceSearch.nearby({center:[3.14,101.69],radius:1400,container:host,signal:controller.signal,
    onError:()=>{},onSelect:s=>{selected=s;},onPlaces:s=>{all=s;}});
   const widgets=[...host.children],types=widgets.map(w=>w.querySelector('gmp-place-nearby-search-request').includedTypes);
   for(const w of widgets){
    w.places=[{id:'SHARED_FORECOURT',location:{lat:()=>3.14,lng:()=>101.69}}];w.dispatchEvent(new Event('gmp-load'));
   }
   const event=new Event('gmp-select');event.place=widgets[1].places[0];widgets[1].dispatchEvent(event);
   const result={types,markers:all.length,combined:all[0].ev&&all[0].petrol,picked:selected.id,credited:widgets.every(w=>!!w.querySelector('gmp-place-attribution'))};
   controller.abort();host.remove();return result;
 });
 assert.deepEqual(stationTypes,{types:[['gas_station'],['electric_vehicle_charging_station']],markers:1,combined:true,picked:'SHARED_FORECOURT',credited:true});
 console.log('PASS exact Google branch names and addresses in Recent, shared entrance, provider failure and reuse');
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS synthetic Google UI Kit fallback: multiple branches and both providers, narrowed and zero-match queries, original single input, lazy SDK, attribution host intact, exact point to TomTom routes, keyboard, stale/clear/collapse, empty/error and submit');
};
// Standalone runner makes the new contract fail early, before the longer
// existing public/passenger/native suites. All provider calls are intercepted.
if(require.main===module){
 const http=require('node:http'),{chromium}=require('playwright'),root=path.resolve(__dirname,'..');
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'};
 (async()=>{
  const server=http.createServer((req,res)=>{
   let file;try{file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
   res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
  });
  let browser;try{
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   browser=await chromium.launch({headless:true});
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await module.exports({context,base:'http://127.0.0.1:'+server.address().port,root});
   await context.close();
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
