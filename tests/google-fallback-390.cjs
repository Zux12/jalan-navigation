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
    widget.places=value==='Nothing here'?[]:[place];
    const shadow=widget.shadowRoot;shadow.replaceChildren();
    const attribution=document.createElement('p');attribution.textContent='Google Maps · simulated provider';shadow.append(attribution);
    for(const selected of widget.places){
     const button=document.createElement('button');button.textContent=selected.displayName;
     button.onclick=()=>{const event=new Event('gmp-select');event.place=selected;widget.dispatchEvent(event);};shadow.append(button);
    }
    widget.dispatchEvent(new Event('gmp-load'));
   },value==='Slow Google'?1000:30);
  }
 }
 customElements.define('gmp-place-search',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'});}});
 customElements.define('gmp-place-text-search-request',Request);
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
 const headers={'access-control-allow-origin':'*'};
 await page.route('https://api.tomtom.com/search/2/search/**',route=>{
  const url=new URL(route.request().url()),query=decodeURIComponent(url.pathname.split('/').pop().replace(/\.json$/,''));ttQueries.push(query);
  for(const field of ['lat','lon','geobias'])assert.equal(url.searchParams.has(field),false);
  const results=query==='KLCC'?[{poi:{name:'KLCC'},address:{freeformAddress:'Kuala Lumpur'},position:{lat:3.15785,lon:101.71165}}]:query.toLowerCase().includes('q bistro')?[{poi:{name:'Restoran Zaynas Bistro'},address:{freeformAddress:'Taman Melati'},position:{lat:3.222168,lon:101.728777}}]:[];
  return route.fulfill({contentType:'application/json',headers,body:JSON.stringify({results})});
 });
 await page.route('https://api.tomtom.com/routing/**',route=>{
  routeCalls++;
  const endpoint=new URL(route.request().url()).pathname.split('/').at(-2).split(':').at(-1).split(',').map(Number);
  assert.deepEqual(endpoint,[3.222,101.729],'route request uses the exact synthetic Google destination (provider formats six decimals)');
  return route.fulfill({contentType:'application/json',headers,body:JSON.stringify({routes:[{summary:{travelTimeInSeconds:420,lengthInMeters:3200,trafficDelayInSeconds:0},legs:[{points:[{latitude:3.139,longitude:101.6869},{latitude:3.222,longitude:101.729}]}],guidance:{instructions:[]}}]})});
 });
 await page.route('https://nominatim.openstreetmap.org/search*',route=>{manual++;return route.abort();});
 const input=page.locator('#destination'),widget=page.locator('gmp-place-search');
 const boot=async()=>{await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});await page.locator('#jalan-search-trigger').click();await input.focus();};
 await boot();await input.fill('KLCC');await page.locator('#results [role=option]').waitFor();
 assert.equal(sdkLoads,0,'matching TomTom suggestions never load Google');
 await input.fill('q bistro taman melati');await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).waitFor();
 assert.equal(sdkLoads,1);assert.equal(await page.locator('#results input').count(),0,'one search bar; no second Google field');
 assert.equal(await widget.getAttribute('attribution-position'),'top');
 googleQueries.push(...await page.evaluate(()=>window.__googleQueries));
 assert.deepEqual(googleQueries[0],{query:'q bistro taman melati',count:5,bounds:{south:0.8,west:99.5,north:7.5,east:119.5}});
 await page.screenshot({path:path.join(root,'test-artifacts/google-fallback-fixture.png')});
 await page.evaluate(()=>{document.getElementById('start-choice').value='map';setStart([3.139,101.6869],'Fixture start');});
 await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).focus();await page.waitForTimeout(250);
 assert.equal(await widget.isVisible(),true,'keyboard focus inside Google results survives input blur');
 await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).press('Enter');await page.waitForFunction(()=>routes.length===1);
 assert.deepEqual(await page.evaluate(()=>destination),[3.222,101.729]);assert.equal(routeCalls,1);assert.equal(manual,0);
 await boot();await input.fill('Slow Google');await widget.waitFor({state:'attached'});
 await input.fill('KLCC');await page.locator('#results [role=option]').waitFor();await page.waitForTimeout(1100);
 assert.equal(await widget.count(),0,'late Google response cannot overwrite newer TomTom results');
 assert.match(await page.locator('#results').innerText(),/KLCC/);
 await input.fill('Slow Google');await widget.waitFor({state:'attached'});await input.fill('');await page.waitForTimeout(1100);
 assert.equal(await page.locator('#results').isVisible(),false,'clear detaches pending Google component');
 await input.fill('Nothing here');await page.getByText('No matching places found. Try a fuller place name.').waitFor();
 await input.fill('Google error');await page.getByText('Google suggestions unavailable. Try again shortly.').waitFor();
 await input.fill('Slow Google');await widget.waitFor({state:'attached'});await page.locator('#jalan-sheet-handle').click();await page.waitForTimeout(1100);
 assert.equal(await page.locator('#results').isVisible(),false,'sheet collapse dismisses fallback');
 await page.locator('#jalan-search-trigger').click();await input.fill('q bistro taman melati');await input.press('Enter');
 await widget.getByRole('button',{name:'Q Bistro Taman Melati'}).waitFor();assert.equal(manual,0,'submit shares the same provider flow when configured');
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>/google/i.test(key))),false);
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS synthetic Google UI Kit fallback: TomTom-first, wrong-business/zero trigger, original single input, lazy SDK, attribution host intact, exact point to TomTom routes, keyboard, stale/clear/collapse, empty/error and submit');
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
