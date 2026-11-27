'use strict';
// No-network 390px integration of two JALAN interfaces. Mock alternative
// routes and geolocation; no actual TomTom key, GPS, Atlas or external requests.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const contentTypes={'.html':'text/html; charset=utf-8','.js':'application/javascript',
 '.css':'text/css; charset=utf-8','.mp3':'audio/mpeg'};
const serve=(req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost')}catch{res.writeHead(400);return res.end()}
 const name=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!name.startsWith(root+path.sep)||!fs.existsSync(name)||!fs.statSync(name).isFile()){
   res.writeHead(404);return res.end('Missing test asset');
 }
 res.writeHead(200,{'content-type':contentTypes[path.extname(name)]||'text/plain',
  'cache-control':'no-store'});
 res.end(path.basename(name)==='jalan-config.js'?"window.JalanPublicConfig=Object.freeze({tomtomBrowserKey:'',appVersion:'4.8.0-test',buildDate:'2026-11-18'});":fs.readFileSync(name));
};
async function main(){
 const server=http.createServer(serve);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({
   viewport:{width:390,height:844},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   window.__testVoices=[];window.__spoken=[];
   window.__trafficLayerStatus=null;
   window.addEventListener('jalan:traffic-layer-status',e=>window.__trafficLayerStatus=e.detail);
   const synth=new EventTarget();synth.getVoices=()=>window.__testVoices;
   synth.cancel=()=>{};synth.speak=u=>window.__spoken.push({text:u.text,voice:u.voice?.name,lang:u.lang});
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
   Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;}}});
   Object.defineProperty(navigator,'geolocation' ,{configurable:true,value:{
    getCurrentPosition(_success,error){error({code:1,message:'Denied in offline fixture'})},
    watchPosition(success,error){window.__offlineGPSWatch=success;error({code:1,message:'Denied in offline fixture'});return 1},
    clearWatch(){}
   }});
  });
  const page=await context.newPage(),errors=[];
  // Journey controls are no longer public menu actions. Keep regression coverage
  // of their retained internal engine hooks; Sound remains a real menu interaction.
  const menuClick=async selector=>{
    if(!await page.locator('#jalan-home-menu-panel').isVisible())await page.locator('#jalan-home-menu').click();
    if(selector==='#passenger-voice')await page.locator(selector).click();
    else await page.locator(selector).evaluate(el=>el.click());
  };
  page.on('pageerror',error=>errors.push(error.message));
  const assertVehicleAnchor=()=>page.waitForFunction(()=>{
    const v=document.getElementById('passenger-vehicle-screen').getBoundingClientRect(),bar=document.getElementById('passenger-journey-sheet').getBoundingClientRect(),position=JalanGPS.getState().vehiclePosition;
    const marker=Object.values(map._layers).find(layer=>layer.options?.icon?.options.className==='jalan-vehicle-marker');
    return marker&&Array.isArray(position)&&marker.getLatLng().distanceTo(L.latLng(position))<.2&&v.top>0&&v.left>0&&v.right<innerWidth&&Math.abs(bar.top-v.bottom-12)<4;
  });
  await page.route('**/*',route=>{
   if(route.request().url().startsWith(base+'/'))return route.continue();
   return route.abort('blockedbyclient');
  });
  const leaflet=path.resolve(root,'node_modules/leaflet/dist');
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',route=>
   route.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(leaflet,'leaflet.js'))}));
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',route=>
   route.fulfill({status:200,contentType:'text/css',
    body:fs.readFileSync(path.join(leaflet,'leaflet.css'))}));
  // Serve the same pinned Leaflet marker PNGs locally; the no-network guard
  // otherwise intentionally blocks the CSS-relative CDN assets.
  await page.route(/^https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/images\/(marker-icon(?:-2x)?|marker-shadow)\.png$/,route=>{
   const name=new URL(route.request().url()).pathname.split('/').pop();
   return route.fulfill({status:200,contentType:'image/png',body:fs.readFileSync(path.join(leaflet,'images',name))});
  });
  await page.goto(base+'/index.html?mode=passenger&ios=2',{waitUntil:'load'});
  await page.locator('#jalan-launch').waitFor({state:'hidden'});
  assert.equal(await page.locator('#map').evaluate(x=>getComputedStyle(x).visibility),'visible','failed detailed-map dependency releases usable fallback');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-mode')),true);
  assert.equal(await page.locator('#info-panel').isVisible(),false);
  assert.equal(await page.locator('#search-form').isVisible(),true);
  assert.equal(await page.locator('#passenger-overview').isVisible(),false);
  const sheetState=()=>page.locator('#jalan-home-sheet').getAttribute('data-state');
  await page.waitForFunction(()=>document.querySelector('#jalan-home-sheet').dataset.state==='b');
  assert.equal(await page.locator('.jalan-sheet-quick').isVisible(),true,'idle startup opens shortcuts');
  const credit=page.locator('#jalan-home-credits a[href*="openstreetmap.org/copyright"]');
  assert.equal(await credit.isVisible(),true,'basic map keeps its data credit visible in B');
  await page.locator('#jalan-sheet-handle').press('ArrowDown');
  assert.equal(await sheetState(),'a','passenger can lower the default sheet to A');
  await page.waitForTimeout(550);
  assert.equal(await sheetState(),'a','the opening move never repeats');
  assert.equal(await credit.isVisible(),true);
  assert.equal(await page.locator('#jalan-home-menu').isVisible(),true);
  assert.equal(await page.locator('#passenger-startup-location-status').count(),0,'startup GPS message is removed');
  assert.equal(await page.locator('#passenger-gps-status').isVisible(),true);
  assert.equal(await page.locator('#passenger-gps-status').getAttribute('data-quality'),'red','denied location is red');
  await page.locator('#passenger-gps-status').click();
  assert.equal(await page.locator('#passenger-gps-status-detail').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#passenger-gps-status-detail').isVisible(),false);
  assert.equal(await page.locator('#jalan-home-report').isVisible(),true);
  assert.equal(await page.locator('#jalan-home-speed-value').textContent(),'—',
    'unverified GPS must never display invented speed');
  await page.locator('#jalan-home-report').click();
  assert.equal(await page.locator('#jalan-home-notice').isVisible(),false,'report placeholder popup is removed');
 await page.locator('#passenger-report-cancel').click();
  await page.locator('#jalan-home-menu').click();
  assert.equal(await page.locator('#jalan-home-menu-panel').isVisible(),true);
  {
    const title=await page.locator('.jalan-home-menu-head').boundingBox();
    const x=title.x+title.width/2,y=title.y+title.height/2;
    const touch=await context.newCDPSession(page);
    const points=span=>[{x:x-span,y,id:1},{x:x+span,y,id:2}];
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(22)});
    for(const span of [32,44,56,68,80]){
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(span)});
    }
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touch.detach();
    assert.equal(await page.evaluate(()=>visualViewport.scale),1,'pinching the menu keeps the app at normal size');
  }
  assert.equal(await page.locator('#jalan-home-notice').isVisible(),false,'old notices do not obscure the menu');
  assert.equal(await page.locator('#passenger-options').count(),0,'old three-dot control is removed');
  const menuLabels=()=>page.locator('#jalan-home-menu-panel').evaluate(el=>[el.querySelector('#passenger-voice').textContent.split(':')[0],el.querySelector('summary').textContent,el.querySelector('#passenger-about').textContent,el.querySelector('#jalan-home-menu-close').textContent]);
  assert.deepEqual(await menuLabels(),['Sound','Navigation','About JALAN','Close']);
  assert.equal(await page.locator('#jalan-home-menu-close').evaluate(x=>x.parentElement.lastElementChild===x),true,'Close is at the bottom');
  assert.equal(await page.locator('#passenger-journey-options').isVisible(),false,'journey controls are hidden before Go');
  assert.equal(await page.locator('#jalan-home-menu-panel #passenger-journey-options').count(),0,'journey controls are removed from the menu');
  await page.evaluate(()=>{
    window.__testVoices=[{voiceURI:'test-voice-us',name:'Test English US',lang:'en-US',localService:true},
      {voiceURI:'test-voice-uk',name:'Test English UK',lang:'en-GB',localService:true}];
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await page.locator('#passenger-voice').click();
  await page.locator('#passenger-voice-choice').selectOption({label:'Test English US · en-US'});
  await page.locator('#passenger-voice-preview').click();
  assert.equal(await page.evaluate(()=>window.__spoken.at(-1).voice),'Test English US');
  assert.match(await page.locator('#gps-voice').textContent(),/Mute/,'sample does not enable navigation speech');
  assert.equal(await page.evaluate(()=>JalanVoice.getState().preference),'','sample does not save pending voice');
  fs.mkdirSync(path.join(root,'test-artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-voice-menu.png')});
  await page.locator('#passenger-sound-ok').click();
  await page.locator('#passenger-about').click();
  assert.match(await page.locator('#passenger-app-version').innerText(),/4.8.0/);
  const about=page.locator('#passenger-about-dialog'),policy=about.getByRole('link',{name:'Privacy & terms'});
  assert.doesNotMatch(await about.innerText(),/Developed by|IgniteInno Ventures/i);
  assert.equal(await about.getByText('Made in Malaysia').isVisible(),true);
  assert.equal(await about.locator('a').count(),1);
  assert.equal(await policy.getAttribute('href'),'https://igniteinnov.com/jalan/policy.html?lang=en');
  assert.equal(await policy.getAttribute('target'),'_blank');
  assert.equal(await page.locator('#jalan-home-menu-panel').isVisible(),false);
  assert.doesNotMatch(await page.locator('#passenger-app-version').innerText(),/test/i);
  const bounds=await about.boundingBox();
  assert.ok(Math.abs(bounds.y+bounds.height-page.viewportSize().height)<=1&&bounds.y>100,'sheet opens at bottom over the map');
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-about.png')});
  await page.locator('#passenger-about-ok').click();
  const reopenAbout=async()=>{
    await about.waitFor({state:'hidden'});
    await page.locator('#jalan-home-menu').click();await page.locator('#passenger-about').click();
  };
  await reopenAbout();
  await page.touchscreen.tap(190,Math.floor(bounds.y/2));
  await about.waitFor({state:'hidden'});
  assert.equal(await page.locator('#jalan-pin-card').isVisible(),false,'backdrop tap does not select a map pin');
  await reopenAbout();
  {
    const touch=await context.newCDPSession(page),grip=await about.locator('.jalan-about-grip').boundingBox();
    const start={x:Math.round(grip.x+grip.width/2),y:Math.round(grip.y+grip.height/2)};
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...start,y:start.y+88}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touch.detach();
  }
  await reopenAbout();
  await page.keyboard.press('Escape');
  await about.waitFor({state:'hidden'});
  assert.equal(await page.locator('#jalan-home-menu').getAttribute('aria-expanded'),'false');
  await page.waitForFunction(()=>document.activeElement.id==='jalan-home-menu');
  await page.locator('#jalan-home-menu').click();
  await page.locator('#passenger-navigation-settings summary').click();
  await page.locator('#passenger-vehicle-choice').click();
  const preTripPicker=page.locator('#passenger-vehicle-picker');
  assert.ok(await preTripPicker.locator('input[value="classic"]').isChecked());
  await preTripPicker.locator('input[value="duck"]').check();
  await preTripPicker.locator('input[value="yellow"]').check();
  await preTripPicker.locator('.jalan-dialog-ok').click();
  // The search banner must support progressive A→B (not jump to C) on
  // an actual pointer swipe, while B exposes the Recent destinations.
  const swipeSearch=async dy=>{
    const b=await page.locator('#jalan-search-trigger').boundingBox();
    const x=b.x+b.width/2,y=b.y+b.height/2;
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x,y+dy,{steps:8});await page.mouse.up();
  };
  await swipeSearch(-88);
  assert.equal(await sheetState(),'b','swiping up on search banner expands A to B');
  assert.equal(await page.locator('.jalan-sheet-recent').isVisible(),true,
    'B displays Recent beneath Home/Work/New, even for a new session');
  await swipeSearch(88);
  assert.equal(await sheetState(),'a','swiping down on search banner collapses B to A');
  await page.locator('#jalan-sheet-handle').click();
  assert.equal(await sheetState(),'b','handle expands to B quick shortcuts');
  assert.equal(await page.locator('.jalan-sheet-quick button').count(),3);
  await page.locator('#jalan-sheet-handle').click();
  assert.equal(await sheetState(),'c','handle expands to C recent list');
  assert.match(await page.locator('#jalan-recent-list').textContent(),/last 7 selected destinations/);
  await page.locator('#jalan-sheet-handle').click();
  assert.equal(await sheetState(),'b');
  // Drag down from B to A. Handle taps intentionally alternate B/C,
  // whereas downward gestures collapse to A.
  const handleBox=await page.locator('#jalan-sheet-handle').boundingBox();
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+10);
  await page.mouse.down();
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+115,{steps:8});
  await page.mouse.up();
  assert.equal(await sheetState(),'a','downward drag collapses B to A');
  await page.locator('#jalan-search-trigger').tap();
  assert.equal(await sheetState(),'c','search tap opens C directly from A');
  assert.equal(await page.locator('#destination').evaluate(x=>x===document.activeElement),true);
  await page.evaluate(()=>document.activeElement?.blur());
  await page.locator('#jalan-sheet-handle').click();
  assert.equal(await sheetState(),'b');
  await page.locator('#jalan-search-trigger').tap();
  assert.equal(await sheetState(),'c','search tap opens C directly from B');
  await page.evaluate(()=>document.activeElement?.blur());
  // Real browser touch input (not dispatched PointerEvents) must work from
  // sheet descendants without clicking them, and preserve native C scrolling.
  let sheetTouch=await context.newCDPSession(page);
  const swipeInside=async(selector,dy,{dx=0,offsetY=null,cancel=false}={})=>{
    const b=await page.locator(selector).boundingBox();
    assert.ok(b,`visible swipe target ${selector}`);
    const x=b.x+b.width/2,y=b.y+(offsetY??Math.min(b.height/2,60));
    await sheetTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=8;i++){
      await sheetTouch.send('Input.dispatchTouchEvent',{type:'touchMove',
        touchPoints:[{x:x+dx*i/8,y:y+dy*i/8,id:1}]});
      await page.waitForTimeout(16);
    }
    await sheetTouch.send('Input.dispatchTouchEvent',{
      type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
    await page.waitForTimeout(80);
  };
  await page.locator('#jalan-sheet-handle').click(); // C -> B
  await swipeInside('.jalan-sheet-quick [data-shortcut="new"]',-90);
  assert.equal(await sheetState(),'c','touching inside quick controls swipes B to C');
  assert.equal(await page.locator('#destination').evaluate(x=>x===document.activeElement),false,
    'swiping over New must not also tap it or open the keyboard');
  await swipeInside('.jalan-sheet-recent h2',80);
  assert.equal(await sheetState(),'b','downward touch inside C collapses to B');
  await swipeInside('.jalan-sheet-recent h2',70);
  assert.equal(await sheetState(),'a','downward touch inside B collapses to A');
  await swipeInside('#jalan-home-sheet',-80,{offsetY:115});
  assert.equal(await sheetState(),'b','touch inside collapsed sheet expands A to B');
  await swipeInside('.jalan-sheet-quick [data-shortcut="home"]',0,{dx:80});
  assert.equal(await sheetState(),'b','horizontal gestures do not change stage');
  await swipeInside('.jalan-sheet-quick [data-shortcut="work"]',-70,{cancel:true});
  assert.equal(await sheetState(),'b','cancelled touch does not change stage');
  await swipeInside('.jalan-sheet-recent h2',-80);
  assert.equal(await sheetState(),'c','upward touch inside Recent expands B to C');
  await page.evaluate(()=>{
    const list=document.getElementById('jalan-recent-list');
    window.__recentBeforeSwipeTest=list.innerHTML;window.__recentSwipeClicks=0;
    list.replaceChildren();
    for(let i=0;i<30;i++){
      const li=document.createElement('li'),button=document.createElement('button');
      button.textContent='Synthetic recent destination '+i;
      button.addEventListener('click',()=>window.__recentSwipeClicks++);
      li.append(button);list.append(li);
    }
  });
  await swipeInside('.jalan-sheet-recent',-120,{offsetY:170});
  assert.equal(await sheetState(),'c','expanded Recent scrolls without collapsing');
  await page.waitForFunction(()=>document.querySelector('.jalan-sheet-recent').scrollTop>20);
  await page.waitForTimeout(250);
  await page.locator('.jalan-sheet-recent').evaluate(x=>x.scrollTop=180);
  await swipeInside('.jalan-sheet-recent',70,{offsetY:80});
  assert.equal(await sheetState(),'c','downward swipe within a scrolled list scrolls it first');
  await page.waitForTimeout(250);
  await page.locator('.jalan-sheet-recent').evaluate(x=>x.scrollTop=0);
  await swipeInside('#jalan-recent-list li:first-child button',80);
  assert.equal(await sheetState(),'b','downward swipe at list top collapses C to B');
  assert.equal(await page.evaluate(()=>window.__recentSwipeClicks),0,
    'swiping a recent row never selects a destination');
  await page.evaluate(()=>{
    document.getElementById('jalan-recent-list').innerHTML=window.__recentBeforeSwipeTest;
  });
  await page.locator('#jalan-search-trigger').tap();
  assert.equal(await sheetState(),'c','ordinary search tap still opens C after swiping');
  await page.evaluate(()=>document.activeElement?.blur());
  // Keyboard activation remains available alongside swiping.
  await page.locator('#jalan-sheet-handle').focus();await page.keyboard.press('Enter');
  assert.equal(await sheetState(),'b');
  await page.keyboard.press('Enter');assert.equal(await sheetState(),'c');
  console.log('PASS sheet touch gestures: A/B/C content swipes, native list scrolling, top collapse, no accidental selection, keyboard and search taps');
  await page.evaluate(()=>{
   // Deliberately out-of-order synthetic provider returns, NOT live roads.
   const points=[[101.6869,3.139],[101.6953,3.1478]];
   setStart([3.139,101.6869],'Fixture starting point');
   updateLocation([3.139,101.6869]);
   destination=[3.1478,101.6953];
   const route=(duration,distance)=>({provider:'osrm',duration,distance,
    geometry:{type:'LineString',coordinates:points},
    legs:[{steps:[{name:'Test segment',distance,routeOffsetInMeters:125,maneuver:{type:'turn',modifier:'left'}}]}]});
   routes=[route(840,4200),route(600,3200),route(720,3400)];
   selectedRoute=0;renderRoutes();
  });
  assert.equal(await page.evaluate(()=>selectedRoute),0,'shortest actual ETA selected');
  assert.equal(await page.evaluate(()=>routes[0].duration),600,'provider routes sorted by ETA');
  assert.equal(await page.locator('#passenger-overview').isVisible(),true);
  assert.equal(await page.locator('#passenger-safety-note').isVisible(),true,'passenger-only notice is visible before Go');
  assert.match(await page.locator('#passenger-safety-note').innerText(),/Passenger-only.*2\.5D.*driver must not operate/i,
    'route card identifies the experimental perspective and prohibits driver interaction');
  assert.equal(await page.locator('#passenger-route-list button').count(),3);
  assert.equal(await page.locator('#passenger-settings').count(),0,'route settings are only in the shared menu');
  assert.equal(await page.locator('#passenger-route-provider').count(),0,'provider subtitle is removed');
  assert.equal(await page.locator('#passenger-overview small').count(),7,'three routes each show distance and toll information, plus one shared passenger safety notice');
  assert.deepEqual(await page.locator('#passenger-route-list small:last-child').allTextContents(),Array(3).fill('Toll info unavailable'),'fallback routes leave their toll status unknown');
  assert.equal(await page.locator('#jalan-route-traffic-legend').count(),0,'traffic legend no longer covers the map');
  // A shorter Safari-like visible viewport must never clip the Go button.
  // A long list should scroll inside the card instead of pushing Go below it.
  await page.setViewportSize({width:390,height:560});
  const layout=await page.evaluate(()=>{
    const panel=document.getElementById('passenger-overview');
    const list=document.getElementById('passenger-route-list');
    const button=document.getElementById('passenger-go');
    for(let i=0;i<10;i++){
      const copy=list.firstElementChild.cloneNode(true);
      copy.removeAttribute('aria-pressed');
      list.appendChild(copy);
    }
    const p=panel.getBoundingClientRect(),b=button.getBoundingClientRect();
    return {viewport:window.innerHeight,panelTop:p.top,panelBottom:p.bottom,
      goBottom:b.bottom,goTop:b.top,listScrollHeight:list.scrollHeight,
      listClientHeight:list.clientHeight};
  });
  assert.ok(layout.panelTop>=0,'route overview must fit visible mobile viewport');
  assert.ok(layout.goBottom<=layout.viewport-1,
    'Go action must remain visible above mobile Safari browser chrome');
  assert.ok(layout.listScrollHeight>layout.listClientHeight,
    'only alternative cards should scroll; Go stays pinned');
  await swipeInside('#passenger-route-list',-85,{offsetY:95});
  await page.waitForFunction(()=>document.getElementById('passenger-route-list').scrollTop>20);
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'false',
    'scrolling alternatives upward does not collapse the panel');
  await page.waitForTimeout(250);
  await page.locator('#passenger-route-list').evaluate(x=>x.scrollTop=180);
  await swipeInside('#passenger-route-list',60,{offsetY:60});
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'false',
    'a scrolled route list scrolls down before the panel can collapse');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    const list=document.getElementById('passenger-route-list');
    list.scrollTop=0;
    while(list.children.length>3)list.lastElementChild.remove();
  });
  assert.match(await page.locator('#passenger-route-list').innerText(),/\+2 min/);
  assert.match(await page.locator('#passenger-route-list').innerText(),/\+4 min/);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('route-perspective')),false,
   'Route review must remain 2D until Go');
  await page.locator('#passenger-route-list button').nth(1).click();
  assert.equal(await page.evaluate(()=>selectedRoute),1,'alternative selectable');
  await page.locator('#passenger-route-list button').first().click();
  await page.waitForTimeout(100);
  await page.evaluate(()=>{
    window.__routeChoiceBeforeDrag={routes,chosen:routes[selectedRoute],destination,index:selectedRoute,
      lat:map.getCenter().lat,lng:map.getCenter().lng,zoom:map.getZoom()};
  });
  const assertChoicePreserved=async()=>assert.equal(await page.evaluate(()=>{
    const before=window.__routeChoiceBeforeDrag,center=map.getCenter();
    return routes===before.routes&&routes[selectedRoute]===before.chosen&&destination===before.destination&&
      selectedRoute===before.index&&map.getZoom()===before.zoom&&center.lat===before.lat&&center.lng===before.lng;
  }),true,'panel gestures preserve destination, chosen route and map camera');
  await swipeInside('#passenger-route-list button:nth-child(2)',90);
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'true');
  assert.equal(await page.locator('#passenger-route-handle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#passenger-go').isVisible(),false,'collapsed controls cannot accidentally start GPS');
  assert.equal(await page.locator('#passenger-route-content').evaluate(x=>x.inert),true);
  const peek=await page.locator('#passenger-overview').boundingBox();
  assert.ok(peek.y>740&&peek.y<810,'collapsed panel leaves only a small visible bottom strip');
  const planningControls=await page.evaluate(()=>{
    const panel=document.getElementById('passenger-overview').getBoundingClientRect();
    return ['jalan-home-speed','jalan-home-report'].every(id=>{
      const box=document.getElementById(id).getBoundingClientRect();
      return box.top>100&&box.bottom<panel.top;
    });
  });
  assert.equal(planningControls,true,'map controls stay on screen above the collapsed route strip');
  await assertChoicePreserved();
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-routes-collapsed.png')});
  await swipeInside('#passenger-route-handle',-100,{cancel:true});
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'true','cancelled drag keeps the previous state');
  await swipeInside('#passenger-route-handle',-100);
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'false');
  assert.equal(await page.locator('#passenger-go').isVisible(),true);
  await assertChoicePreserved();
  // A mouse drag follows the pointer before snapping, and cannot become a handle tap.
  const grip=await page.locator('#passenger-route-handle').boundingBox();
  const panelBefore=await page.locator('#passenger-overview').boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2+60,{steps:8});
  const panelDuring=await page.locator('#passenger-overview').boundingBox();
  assert.ok(panelDuring.y>panelBefore.y+45,'route panel follows the drag in real time');
  await page.mouse.up();
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'true');
  await assertChoicePreserved();
  // A map-selected alternative stays selected while the panel remains tucked away.
  await page.evaluate(()=>selectRoute(1));
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'true');
  assert.equal(await page.evaluate(()=>selectedRoute),1);
  await page.locator('#passenger-route-handle').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'false','keyboard opens the panel');
  await page.locator('#passenger-route-list button').first().click();
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-routes-expanded.png')});
  console.log('PASS route choice sheet: clean panel, live pointer drag, touch collapse/expand, list scrolling, cancellation, keyboard and selected route retained');
  assert.deepEqual(await page.evaluate(()=>({
    startVisible:!!startMarker&&pointLayer.hasLayer(startMarker),
    locationVisible:!!locationMarker&&pointLayer.hasLayer(locationMarker)
  })),{startVisible:true,locationVisible:true},'route-planning indicators visible before Go');
  await page.evaluate(()=>{
    const reports=[
      {type:'flood',lat:3.144,lng:101.6917,time:Date.now()},
      {type:'rain',lat:3.144,lng:101.6937,time:Date.now()},
      {type:'hazard',lat:4.0,lng:102.0,time:Date.now()}
    ];
    localStorage.setItem('jalan-demo-reports-v1',JSON.stringify(reports));
    reports.forEach(showReport);
  });
  await page.locator('#passenger-go').click();
  assert.equal(await page.locator('#jalan-traffic-sharing-notice').count(),0,'Go starts guidance without the speed-sharing note');
  assert.equal(await page.evaluate(()=>map.hasLayer(reportLayer)),false,
    'Go hides the unrestricted area-wide demo marker layer');
  assert.equal(await page.locator('.passenger-demo-report-marker').count(),1,
    'only the demo pin close to the selected route appears during navigation');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),true);
  assert.deepEqual(await page.evaluate(()=>({
    startVisible:!!startMarker&&pointLayer.hasLayer(startMarker),
    locationVisible:!!locationMarker&&pointLayer.hasLayer(locationMarker)
  })),{startVisible:false,locationVisible:false},
  'start and legacy location circles must not overlap the passenger vehicle marker');
  assert.equal(await page.locator('#passenger-navigation').isVisible(),true);
  assert.equal(await page.locator('.passenger-stats #passenger-speed').count(),0,
    'speed no longer occupies the bottom metrics row');
  assert.equal(await page.locator('.passenger-stats #passenger-search').isVisible(),true);
  assert.equal(await page.locator('#passenger-speed-floating').isVisible(),true);
  assert.equal(await page.locator('#passenger-speed').textContent(),'—',
    'moving speed must not invent a value without a matched GPS fix');
  for(const height of [844,560]){
    await page.setViewportSize({width:390,height});
    const positions=await page.evaluate(()=>{
      const a=document.getElementById('passenger-speed-floating').getBoundingClientRect();
      const b=document.getElementById('passenger-recenter-floating').getBoundingClientRect();
      return {left:a.left,right:b.right,ay:a.top+a.height/2,by:b.top+b.height/2,
        separated:a.right<b.left,aboveBar:a.bottom<document.querySelector('.passenger-bottom').getBoundingClientRect().top};
    });
    assert.ok(positions.left>=0&&positions.right<=390&&positions.separated);
    assert.ok(Math.abs(positions.ay-positions.by)<2,'speed sits opposite Recenter at the same height');
    assert.ok(positions.aboveBar,'speed stays clear of bottom metrics');
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    document.getElementById('destination').value='Existing selected destination';
    if(!destinationMarker)destinationMarker=L.marker(destination).addTo(pointLayer);
    window.__beforeRouteSearch={routes,selected:routes[selectedRoute],index:selectedRoute,
      destination,destinationMarker,gpsRoute:window.JalanGPS.getState().route,
      center:map.getCenter(),zoom:map.getZoom()};
    window.__routeSearchLifecycle=[];
    for(const name of ['jalan:journey-start','jalan:journey-stop','jalan:route-cleared'])
      window.addEventListener(name,()=>window.__routeSearchLifecycle.push(name));
  });
  const assertJourneyPreserved=async()=>{
    assert.deepEqual(await page.evaluate(()=>{
      const before=window.__beforeRouteSearch,state=window.JalanGPS.getState();
      return {routes:routes===before.routes,selected:routes[selectedRoute]===before.selected,
        index:selectedRoute===before.index,destination:destination===before.destination,
        marker:destinationMarker===before.destinationMarker,gpsRoute:state.route===before.gpsRoute,
        active:state.active,guiding:document.body.classList.contains('passenger-guiding'),
        lifecycle:window.__routeSearchLifecycle};
    }),{routes:true,selected:true,index:true,destination:true,marker:true,gpsRoute:true,
      active:true,guiding:true,lifecycle:[]});
  };
  await page.locator('#passenger-search').tap();
  assert.equal(await sheetState(),'c','navigation magnifier opens full Stage C');
  assert.equal(await page.locator('#jalan-home-sheet').isVisible(),true);
  assert.equal(await page.locator('#destination').isVisible(),true);
  assert.equal(await page.locator('#destination').inputValue(),'','navigation search starts with a blank query');
  assert.equal(await page.locator('#destination').evaluate(x=>x===document.activeElement),true);
  assert.equal(await page.locator('#passenger-navigation').evaluate(x=>x.inert),true);
  await assertJourneyPreserved();
  // Swipe while the empty search input still has focus; dismissal must blur it.
  await swipeInside('.jalan-sheet-recent h2',90);
  assert.equal(await page.locator('#jalan-home-sheet').isVisible(),false,
    'one downward swipe with no query returns directly to the existing map');
  assert.equal(await page.locator('#passenger-navigation').isVisible(),true);
  assert.equal(await page.locator('#passenger-navigation').evaluate(x=>x.inert),false);
  assert.equal(await page.locator('#destination').inputValue(),'Existing selected destination');
  assert.equal(await page.locator('#passenger-search').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#passenger-search').evaluate(x=>x===document.activeElement),true);
  await assertJourneyPreserved();
  // Cancelling an unsubmitted query is also safe; Escape is keyboard-accessible.
  await page.locator('#passenger-search').click();
  await page.locator('#destination').fill('Unsubmitted new destination');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#jalan-home-sheet').isVisible(),false);
  await assertJourneyPreserved();
  // Verify the expanded search form works while navigation remains active.
  await page.route('https://nominatim.openstreetmap.org/search?**',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify([
      {display_name:'Synthetic replacement destination',lat:'3.15',lon:'101.70'}])}));
  await page.locator('#passenger-search').click();
  await page.locator('#destination').fill('Synthetic replacement');
  await page.locator('#search-form button[type="submit"]').click();
  await page.waitForSelector('#results:not(.hidden) button');
  assert.equal(await page.locator('#results button').isVisible(),true,
    'search results are usable in the reopened C panel');
  await assertJourneyPreserved();
  await page.keyboard.press('Escape');
  await assertJourneyPreserved();
  await page.unroute('https://nominatim.openstreetmap.org/search?**');
  await sheetTouch.detach();
  console.log('PASS navigation search: speed opposite Recenter, magnifier opens C, blank swipe and Escape preserve active route/destination/GPS, results visible');
  const activeStyles=await page.evaluate(()=>routeLayer.getLayers().map(x=>x.options.opacity));
  assert.equal(activeStyles.filter(x=>x>0.9).length,1,
    'Go hides unselected alternatives and highlights the chosen road');
  assert.equal(await page.locator('#gps-hud').isVisible(),false,'engineering HUD hidden in clean view');
  assert.equal(await page.locator('#jalan-home-menu-panel').isVisible(),false,
    'Go keeps the menu collapsed, showing minutes, km and search');
  assert.equal(await page.locator('.passenger-turn').isVisible(),true,
    'top next-turn guidance must be visible even with compact metrics');
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),false,
    'full direction list starts closed');
  assert.equal(await page.locator('.passenger-stats').isVisible(),true);
  assert.equal(await page.locator('#passenger-traffic-summary').count(),0,'traffic sentence is removed from the bottom');
  assert.equal(await page.evaluate(()=>{
    const badge=document.getElementById('passenger-gps-status').getBoundingClientRect();
    const copy=document.querySelector('.passenger-turn-copy').getBoundingClientRect();
    const chevron=document.querySelector('.passenger-turn-chevron').getBoundingClientRect();
    return badge.right<=innerWidth-10&&badge.top>=10&&copy.right<badge.left&&chevron.top>=badge.bottom;
  }),true,'GPS badge has its own corner without covering turn text or the expand control');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('passenger-distance')).fontSize===
    getComputedStyle(document.getElementById('passenger-eta')).fontSize),true,'distance and time use the same font size');
  assert.equal(await page.locator('#passenger-voice').isVisible(),false,
    'advanced controls remain hidden until opening options');
  await page.locator('#jalan-home-menu').click();
  assert.equal(await page.locator('#passenger-voice').isVisible(),true,
    'advanced controls remain accessible when passenger requests them');
  assert.deepEqual(await menuLabels(),['Sound','Navigation','About JALAN','Close'],'same menu after Go');
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-guidance-menu.png')});
  await page.locator('#passenger-voice').click();
  assert.equal(await page.locator('#passenger-sound-dialog').isVisible(),true);
  assert.equal(await page.evaluate(()=>JalanGPS.getState().active),true,'Sound preserves the journey');
  await page.locator('#passenger-sound-ok').click();
   assert.equal(await page.locator('#passenger-traffic-toggle').getAttribute('aria-pressed'),'false',
     'OSRM / no-key Go cannot start TomTom traffic checks');
   await page.locator('#passenger-navigation-settings>summary').click();
   await page.locator('#passenger-traffic-details summary').evaluate(el=>el.click());
   await menuClick('#passenger-traffic-toggle');
   assert.equal(await page.locator('#passenger-traffic-toggle').getAttribute('aria-pressed'),'false',
     'no-key / OSRM route cannot enable automatic TomTom checks');
   assert.match(await page.locator('#passenger-traffic-status').innerText(),/active TomTom route/);
   await menuClick('#passenger-traffic-check');
   assert.match(await page.locator('#passenger-traffic-status').innerText(),/road-matched GPS/,
     'manual traffic check must fail closed without road-matched GPS');
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:traffic-status',{
     detail:{message:'Traffic check failed: TomTom HTTP 503',enabled:false}
   })));
   assert.match(await page.locator('#passenger-traffic-status').innerText(),/HTTP 503/,
     'provider failure is visible in passenger view');
   assert.equal(await page.locator('#passenger-traffic-offer').isVisible(),false,
     'a provider failure cannot invent a faster route');
   assert.equal(await page.locator('#proactive-toggle').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#passenger-auto-reroute').getAttribute('aria-pressed'),'true',
    'explicit Go enables sustained off-route recovery for this journey');
  assert.match(await page.locator('#passenger-voice').innerText(),/Mute/);
  await menuClick('#passenger-voice');
  await page.locator('input[name=passenger-sound-mode][value=full]').check();
  await page.locator('#passenger-sound-ok').click();
  assert.match(await page.locator('#gps-voice').innerText(),/Full guidance/);
  await menuClick('#passenger-voice');
  await page.locator('input[name=passenger-sound-mode][value=mute]').check();
  await page.locator('#passenger-sound-ok').click();
  assert.match(await page.locator('#passenger-voice').innerText(),/Mute/);
  await menuClick('#passenger-auto-reroute');
  assert.equal(await page.locator('#passenger-auto-reroute').getAttribute('aria-pressed'),'false');
  await menuClick('#passenger-auto-reroute');
  assert.equal(await page.locator('#passenger-auto-reroute').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#gps-auto').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#passenger-reroute-status').innerText(),/enabled/);
  await menuClick('#passenger-auto-reroute');
  assert.equal(await page.locator('#passenger-auto-reroute').getAttribute('aria-pressed'),'false');
  await menuClick('#passenger-reroute-now');
  assert.match(await page.locator('#passenger-reroute-status').innerText(),/not ready/i,
    'manual recalculate shows unavailable status rather than a fake new route');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:reroute-status',{
    detail:{state:'checking',message:'Checking an alternative route…'}
  })));
  assert.match(await page.locator('#passenger-reroute-status').innerText(),/Checking an alternative/);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:reroute-status',{
    detail:{state:'error',message:'Recalculation failed. Check connection and route.'}
  })));
  assert.equal(await page.locator('#passenger-reroute-status').getAttribute('data-state'),'error');
  assert.equal(await page.locator('.passenger-car-arrow').count(),0,
    'fixed fake vehicle triangle must be removed');
  await page.locator('#jalan-home-menu-close').click();
  const zoomBefore=await page.evaluate(()=>map.getZoom());
  // Unreliable GPS must NEVER silently zoom into an asserted matched road.
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now(),coords:{
      latitude:3.139,longitude:101.6869,accuracy:180,speed:2,heading:0}});
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>map.getZoom()),zoomBefore,
    'uncertain GPS cannot drive passenger camera');
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),0,
    'poor GPS must not display a claimed vehicle position');
  assert.equal(await page.locator('#passenger-speed').textContent(),'—');
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+1000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:2,heading:0}});
  });
  await page.waitForFunction(()=>map.getZoom()>=17,null,{timeout:4000});
  // The old overview animation used to snap the camera back to 15 shortly
  // after the matched fix. Hold the contract across that transition window.
  await page.waitForTimeout(1200);
  assert.ok(await page.evaluate(()=>map.getZoom()>=17),
    'passenger follow zoom must persist after delayed route overview settling');
  assert.equal(await page.locator('#passenger-speed').textContent(),'7','floating speed still uses the matched GPS fix');
  await page.waitForFunction(()=>{const car=document.getElementById('passenger-vehicle-screen').getBoundingClientRect(),bar=document.getElementById('passenger-journey-sheet').getBoundingClientRect();return Math.abs(bar.top-car.bottom-12)<4;});
  assert.ok(await page.locator('#passenger-journey-sheet').evaluate(el=>Math.abs(innerHeight-el.getBoundingClientRect().bottom)<1),'journey banner reaches the phone bottom');
  assert.equal(await page.locator('#passenger-journey-options').isVisible(),false,'journey controls stay hidden during navigation');
  assert.equal(await page.locator('#passenger-gps-status').getAttribute('data-quality'),'green');
  assert.match(await page.locator('#passenger-next').textContent(),/Arrival approx/);
  assert.doesNotMatch(await page.locator('#passenger-next').textContent(),/GPS matched to selected route/);
  assert.equal(await page.locator('#passenger-speed-floating .passenger-speed-reading').getAttribute('aria-label'),'7 kilometres per hour');
  assert.equal(await page.evaluate(()=>document.getElementById('passenger-fix').textContent.includes('GPS matched')),true);
  // Actual proactive engine denies missing key and never offers a route
  // after a blocked TomTom request, even with matched synthetic GPS.
  await page.evaluate(()=>{
    window.__originalTrafficPrimary=document.getElementById('tt-primary').checked;
    routes[selectedRoute].provider='tomtom';
    document.getElementById('tt-primary').checked=true;
    document.getElementById('tt-key').value='';
  });
  await menuClick('#passenger-traffic-check');
  assert.match(await page.locator('#passenger-traffic-status').innerText(),/Enter TomTom key/,
    'matched GPS does not bypass absent provider credentials');
  await page.evaluate(()=>{document.getElementById('tt-key').value='TEST_RESTRICTED_KEY_1234';});
  await menuClick('#passenger-traffic-check');
  await page.waitForFunction(()=>document.getElementById('passenger-traffic-status').textContent.includes('Traffic check failed'),null,{timeout:4000});
  assert.equal(await page.locator('#passenger-traffic-offer').isVisible(),false,
    'failed network request cannot fabricate an alternative');
  await page.evaluate(()=>{
    routes[selectedRoute].provider='osrm';
    document.getElementById('tt-primary').checked=window.__originalTrafficPrimary;
    document.getElementById('tt-key').value='';
  });
  await assertVehicleAnchor();
  assert.match(await page.locator('#passenger-instruction').innerText(),/left/i,
    'the banner shows the next maneuver provided by the selected route');
  // The top banner remains fixed and opening it defaults to available Reports.
  assert.equal(await page.locator('#passenger-turn-toggle').evaluate(x=>getComputedStyle(x).position),
    'fixed','next-turn banner remains locked while the map moves');
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),true);
  assert.equal(await page.locator('#passenger-tab-reports').getAttribute('aria-selected'),'true',
    'Reports tab selected by default');
  assert.equal(await page.locator('#passenger-report-list li').count(),1,
    'only demo reports projected near the selected road appear');
  assert.match(await page.locator('#passenger-report-list').innerText(),
    /unverified demo report/i);
  assert.equal(await page.locator('#passenger-turn-list input[type=checkbox],#passenger-turn-close').count(),0);
  assert.equal(await page.locator('#passenger-report-note').isVisible(),false);
  // A TomTom incident must belong to the same selected route and its
  // original provider fetch. Never invent an incident if traffic unavailable.
  await page.evaluate(()=>{
    const route=window.JalanGPS.getState().route;
    const projected=window.JalanTomTom.projectReportPoint(
      [101.6925,3.145],route.geometry.coordinates);
    window.dispatchEvent(new CustomEvent('jalan:incidents-updated',{detail:{
      route,checkedAt:Date.now(),
      incidents:[{lat:3.145,lng:101.6925,description:'Selected route traffic section',
        category:'🚧',roadName:'Fixture road',routeAlong:projected.along,routeTotal:projected.total},
        {lat:3.145,lng:101.694,description:'Unlinked nearby incident',category:'🚧'}]
    }}));
  });
  assert.equal(await page.locator('#passenger-report-list li').count(),2,
    'route incident appears beside the demo, with the nearby-road incident excluded');
  const reportCenter=()=>page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  const assertReportCenter=async(lat,lng)=>{
    const center=await reportCenter();
    assert.ok(Math.abs(center[0]-lat)<0.00002&&Math.abs(center[1]-lng)<0.00002,
      'report camera centers on the actual reported coordinates');
    assert.equal(await page.evaluate(()=>map.getZoom()),18,'report opens at street detail');
  };
  await page.evaluate(()=>{window.__routeBeforeReport=window.JalanGPS.getState().route;});
  await page.locator('#passenger-report-list button').first().tap();
  await assertReportCenter(3.144,101.6917);
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),false,
    'tapping a report dismisses the panel so the location is visible');
  assert.equal(await page.locator('#passenger-turn-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),1);
  assert.match(await page.locator('.jalan-report-focus-label').innerText(),/unverified demo report/);
  assert.equal(await page.locator('#passenger-recenter-floating').evaluate(x=>x===document.activeElement),true,
    'focus moves out of the hidden report panel to Recenter');
  await page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now()+1000,coords:{
    latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}}));
  await page.waitForTimeout(100);
  await assertReportCenter(3.144,101.6917);
  assert.equal(await page.evaluate(()=>window.JalanGPS.getState().route===window.__routeBeforeReport),true,
    'viewing a report never changes the selected route');
  await page.locator('#passenger-recenter-floating').tap();
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),0,
    'Recenter clears the report highlight');
  await assertVehicleAnchor();
  await page.locator('#passenger-turn-toggle').click();
  await page.locator('#passenger-tab-directions').click();
  assert.equal(await page.locator('#passenger-tab-directions').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#passenger-directions-note').count(),0);
  assert.equal(await page.locator('#passenger-maneuver-list li').count(),2,
    'Directions tab includes the actual next maneuver and destination');
  assert.match(await page.locator('#passenger-maneuver-list').innerText(),/Test segment|left|destination/i);
  await page.locator('#passenger-tab-reports').click();
  assert.equal(await page.locator('#passenger-report-list li').count(),2);
  const reportPanel=await page.locator('#passenger-turn-list').boundingBox();
  await page.touchscreen.tap(70,Math.ceil(reportPanel.y+reportPanel.height)+20);
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),false);
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('#passenger-tab-reports').getAttribute('aria-selected'),'true',
    'reopened turn banner defaults back to Reports');
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),1,
    'verified GPS must create one georeferenced marker');
  assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),true,
    'upright vehicle HUD is visible only on matched GPS');
  await require('./passenger-vehicle-icons-390.cjs')(page,'#passenger-vehicle-screen .jalan-vehicle-shape');
  const vehicleFace=page.locator('#passenger-vehicle-screen .vehicle-left');
  assert.match(await vehicleFace.getAttribute('d'),/^M.*Z$/);
  const liveFill=await vehicleFace.evaluate(x=>getComputedStyle(x).fill);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.jalan-vehicle-marker')).opacity),'0',
    'rotating map must not draw a second triangle');
  assert.equal(await page.evaluate(()=>!!locationMarker&&pointLayer.hasLayer(locationMarker)),false,
    'ongoing GPS fixes must not recreate legacy location dot in passenger mode');
  // A cached 20s-old fix must freeze the last measured vehicle,
  // not falsely follow the route or delete the triangle.
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()-20000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}});
  });
  await page.waitForFunction(()=>
    document.querySelector('.jalan-vehicle-marker')?.classList.contains('jalan-vehicle-uncertain'),
    null,{timeout:1500});
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),1,
    'stale Safari GPS retains one frozen georeferenced triangle');
  assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),true,
    'upright last-known triangle stays visible');
  assert.equal(await vehicleFace.evaluate(x=>getComputedStyle(x).fill),liveFill,'stale GPS preserves the classic triangle colour');
  await page.waitForFunction(()=>document.getElementById('passenger-fix').textContent.includes('last known position'),null,{timeout:1500});
  assert.match(await page.locator('#passenger-fix').innerText(),/last known position/i);
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+2000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}});
  });
  await page.waitForFunction(()=>!!document.querySelector('.jalan-vehicle-marker')&&
    !document.querySelector('.jalan-vehicle-marker').classList.contains('jalan-vehicle-uncertain')&&
    !document.getElementById('passenger-vehicle-screen').classList.contains('hidden'),
    null,{timeout:1500});
  assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),true,
    'trusted fresh GPS update restores vehicle indicator after projection frame');
  // Verified live TomTom query is informational: never replace ETA or road
  // geometry just because the provider found a faster alternative.
  const quote=await page.evaluate(()=>{
    const active=window.JalanGPS.getState().route;
    const before=document.getElementById('passenger-eta').textContent;
    const geometry=routes[selectedRoute].geometry;
    const event=()=>window.dispatchEvent(new CustomEvent('jalan:traffic-estimate',{detail:{
      provider:'tomtom',seconds:360,currentSelectedSeconds:600,
      checkedAt:Date.now(),route:active
    }}));
    event();
    const rejected=document.getElementById('passenger-live-eta').textContent;
    // Synthetic provider authorization, not an actual key or network request.
    active.provider='tomtom';
    document.getElementById('tt-primary').checked=true;
    document.getElementById('tt-key').value='TEST_RESTRICTED_KEY_1234';
    event();
    return {before,after:document.getElementById('passenger-eta').textContent,
      rejected,text:document.getElementById('passenger-live-eta').textContent,
      sameRoute:routes[selectedRoute].geometry===geometry};
  });
  assert.doesNotMatch(quote.rejected,/6 min/,
    'OSRM routing without authorized TomTom key cannot claim refreshed traffic');
  assert.match(quote.text,/6 min/);
  assert.equal(quote.after,quote.before,'traffic alternative must not silently change selected-route ETA');
  assert.equal(quote.sameRoute,true,'traffic alternative must not replace selected route');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:traffic-estimate',{
    detail:{provider:'tomtom',seconds:2,checkedAt:Date.now()-700000,
      route:window.JalanGPS.getState().route}
  })));
  assert.match(await page.locator('#passenger-live-eta').innerText(),/6 min/,
    'expired estimate message cannot override the last validated quote');
  assert.equal(await page.locator('.jalan-vehicle-symbol').getAttribute('data-heading'),
    'held','slow GPS retains last reliable bearing rather than snapping to old road geometry');
  assert.equal(await page.locator('.jalan-vehicle-symbol').textContent(),'▲',
    'triangle appears after a verified GPS match even when stationary');
  const slowDirection=await page.evaluate(()=>{
    const symbol=document.querySelector('.jalan-vehicle-symbol');
    return {map:Number.parseFloat(document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
      marker:Number.parseFloat(symbol.style.getPropertyValue('--jalan-vehicle-heading'))};
  });
  assert.ok(Number.isFinite(slowDirection.map)&&
    Math.abs(slowDirection.map+slowDirection.marker)<0.01,
    'triangle stays up while map uses estimated route bearing');
  const visibleTriangle=await page.locator('#passenger-vehicle-screen').boundingBox();
  const anchorTriangle=await page.locator('.jalan-vehicle-marker').boundingBox();
  assert.ok(Math.abs(visibleTriangle.x+visibleTriangle.width/2-
    (anchorTriangle.x+anchorTriangle.width/2))<6,
    'upright triangle stays screen-aligned with georeferenced marker');
  const turningFrames=await page.evaluate(async()=>{
    const host=document.getElementById('map'),marker=document.getElementById('passenger-vehicle-screen');
    const sheet=document.getElementById('passenger-journey-sheet'),frames=[];
    window.__offlineGPSWatch({timestamp:Date.now()+2500,coords:{
      latitude:3.1391,longitude:101.6870,accuracy:8,speed:5,heading:90}});
    for(let n=0;n<180;n++){
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const angle=-parseFloat(host.style.getPropertyValue('--jalan-camera-turn'));
      const heading=Number(marker.querySelector('svg').dataset.heading),box=marker.getBoundingClientRect();
      frames.push({angle,heading,anchorError:Math.abs(sheet.getBoundingClientRect().top-box.bottom-12)});
      if(angle===90)break;
    }
    return frames;
  });
  const intermediate=turningFrames.filter(f=>f.angle>50&&f.angle<89);
  assert.ok(new Set(intermediate.map(f=>f.angle)).size>=2,'on-route turns span multiple frames');
  assert.ok(intermediate.every(f=>Math.min(f.heading,360-f.heading)<.02&&f.anchorError<4),
    'triangle stays upright and anchored during raster rotation: '+JSON.stringify(intermediate));
  assert.equal(await page.locator('.jalan-vehicle-symbol').getAttribute('data-heading'),
    'gps','moving GPS uses direction of movement');
  assert.equal(await page.locator('.jalan-vehicle-symbol').textContent(),'▲',
    'vehicle is a triangle while moving');
  assert.equal(await page.evaluate(()=>document.querySelector('.jalan-vehicle-symbol').style.getPropertyValue('--jalan-vehicle-heading')),
    '90deg','triangle counter-rotates to screen-up while map turns');
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '-90deg','moving camera rotates only on a reliable heading');
  // Simulated touch-only interactions on the actual tilted navigation gesture
  // plane: one finger pans, two fingers pinch/rotate. No GPS or network calls.
  const touchResults=await page.evaluate(()=>{
    const surface=document.getElementById('passenger-map-gestures');
    const send=(type,points)=>{
      const event=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(event,'touches',{value:points.map(([clientX,clientY])=>({clientX,clientY}))});
      surface.dispatchEvent(event);
    };
    const first=map.getCenter();
    send('touchstart',[[170,400]]);
    send('touchmove',[[210,415]]);
    send('touchend',[]);
    const moved=map.getCenter();
    const zoomBefore=map.getZoom();
    const bearingBefore=Number.parseFloat(map.getContainer().style.getPropertyValue('--jalan-camera-turn'));
    send('touchstart',[[120,390],[240,390]]);
    send('touchmove',[[100,380],[260,420]]);
    send('touchend',[]);
    return {
      moved:Math.abs(moved.lng-first.lng)+Math.abs(moved.lat-first.lat)>0.00000001,
      zoomChanged:map.getZoom()!==zoomBefore,
      bearingChanged:Math.abs(Number.parseFloat(map.getContainer().style.getPropertyValue('--jalan-camera-turn'))-bearingBefore)>1,
      exploringText:document.getElementById('passenger-gesture-hint').textContent,
      rotation:map.getContainer().style.getPropertyValue('--jalan-camera-turn')
    };
  });
  assert.equal(touchResults.moved,true,'one finger drags tilted map');
  assert.equal(touchResults.zoomChanged,true,'two fingers pinch to zoom tilted map');
  assert.equal(touchResults.bearingChanged,true,'two fingers twist to rotate tilted map');
  assert.equal(await page.evaluate(()=>{
    const hud=document.getElementById('passenger-vehicle-screen');
    return !document.getElementById('map').contains(hud)&&
      document.getElementById('passenger-navigation').contains(hud);
  }),true,'vehicle HUD is outside rotating Leaflet map');
  // Slow incremental pinches are common on iOS. The old per-event threshold
  // never accumulated them, so test a full gesture across several small moves.
  const incrementalPinch=await page.evaluate(()=>{
    const surface=document.getElementById('passenger-map-gestures');
    const send=(type,p)=>{
      const e=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(e,'touches',{value:p.map(([clientX,clientY])=>({clientX,clientY}))});
      surface.dispatchEvent(e);
    };
    map.setZoom(15,{animate:false});
    const before=map.getZoom();
    send('touchstart',[[150,400],[250,400]]);
    for(const d of [102,104,106,108,110,113,116,120]){
      send('touchmove',[[200-d/2,400],[200+d/2,400]]);
    }
    send('touchend',[]);
    return {before,after:map.getZoom()};
  });
  assert.ok(incrementalPinch.after>incrementalPinch.before,
    'incremental two-finger pinch must accumulate into a zoom step');
  assert.match(touchResults.exploringText,/Exploring map/);
  const exploreCenter=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+3000,coords:{
      latitude:3.1392,longitude:101.6872,accuracy:8,speed:5,heading:90}});
  });
  assert.deepEqual(await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]),exploreCenter,
    'GPS updates do not steal the camera while manually exploring');
  assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),true,
    'right-side Recenter remains available without opening the menu');
  await page.locator('#passenger-recenter-floating').click();
  assert.match(await page.locator('#passenger-gesture-hint').innerText(),/Following GPS/);
  // Repeated identical GPS fixes must not invoke Leaflet setView or panTo:
  // this previously flashed raster tiles on the phone after Recenter.
  await page.evaluate(()=>JalanPassengerCamera.setSetting('zoom',100));
  assert.equal(await page.evaluate(()=>map.getZoom()),19,'raster maximum zoom respects available map capability');
  const stableCamera=await page.evaluate(()=>{
    const originalSet=map.setView.bind(map),originalPan=map.panTo.bind(map);
    let setCount=0,panCount=0;
    map.setView=(...args)=>{setCount++;return originalSet(...args);};
    map.panTo=(...args)=>{panCount++;return originalPan(...args);};
    // Passenger camera follows measured GPS, not the old route-snapped predictor.
    const position=window.JalanGPS.getState().vehiclePosition||window.JalanGPS.getState().gpsPosition;
    if(!Array.isArray(position))throw Error('measured GPS unavailable for camera stability check');
    for(let i=0;i<3;i++){
      window.__offlineGPSWatch({timestamp:Date.now()+3900+i*100,coords:{
        latitude:position[0],longitude:position[1],accuracy:8,speed:0,heading:0}});
    }
    const result={setCount,panCount};map.setView=originalSet;map.panTo=originalPan;
    return result;
  });
  assert.deepEqual(stableCamera,{setCount:0,panCount:0},
    'stationary GPS updates must not redraw the entire route camera');
  await page.evaluate(()=>JalanPassengerCamera.setSetting('zoom',80));
  await menuClick('#passenger-recenter');
  assert.match(await page.locator('#passenger-gesture-hint').innerText(),/Following GPS/);
  assert.equal(await page.evaluate(()=>map.getZoom()),18.8,
    'Recenter explicitly restores navigation zoom after exploration');
  const restored=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  assert.notDeepEqual(restored,exploreCenter,
    'Recenter returns the map to the GPS-follow target instead of keeping the dragged view');
  await menuClick('#passenger-2d');
  assert.equal(await page.locator('#passenger-2d').innerText(),'2.5D preview',
    'return control never advertises nonexistent real 3D terrain or buildings');
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '0deg','2D mode stays north-up');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('map')).pointerEvents),
    'none','2D map rotation uses a dedicated gesture plane, not mismatched Leaflet hit testing');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('passenger-map-gestures')).pointerEvents),
    'auto','2D gesture plane supports pan pinch and twist');
  const flatGestures=await page.evaluate(()=>{
    const surface=document.getElementById('passenger-map-gestures');
    const send=(type,p)=>{
      const e=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(e,'touches',{value:p.map(([clientX,clientY])=>({clientX,clientY}))});
      surface.dispatchEvent(e);
    };
    const before=map.getCenter(),zoom=map.getZoom();
    send('touchstart',[[170,350]]);
    send('touchmove',[[210,390]]);
    send('touchend',[]);
    const panned=Math.abs(map.getCenter().lng-before.lng)>0.000001;
    send('touchstart',[[150,400],[250,400]]);
    send('touchmove',[[140,390],[260,410]]);
    send('touchend',[]);
    return {panned,zoomed:map.getZoom()!==zoom,
      rotated:Math.abs(Number.parseFloat(document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')))>2};
  });
  assert.equal(flatGestures.panned,true,'flat 2D one-finger drag works');
  assert.equal(flatGestures.zoomed,true,'flat 2D pinch works');
  assert.equal(flatGestures.rotated,true,'flat 2D two-finger rotation works');
  await menuClick('#passenger-recenter');
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '0deg','2D Recenter restores north-up');
  assert.equal(await page.evaluate(()=>map.getZoom()),18.8,'2D Recenter returns to GPS zoom');
  await menuClick('#passenger-2d');
  const headingAfterReturn=await page.evaluate(()=>({
    camera:Number.parseFloat(document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    vehicle:Number.parseFloat(document.querySelector('.jalan-vehicle-symbol').style.getPropertyValue('--jalan-vehicle-heading'))
  }));
  assert.ok(Number.isFinite(headingAfterReturn.camera)&&
    Math.abs(headingAfterReturn.camera+headingAfterReturn.vehicle)<0.02,
    'return to perspective uses last valid GPS or route-estimated heading with upright triangle');
  const cameraBeforeWeak=await page.evaluate(()=>
    document.getElementById('map').style.getPropertyValue('--jalan-camera-turn'));
  await page.evaluate(()=>{
    // Follow the last stationary fixture sample (+4100 ms) even on fast runners.
    window.__offlineGPSWatch({timestamp:Date.now()+4200,coords:{
      latitude:3.1391,longitude:101.6870,accuracy:180,speed:5,heading:90}});
  });
  await page.waitForFunction(()=>
    document.querySelector('.jalan-vehicle-marker')?.classList.contains('jalan-vehicle-uncertain'),
    null,{timeout:1500});
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),1,
    'weak GPS keeps one last-known measured vehicle');
  assert.equal(await page.evaluate(()=>
    document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    cameraBeforeWeak,'weak GPS must freeze existing camera instead of inventing a bearing');
  await menuClick('#passenger-2d');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-map-flat')),true);
  await menuClick('#passenger-stop');
  assert.equal(await page.locator('.passenger-demo-report-marker').count(),0);
  assert.equal(await page.evaluate(()=>map.hasLayer(reportLayer)),true,
    'End preview restores the original map demo layer');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),false);
  assert.equal(await page.evaluate(()=>routes.length),0,'Stop clears the route');
  assert.equal(await page.evaluate(()=>startMarker===null),true,'Stop removes the old start marker');
  assert.equal(await page.locator('#passenger-overview').isVisible(),false);
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  assert.equal(await page.locator('#passenger-setup').count(),0,'provider entry controls removed');
  assert.equal(await page.evaluate(()=>JalanVoice.getState().unavailable),true);
  await page.evaluate(()=>{
    window.__testVoices=[{voiceURI:'test-voice-us',name:'Test English US',lang:'en-US',localService:true}];
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await page.locator('#jalan-home-menu').click();
  await page.locator('#passenger-voice').click();
  assert.equal(await page.locator('#passenger-voice-choice option:checked').textContent(),'Test English US · en-US');
  await page.keyboard.press('Escape');
  await page.locator('#jalan-home-menu').click();
  // Actual passenger Go -> provider route-linked TRAFFIC sections -> reports.
  // All remote assets are intercepted; no live TomTom key/location is sent.
  let incidentRequests=0,trafficRouteRequests=0;
  await page.route('https://api.tomtom.com/traffic/map/**',route=>route.fulfill({
    status:200,contentType:'image/png',body:Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
  await page.route('https://api.tomtom.com/traffic/services/5/incidentDetails?**',route=>{
    incidentRequests++;
    return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  });
  await page.route('https://api.tomtom.com/routing/1/calculateRoute/**',route=>{
    trafficRouteRequests++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({routes:[{
      legs:[{points:[{latitude:3.139,longitude:101.6869},{latitude:3.145,longitude:101.6925},
        {latitude:3.1478,longitude:101.6953}]}],
      summary:{lengthInMeters:3200,travelTimeInSeconds:600,trafficDelayInSeconds:30},
      sections:[{sectionType:'TRAFFIC',startPointIndex:0,endPointIndex:1,simpleCategory:'JAM',magnitudeOfDelay:2,delayInSeconds:90},
        {sectionType:'TRAFFIC',startPointIndex:1,endPointIndex:2,simpleCategory:'ROAD_WORK',delayInSeconds:60}],
      guidance:{instructions:[
        {pointIndex:0,street:'Fixture first road',roadNumbers:['E1']},
        {pointIndex:1,street:'Fixture second road',roadNumbers:['E2']}]}
    }]})});
  });
  const trafficConfig=route=>route.fulfill({contentType:'application/javascript',
    body:"window.JalanPublicConfig={tomtomBrowserKey:'TEST_RESTRICTED_KEY_1234'};"});
  await page.route('**/jalan-config.js*',trafficConfig);
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  const trafficLayers=()=>page.evaluate(()=>{
    let n=0;map.eachLayer(layer=>{if(String(layer._url||'').includes('/traffic/map/'))n++;});return n;
  });
  const openNavigation=async()=>{
    await page.locator('#jalan-home-menu').click();
    await page.locator('#passenger-navigation-settings>summary').click();
  };
  const nearbySwitch=page.getByRole('switch',{name:'Show nearby traffic'});
  await openNavigation();
  assert.equal(await nearbySwitch.isChecked(),true);
  assert.equal(await trafficLayers(),1,'nearby traffic appears before choosing a route');
  await nearbySwitch.uncheck();
  assert.equal(await trafficLayers(),0);
  await page.reload();
  await openNavigation();
  assert.equal(await nearbySwitch.isChecked(),false,'choice survives reload');
  assert.equal(await trafficLayers(),0,'no nearby layer is loaded when saved off');
  await page.locator('#jalan-home-menu-close').click();
  const setupTrafficRoute=()=>page.evaluate(()=>{
    document.getElementById('tt-primary').checked=true;
    document.getElementById('tt-key').value='TEST_RESTRICTED_KEY_1234';
    document.getElementById('tt-incident-toggle').checked=false;
    localStorage.removeItem('jalan-demo-reports-v1');
    setStart([3.139,101.6869],'Fixture start');destination=[3.1478,101.6953];
    routes=[{provider:'tomtom',duration:600,distance:3200,delay:30,
      geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6925,3.145],[101.6953,3.1478]]},
      trafficSectionsCheckedAt:Date.now(),
      trafficSections:[
        {sectionType:'TRAFFIC',startPointIndex:0,endPointIndex:1,simpleCategory:'JAM',magnitudeOfDelay:2,delayInSeconds:90},
        {sectionType:'TRAFFIC',startPointIndex:1,endPointIndex:2,simpleCategory:'ROAD_WORK',delayInSeconds:60}],
      legs:[{steps:[{name:'Fixture first road',street:'Fixture first road',
        pointIndex:0,roadNumbers:['E1'],maneuver:{type:'continue'}},
        {name:'Fixture second road',street:'Fixture second road',
        pointIndex:1,roadNumbers:['E2'],maneuver:{type:'continue'}}]}]}];
    selectedRoute=0;renderRoutes();
  });
  await setupTrafficRoute();
  assert.equal(incidentRequests,0,'no area-wide incident requests before Go');
  await page.locator('#passenger-go').click();
  await page.waitForFunction(()=>window.__trafficLayerStatus?.state==='ready');
  assert.equal(incidentRequests,0,
    'route-linked reports do not fetch unrelated bbox Incident Details');
  assert.equal(trafficRouteRequests,0,'traffic route check waits for a trusted GPS fix');
  assert.equal(await page.locator('#jalan-home-menu-panel').isVisible(),false);
  assert.match(await page.evaluate(()=>window.__trafficLayerStatus?.message),/Route-linked traffic: 2/);
  assert.equal(await page.locator('.report-marker').count(),2,
    'two provider-defined route sections, not nearby unlinked incidents');
  assert.equal(await page.locator('#passenger-traffic-toggle').getAttribute('aria-pressed'),'true');
  assert.equal(await trafficLayers(),0,'starting guidance respects the saved map setting');
  const routeTrafficSnapshot=()=>page.evaluate(()=>({
    eta:document.getElementById('passenger-eta').textContent,
    route:routes[selectedRoute].duration,sections:JalanRouteTraffic.getJourneySnapshot().segments,
    markers:document.querySelectorAll('.report-marker').length
  }));
  const beforeToggle=await routeTrafficSnapshot();
  await openNavigation();
  await nearbySwitch.check();
  assert.equal(await trafficLayers(),1);
  await nearbySwitch.uncheck();
  assert.equal(await trafficLayers(),0);
  await nearbySwitch.check();
  await page.locator('#jalan-home-menu-close').click();
  assert.deepEqual(await routeTrafficSnapshot(),beforeToggle,'nearby colours leave route ETA, section colours and reports intact');
  assert.equal(trafficRouteRequests,0,'map switch does not recalculate the route');
  await page.locator('#passenger-turn-toggle').click();
  const roadWork=page.getByRole('button',{name:/Fixture second road/});
  const jam=page.locator('#passenger-report-list [data-category=moderate]');
  assert.equal(await jam.locator('strong').innerText(),'Moderate Traffic Jam');
  const backgrounds=await page.locator('#passenger-report-list button').evaluateAll(buttons=>buttons.map(b=>getComputedStyle(b).backgroundColor));
  assert.equal(new Set(backgrounds).size,2,'road work and a moderate jam have distinct row backgrounds');
  assert.equal(await roadWork.locator('strong').innerText(),'Road Work');
  assert.equal(await roadWork.locator('small').first().innerText(),'Waiting for GPS distance');
  assert.match(await roadWork.locator('small').last().innerText(),/Fixture second road.*delay 1 min/);
  assert.doesNotMatch(await page.locator('#passenger-reports-panel').innerText(),/TomTom route traffic|from report to destination|TomTom traffic sections/i);
  assert.equal(await page.locator('#passenger-report-list li').count(),2);
  await page.getByRole('button',{name:/Fixture second road/}).tap();
  await assertReportCenter(3.145,101.6925);
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),0,
    'a provider route-section marker cannot impersonate road-matched GPS');
  await page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now(),coords:{
    latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}}));
  await page.waitForFunction(()=>document.getElementById('passenger-live-eta').textContent.includes('10 min'));
  await assertReportCenter(3.145,101.6925);
  await page.locator('#passenger-recenter-floating').click();
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),0);
  assert.equal(trafficRouteRequests,1,'trusted GPS triggers one traffic route comparison');
  await page.locator('#passenger-turn-toggle').click();
  assert.match(await roadWork.locator('small').first().innerText(),/^In [\d.]+ (km|m)$/);
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-reports-panel.png')});
  await page.locator('#passenger-turn-toggle').click();
  await menuClick('#passenger-traffic-details summary');
  await menuClick('#passenger-traffic-toggle');
  assert.equal(await trafficLayers(),1,'trip traffic checks do not control nearby map colours');
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),0);
  assert.equal(await page.evaluate(()=>window.__trafficLayerStatus?.state),'off');
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('#passenger-report-list li').count(),0);
  await page.locator('#passenger-turn-toggle').click();
  await page.evaluate(()=>{routes[selectedRoute].trafficSectionsCheckedAt=Date.now()-11*60*1000;});
  await menuClick('#passenger-traffic-toggle');
  await page.waitForFunction(()=>window.__trafficLayerStatus?.message.includes('Recalculate route'));
  assert.equal(await page.locator('.report-marker').count(),0,
    'expired route snapshot must not display stale reports');
  await menuClick('#passenger-stop');
  assert.equal(await trafficLayers(),1,'nearby map colours remain available after the trip');
  assert.equal(await page.locator('#proactive-toggle').getAttribute('aria-pressed'),'false');
  await setupTrafficRoute();
  await page.evaluate(()=>{document.getElementById('tt-key').value='';});
  const beforeMissingKey=incidentRequests;
  await page.locator('#passenger-go').click();
  assert.match(await page.evaluate(()=>window.__trafficLayerStatus?.message),/add a TomTom key/);
  assert.equal(incidentRequests,beforeMissingKey);
  assert.equal(await trafficLayers(),0);
  await page.locator('#jalan-home-menu').click();
  await menuClick('#passenger-stop');
  await page.unroute('**/jalan-config.js*',trafficConfig);
  // Real browser integration of Go -> sustained detour -> provider response.
  // GPS, routes and time are controlled fixtures; every external request is intercepted.
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  let detourRequest=null,detourRequests=0;
  await page.route('https://router.project-osrm.org/route/v1/driving/**',request=>{
    detourRequests++;detourRequest=request;
  });
  await page.evaluate(()=>{
    document.getElementById('tt-primary').checked=false;
    window.__detourNow=Date.now();Date.now=()=>window.__detourNow;
    setStart([3,101.6],'Synthetic detour start');destination=[3,101.61];
    destinationMarker=L.marker(destination).addTo(pointLayer);
    routes=[{provider:'osrm',duration:600,distance:1110,legs:[],
      geometry:{type:'LineString',coordinates:[[101.6,3],[101.61,3]]}}];
    selectedRoute=0;renderRoutes();
    window.__detourOriginal={route:routes[0],destination,marker:destinationMarker};
  });
  await page.locator('#passenger-go').click();
  assert.equal(await page.locator('#passenger-auto-reroute').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{
    window.__detourGPSWatch=window.__offlineGPSWatch;
    const send=(latitude,longitude,advance,heading=90)=>{
      window.__detourNow+=advance;
      window.__offlineGPSWatch({timestamp:Date.now(),coords:{latitude,longitude,accuracy:8,speed:5,heading}});
    };
    send(3,101.6,0);
    for(let i=1;i<=6;i++)send(3+Math.min(i,4)*.0002,101.6+i*.0001,3000,i<=4?27:90);
  });
  await page.waitForFunction(()=>document.getElementById('passenger-reroute-status').dataset.state==='checking');
  assert.equal(detourRequests,1,'Go automatically requests one route after a sustained detour');
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),1,
    'off-route GPS retains vehicle triangle instead of discarding it');
  await page.evaluate(()=>window.__detourVehicle=document.querySelector('.jalan-vehicle-marker'));
  assert.deepEqual(await page.evaluate(()=>JalanGPS.getState().gpsPosition),[3.0008,101.6006],
    'measured off-route position remains separate from old route-match state');
  assert.equal(await page.locator('#passenger-speed').innerText(),'18',
    'speed is measured GPS even when prior route is unmatched');
  assert.equal(await page.locator('#passenger-signal-alert,.passenger-heading').count(),0,
    'off-route diagnostics do not create a second overlay beneath the turn banner');
  assert.equal(await page.locator('#passenger-turn-toggle').isVisible(),true);
  assert.equal(await page.evaluate(()=>JalanGPS.getState().active&&routes[0]===window.__detourOriginal.route),true,
    'existing journey stays active while the replacement request is pending');
  const origin=new URL(detourRequest.request().url()).pathname.split('/driving/')[1].split(';')[0].split(',').map(Number);
  assert.equal(origin[1],3.0008,'request starts at actual off-route latitude, not the snapped old road');
  await detourRequest.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[{
    duration:400,distance:1250,legs:[],geometry:{type:'LineString',coordinates:[origin,[101.61,3]]}
  }]})});
  await page.waitForFunction(()=>JalanGPS.getState().active&&JalanGPS.getState().route!==window.__detourOriginal.route);
  assert.equal(await page.evaluate(()=>destination===window.__detourOriginal.destination&&destinationMarker===window.__detourOriginal.marker),true);
  assert.equal(await page.evaluate(()=>window.__offlineGPSWatch===window.__detourGPSWatch),true,
    'successful reroute preserves original geolocation watch');
  assert.equal(await page.evaluate(()=>window.__detourVehicle===document.querySelector('.jalan-vehicle-marker')),true,
    'reroute replaces only road geometry without recreating the triangle');
  assert.equal(await page.locator('#passenger-navigation').isVisible(),true);
  assert.equal(await page.locator('#passenger-go').isVisible(),false,'new route resumes guidance without another Go');
  assert.match(await page.locator('#passenger-reroute-status').textContent(),/Route updated/);
  console.log('PASS off-route recovery: Go enables auto, sustained detour requests from real GPS, pending route retained, same destination, guidance resumes');
  sheetTouch=await context.newCDPSession(page);
  // Active journey sheet: genuine pointer/touch gestures, read-only traffic
  // presentation, Resume continuity and Stop clearing the entire journey.
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  await page.evaluate(()=>{
    document.getElementById('tt-primary').checked=true;
    document.getElementById('tt-key').value='TEST_RESTRICTED_KEY_1234';
    setStart([3,101.6],'Journey fixture start');destination=[3,101.61];destinationName='KLCC';
    destinationMarker=L.marker(destination).addTo(pointLayer);
    routes=[{provider:'tomtom',duration:600,distance:1000,
      geometry:{type:'LineString',coordinates:[[101.6,3],[101.6025,3],[101.605,3],[101.6075,3],[101.61,3]]},
      roadGuidance:[{street:'Maju Expressway',routeOffsetInMeters:0},
        {street:'Jalan Ampang',routeOffsetInMeters:800},{street:'KLCC',routeOffsetInMeters:1000,maneuver:'ARRIVE'}],
      legs:[{steps:[]}],trafficSectionsCheckedAt:Date.now(),trafficSections:[
        {sectionType:'TRAFFIC',startPointIndex:1,endPointIndex:2,magnitudeOfDelay:2},
        {sectionType:'TRAFFIC',startPointIndex:3,endPointIndex:4,magnitudeOfDelay:3}]}];
    selectedRoute=0;renderRoutes();
  });
  await page.locator('#passenger-go').click();
  await page.waitForFunction(()=>document.getElementById('passenger-journey-sheet').offsetHeight>60);
  const journeyState=()=>page.locator('#passenger-journey-sheet').getAttribute('data-expanded');
  const beforeJourney=await page.evaluate(()=>{
    window.__journeyBefore={route:JalanGPS.getState().route,watch:window.__offlineGPSWatch,destination,marker:destinationMarker};
    return document.getElementById('passenger-journey-sheet').getBoundingClientRect().height;
  });
  assert.equal(await journeyState(),'false');
  assert.equal(await page.locator('#passenger-journey-content').isVisible(),false);
  assert.equal(await page.locator('#passenger-journey-content').evaluate(x=>x.inert),true);
  const journeyHandle=await page.locator('#passenger-journey-handle').boundingBox();
  await page.mouse.move(journeyHandle.x+80,journeyHandle.y+12);await page.mouse.down();
  await page.mouse.move(journeyHandle.x+80,journeyHandle.y-50,{steps:6});
  assert.ok(await page.locator('#passenger-journey-sheet').evaluate(x=>x.getBoundingClientRect().height)>beforeJourney+40,
    'journey sheet follows the pointer before release');
  await page.mouse.up();
  assert.equal(await journeyState(),'true');
  assert.equal(await page.locator('#passenger-journey-destination').textContent(),'Destination: KLCC');
  assert.equal(await page.locator('#passenger-journey-via').textContent(),'Via Maju Expressway');
  assert.equal(await page.locator('#passenger-journey-line [data-traffic="moderate"]').count(),1);
  assert.equal(await page.locator('#passenger-journey-traffic-note').isVisible(),false);
  const bars=await page.locator('#passenger-journey-line span').evaluateAll(nodes=>nodes.map(x=>({
    type:x.dataset.traffic,left:parseFloat(x.style.left),width:parseFloat(x.style.width)})));
  assert.ok(bars[0].left>=23&&bars[0].left<=26&&bars[0].width>=24&&bars[0].width<=28,'moderate traffic near first quarter, proportional length');
  assert.ok(bars[1].left>=73&&bars[1].left<=76,'heavy traffic near last quarter');
  assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),false,'map controls cannot overlap the expanded sheet');
  const actionBoxes=await page.locator('.passenger-journey-actions button').evaluateAll(nodes=>nodes.map(x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}}));
  assert.ok(actionBoxes[0].right<actionBoxes[1].left&&actionBoxes[0].top===actionBoxes[1].top&&actionBoxes[1].bottom<844);
  await page.waitForFunction(()=>{
    const credit=document.getElementById('jalan-home-credits'),sheet=document.getElementById('passenger-journey-sheet');
    const r=credit.getBoundingClientRect(),s=sheet.getBoundingClientRect();
    return r.height>0&&r.bottom<=s.top-2&&r.top>=0;
  },null,{timeout:5000});
  await page.waitForFunction(()=>{
    const pin=destinationMarker.getElement();
    return pin instanceof HTMLImageElement&&pin.complete&&pin.naturalWidth>0;
  },null,{timeout:5000});
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-journey-expanded.png')});
  await page.waitForTimeout(750);
  await page.locator('#passenger-journey-resume').click();
  assert.equal(await journeyState(),'false');
  assert.equal(await page.evaluate(()=>{
    const b=window.__journeyBefore;
    return JalanGPS.getState().active&&JalanGPS.getState().route===b.route&&window.__offlineGPSWatch===b.watch&&destination===b.destination&&destinationMarker===b.marker;
  }),true,'Resume keeps the exact GPS session, route and destination');
  await swipeInside('#passenger-distance',-120);
  assert.equal(await journeyState(),'true','swipe on time/km expands details');
  await swipeInside('#passenger-journey-handle',110,{cancel:true});
  assert.equal(await journeyState(),'true','cancelled drag keeps expanded state');
  await swipeInside('#passenger-journey-handle',110);
  assert.equal(await journeyState(),'false','drag down returns to map');
  await page.waitForTimeout(750);
  await page.locator('#passenger-journey-handle').focus();await page.keyboard.press('Enter');
  assert.equal(await journeyState(),'true','keyboard handle expands');
  await page.keyboard.press('Escape');assert.equal(await journeyState(),'false');
  await page.locator('#passenger-journey-handle').click();
  // Explicitly stub only displayed matched progress, without moving the real
  // vehicle: verify bar clipping and stale trust independently of geolocation.
  await page.evaluate(()=>{
    window.__journeyGetState=JalanGPS.getState;
    JalanGPS.getState=()=>({...window.__journeyGetState(),matched:true,fixAgeMs:0,accuracy:8,remainingMeters:500});
    window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{matched:false}}));
  });
  await page.waitForFunction(()=>document.getElementById('passenger-journey-origin').textContent==='You');
  const clipped=await page.locator('#passenger-journey-line [data-traffic="heavy"]').evaluate(x=>parseFloat(x.style.left));
  assert.ok(clipped>=46&&clipped<=53,'traffic repositions relative to remaining route');
  const viaLabel=page.locator('#passenger-journey-via');
  async function journeyFix(remainingMeters,matched=true,fixAgeMs=0){
    await page.evaluate(({remainingMeters,matched,fixAgeMs})=>{
      JalanGPS.getState=()=>({...window.__journeyGetState(),matched,fixAgeMs,accuracy:8,remainingMeters});
      window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{matched}}));
      return new Promise(done=>requestAnimationFrame(()=>done()));
    },{remainingMeters,matched,fixAgeMs});
  }
  await journeyFix(201);
  assert.equal(await viaLabel.textContent(),'Via Maju Expressway','hold Via up to its exit');
  await journeyFix(100,false);await journeyFix(100,true,15000);
  assert.equal(await viaLabel.textContent(),'Via Maju Expressway','unmatched and stale fixes cannot switch Via');
  await page.locator('#passenger-journey-resume').click();
  await journeyFix(200);
  assert.equal(await viaLabel.textContent(),'Via Jalan Ampang','advance exactly at exit with details collapsed');
  await journeyFix(500);
  await page.locator('#passenger-journey-handle').click();
  assert.equal(await viaLabel.textContent(),'Via Jalan Ampang','reopening or backward GPS jitter preserves Via');
  await page.evaluate(()=>{JalanGPS.getState=window.__journeyGetState;});
  await page.waitForFunction(()=>document.getElementById('passenger-journey-origin').textContent==='Last route position');
  // Long names on short screens keep real scrolling and the actions reachable.
  await page.setViewportSize({width:390,height:568});
  await page.evaluate(()=>{destinationName='Very long destination name '.repeat(18);});
  await page.waitForFunction(()=>document.getElementById('passenger-journey-destination').textContent.length>200);
  await swipeInside('#passenger-journey-content',-80,{offsetY:40});
  assert.equal(await journeyState(),'true','upward content gesture scrolls instead of collapsing');
  assert.ok(await page.locator('#passenger-journey-content').evaluate(x=>x.scrollTop)>0);
  await page.locator('#passenger-journey-resume').click();
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{destinationName='KLCC';});
  await page.locator('#passenger-journey-handle').click();
  await page.locator('#passenger-search').click();
  assert.equal(await journeyState(),'false','search closes details and opens C');
  assert.equal(await sheetState(),'c');await page.keyboard.press('Escape');
  await page.locator('#passenger-journey-handle').click();
  await page.evaluate(()=>{document.getElementById('passenger-traffic-toggle').click();});
  await page.waitForFunction(()=>document.querySelectorAll('#passenger-journey-line span').length===0);
  assert.equal(await page.locator('#passenger-journey-traffic-note').isVisible(),true);
  assert.match(await page.locator('#passenger-journey-traffic-note').textContent(),/unavailable/);
  await page.locator('#passenger-journey-stop').click();
  assert.equal(await page.evaluate(()=>JalanGPS.getState().active),false);
  assert.equal(await page.evaluate(()=>routes.length===0&&destination===null&&destinationMarker===null&&destinationName===''),true);
  assert.equal(await page.locator('#destination').inputValue(),'');
  assert.equal(await sheetState(),'a');
  assert.equal(await page.locator('#passenger-navigation').isVisible(),false);
  assert.equal(await page.locator('#passenger-overview').isVisible(),false);
  console.log('PASS active journey sheet: drag/touch/keyboard, longest-road label, proportional remaining traffic, scroll, Resume continuity and Stop reset');
  await require('./passenger-follow-390.cjs')(page,context,base);
  await require('./passenger-route-start-390.cjs')(browser,base,root);
  await require('./passenger-forward-390.cjs')(page,base);
  await require('./passenger-drift-390.cjs')(page,base);
  await require('./passenger-reporting-390.cjs')(browser,base,root);
  await page.goto(base+'/index.html?mode=engineering',{waitUntil:'load'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-mode')),false);
  assert.equal(await page.locator('#info-panel').isVisible(),true,'original engineering dashboard retained');
  assert.equal(await page.locator('#passenger-settings-top').count(),0);
  // Privacy-restricted browser: storage getters may throw SecurityError before
  // the TomTom module initializes. Preserve the no-key/OSRM experience and
  // use an explicitly entered key only for this tab, never claim it was saved.
  const deniedContext=await browser.newContext({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await deniedContext.addInitScript(()=>{
    for(const storage of ['localStorage','sessionStorage']){
      Object.defineProperty(window,storage,{configurable:true,get(){
        throw new DOMException('Disabled by browser privacy policy','SecurityError');
      }});
    }
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      getCurrentPosition(_ok,error){error({code:1,message:'Permission denied'})},
      watchPosition(_ok,error){error({code:1,message:'Permission denied'});return 1},
      clearWatch(){}
    }});
  });
  const deniedPage=await deniedContext.newPage(),deniedErrors=[];
  deniedPage.on('pageerror',error=>deniedErrors.push(error.message));
  await deniedPage.route('**/*',route=>route.request().url().startsWith(base+'/')?
    route.continue():route.abort('blockedbyclient'));
  await deniedPage.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',route=>
    route.fulfill({status:200,contentType:'application/javascript',
      body:fs.readFileSync(path.join(leaflet,'leaflet.js'))}));
  await deniedPage.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',route=>
    route.fulfill({status:200,contentType:'text/css',
      body:fs.readFileSync(path.join(leaflet,'leaflet.css'))}));
  await deniedPage.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  assert.equal(await deniedPage.evaluate(()=>document.body.classList.contains('passenger-mode')),true);
  assert.equal(await deniedPage.locator('#passenger-setup').count(),0);
  await deniedPage.locator('#jalan-home-menu').click();
  await deniedPage.locator('#passenger-voice').click();
  await deniedPage.locator('input[name=passenger-sound-mode][value=alerts]').check();
  await deniedPage.locator('#passenger-sound-ok').click();
  assert.equal(await deniedPage.evaluate(()=>JalanGPS.getVoiceMode()),'alerts','blocked storage allows page-only sound mode');
  await deniedPage.evaluate(()=>{
    document.getElementById('report-hazard').click();
    map.fire('click',{latlng:L.latLng(3.139,101.687)});
  });
  assert.match(await deniedPage.locator('#status').innerText(),
    /visible for this page only; browser storage unavailable/);
  assert.deepEqual(deniedErrors,[],'storage denial must not crash either TomTom or Passenger scripts');
  await deniedPage.route('**/jalan-config.js*',route=>route.fulfill({contentType:'application/javascript',
    body:"window.JalanPublicConfig={managedTomTom:true,tomtomBrowserKey:'SYNTHETIC_MANAGED_TEST_KEY',appVersion:'4.8.0-test'};"}));
  await deniedPage.reload({waitUntil:'load'});
  assert.equal(await deniedPage.evaluate(()=>document.getElementById('tt-key').value),'SYNTHETIC_MANAGED_TEST_KEY');
  assert.equal(await deniedPage.evaluate(()=>document.getElementById('tt-primary').checked),true);
  assert.equal(await deniedPage.locator('#passenger-key').count(),0,'configured routing needs no passenger key entry');
  assert.deepEqual(deniedErrors,[]);
  await require('./passenger-road-details-390.cjs')(deniedPage);
  await require('./passenger-lane-guidance-390.cjs')(deniedPage);
  assert.equal(await deniedPage.locator('#passenger-stations').isChecked(),false,'storage denial defaults stations off');
  assert.deepEqual(deniedErrors,[]);
  await deniedContext.close();
  await require('./destination-suggestions-390.cjs')({context,base,root});
  const pinPage=await context.newPage();
  try{
   await pinPage.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(base+'/'))return route.continue();
    if(url.includes('unpkg.com/leaflet@')&&/leaflet\.(css|js)$/.test(url)){
     const file=url.split('/').at(-1);
     return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/css',
       body:fs.readFileSync(path.join(leaflet,file))});
    }
    return route.abort();
   });
   await pinPage.goto(base+'/index.html?mode=passenger&renderer=raster');
   await pinPage.locator('#jalan-launch').waitFor({state:'hidden'});
   await require('./passenger-pin-390.cjs')(pinPage,{routing:true});
   await require('./passenger-language-390.cjs')(pinPage);
   await pinPage.reload();
   await pinPage.locator('#jalan-launch').waitFor({state:'hidden'});
   await require('./passenger-avoid-tolls-390.cjs')(pinPage);
   await require('./passenger-speed-cameras-390.cjs')(pinPage);
   await pinPage.route('**/jalan-config.js*',route=>route.fulfill({contentType:'application/javascript',
    body:"window.JalanPublicConfig={managedTomTom:true,tomtomBrowserKey:'SYNTHETIC_MANAGED_TEST_KEY',appVersion:'4.8.0-test'};"}));
   await require('./passenger-stations-390.cjs')(pinPage);
  }finally{await pinPage.close();}

  assert.deepEqual(errors,[],'no uncaught JS errors in either UI');
  console.log('JALAN passenger 390px offline PASS: two modes, fastest, real alternatives, +minutes, Go, 2D, exit and provider fallback.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
