'use strict';
// No-network 390px integration of two JALAN interfaces. Mock alternative
// routes and geolocation; no actual TomTom key, GPS, Atlas or external requests.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const contentTypes={'.html':'text/html; charset=utf-8','.js':'application/javascript',
 '.css':'text/css; charset=utf-8'};
const serve=(req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost')}catch{res.writeHead(400);return res.end()}
 const name=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!name.startsWith(root+path.sep)||!fs.existsSync(name)||!fs.statSync(name).isFile()){
   res.writeHead(404);return res.end('Missing test asset');
 }
 res.writeHead(200,{'content-type':contentTypes[path.extname(name)]||'text/plain',
  'cache-control':'no-store'});
 res.end(fs.readFileSync(name));
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
  const menuClick=async selector=>{
    if(!await page.locator('#jalan-home-menu-panel').isVisible())await page.locator('#jalan-home-menu').click();
    await page.locator(selector).click();
  };
  page.on('pageerror',error=>errors.push(error.message));
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
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-mode')),true);
  assert.equal(await page.locator('#info-panel').isVisible(),false);
  assert.equal(await page.locator('#search-form').isVisible(),true);
  assert.equal(await page.locator('#passenger-overview').isVisible(),false);
  const sheetState=()=>page.locator('#jalan-home-sheet').getAttribute('data-state');
  assert.equal(await sheetState(),'a','Passenger preview opens with collapsed search sheet');
  assert.equal(await page.locator('#jalan-home-menu').isVisible(),true);
  assert.equal(await page.locator('#jalan-home-report').isVisible(),true);
  assert.equal(await page.locator('#jalan-home-speed-value').textContent(),'—',
    'unverified GPS must never display invented speed');
  await page.locator('#jalan-home-report').click();
  assert.match(await page.locator('#jalan-home-notice').textContent(),/No report was submitted/);
  await page.locator('#jalan-home-menu').click();
  assert.equal(await page.locator('#jalan-home-menu-panel').isVisible(),true);
  assert.equal(await page.locator('#jalan-home-notice').isVisible(),false,'old notices do not obscure the menu');
  assert.equal(await page.locator('#passenger-options').count(),0,'old three-dot control is removed');
  assert.equal(await page.locator('#passenger-journey-options').isVisible(),false,'journey controls are hidden before Go');
  await page.evaluate(()=>{
    window.__testVoices=[{voiceURI:'test-voice-us',name:'Test English US',lang:'en-US',localService:true},
      {voiceURI:'test-voice-uk',name:'Test English UK',lang:'en-GB',localService:true}];
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await page.locator('#passenger-voice-choice').selectOption({label:'Test English US · en-US'});
  await page.locator('#passenger-voice-preview').click();
  assert.equal(await page.evaluate(()=>window.__spoken.at(-1).voice),'Test English US');
  assert.match(await page.locator('#gps-voice').textContent(),/Mute/,'sample does not enable navigation speech');
  fs.mkdirSync(path.join(root,'test-artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-voice-menu.png')});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#jalan-home-menu-panel').isVisible(),false);
  assert.equal(await page.locator('#jalan-home-menu').getAttribute('aria-expanded'),'false');
  // The search banner must support progressive A→B (not jump to C) on
  // an actual pointer swipe, while B exposes the session-only Recent area.
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
  assert.match(await page.locator('#jalan-recent-list').textContent(),/during this session/);
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
  const sheetTouch=await context.newCDPSession(page);
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
  assert.equal(await page.locator('#passenger-route-list button').count(),3);
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
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    const list=document.getElementById('passenger-route-list');
    while(list.children.length>3)list.lastElementChild.remove();
  });
  assert.match(await page.locator('#passenger-route-list').innerText(),/\+2 min/);
  assert.match(await page.locator('#passenger-route-list').innerText(),/\+4 min/);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('route-perspective')),false,
   'Route review must remain 2D until Go');
  await page.locator('#passenger-route-list button').nth(1).click();
  assert.equal(await page.evaluate(()=>selectedRoute),1,'alternative selectable');
  await page.locator('#passenger-route-list button').first().click();
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
  assert.equal(await page.locator('#passenger-voice').isVisible(),false,
    'advanced controls remain hidden until opening options');
  await page.locator('#jalan-home-menu').click();
  assert.equal(await page.locator('#passenger-voice').isVisible(),true,
    'advanced controls remain accessible when passenger requests them');
  await page.screenshot({path:path.join(root,'test-artifacts/passenger-guidance-menu.png')});
  await page.locator('#jalan-home-menu-panel [data-menu=settings]').click();
  assert.equal(await page.locator('#passenger-setup').isVisible(),true,'Routing settings can open during guidance');
  assert.equal(await page.evaluate(()=>JalanGPS.getState().active),true,'opening settings preserves the journey');
  await page.locator('#passenger-setup-close').click();
  await page.locator('#jalan-home-menu').click();
   assert.equal(await page.locator('#passenger-traffic-toggle').getAttribute('aria-pressed'),'false',
     'OSRM / no-key Go cannot start TomTom traffic checks');
   await page.locator('#passenger-traffic-details summary').click();
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
  assert.match(await page.locator('#passenger-voice').innerText(),/Full guidance/,
    'voice button enables existing guidance engine');
  assert.match(await page.locator('#gps-voice').innerText(),/Full guidance/,
    'passenger voice control mirrors engineering state');
  await menuClick('#passenger-voice');
  await menuClick('#passenger-voice');
  assert.match(await page.locator('#passenger-voice').innerText(),/Mute/,
    'passenger voice control can mute without leaving navigation');
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
  assert.equal(await page.locator('#passenger-speed-floating').getAttribute('aria-label'),'7 kilometres per hour');
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
  const cameraPosition=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  assert.ok(Math.abs(cameraPosition[0]-3.139)<0.00002&&
    Math.abs(cameraPosition[1]-101.6869)<0.00002,
    'follow camera must keep the matched vehicle location in frame');
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
    /unverified demo report|from report to destination/i);
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
  const returned=await reportCenter();
  assert.ok(Math.abs(returned[0]-3.139)<0.00002&&Math.abs(returned[1]-101.6869)<0.00002,
    'Recenter returns to the trusted GPS position');
  await page.locator('#passenger-turn-toggle').click();
  await page.locator('#passenger-tab-directions').click();
  assert.equal(await page.locator('#passenger-tab-directions').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#passenger-maneuver-list li').count(),2,
    'Directions tab includes the actual next maneuver and destination');
  assert.match(await page.locator('#passenger-maneuver-list').innerText(),/Test segment|left|destination/i);
  await page.locator('#passenger-tab-reports').click();
  assert.equal(await page.locator('#passenger-report-list li').count(),2);
  await page.locator('#passenger-turn-close').click();
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),false);
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('#passenger-tab-reports').getAttribute('aria-selected'),'true',
    'reopened turn banner defaults back to Reports');
  await page.locator('#passenger-turn-close').click();
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),1,
    'verified GPS must create one georeferenced marker');
  assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),true,
    'upright vehicle HUD is visible only on matched GPS');
  assert.equal(await page.locator('#passenger-vehicle-screen').textContent(),'▲');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.jalan-vehicle-marker')).opacity),'0',
    'rotating map must not draw a second triangle');
  assert.equal(await page.evaluate(()=>!!locationMarker&&pointLayer.hasLayer(locationMarker)),false,
    'ongoing GPS fixes must not recreate legacy location dot in passenger mode');
  // A browser-cached 20s-old fix must revoke the previously valid vehicle
  // marker rather than appearing as current road position.
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()-20000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}});
  });
  await page.waitForFunction(()=>!document.querySelector('.jalan-vehicle-marker'),null,{timeout:1500});
  assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),false,
    'expired Safari GPS update removes the upright triangle');
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+2000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}});
  });
  await page.waitForFunction(()=>!!document.querySelector('.jalan-vehicle-marker')&&
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
    'route','slow GPS uses clearly estimated route direction, not fake compass');
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
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+2500,coords:{
      latitude:3.1391,longitude:101.6870,accuracy:8,speed:5,heading:90}});
  });
  await page.waitForTimeout(80);
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
  const stableCamera=await page.evaluate(()=>{
    const originalSet=map.setView.bind(map),originalPan=map.panTo.bind(map);
    let setCount=0,panCount=0;
    map.setView=(...args)=>{setCount++;return originalSet(...args);};
    map.panTo=(...args)=>{panCount++;return originalPan(...args);};
    const position=window.JalanGPS.getState().position;
    for(let i=0;i<3;i++){
      window.__offlineGPSWatch({timestamp:Date.now()+3900+i*100,coords:{
        latitude:position[0],longitude:position[1],accuracy:8,speed:0,heading:0}});
    }
    const result={setCount,panCount};map.setView=originalSet;map.panTo=originalPan;
    return result;
  });
  assert.deepEqual(stableCamera,{setCount:0,panCount:0},
    'stationary GPS updates must not redraw the entire route camera');
  await menuClick('#passenger-recenter');
  assert.match(await page.locator('#passenger-gesture-hint').innerText(),/Following GPS/);
  assert.equal(await page.evaluate(()=>map.getZoom()),17,
    'Recenter explicitly restores navigation zoom after exploration');
  const restored=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  assert.notDeepEqual(restored,exploreCenter,
    'Recenter returns the map to the GPS-follow target instead of keeping the dragged view');
  await menuClick('#passenger-2d');
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
  assert.equal(await page.evaluate(()=>map.getZoom()),17,'2D Recenter returns to GPS zoom');
  await menuClick('#passenger-2d');
  const headingAfterReturn=await page.evaluate(()=>({
    camera:Number.parseFloat(document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    vehicle:Number.parseFloat(document.querySelector('.jalan-vehicle-symbol').style.getPropertyValue('--jalan-vehicle-heading'))
  }));
  assert.ok(Number.isFinite(headingAfterReturn.camera)&&
    Math.abs(headingAfterReturn.camera+headingAfterReturn.vehicle)<0.02,
    'return to perspective uses last valid GPS or route-estimated heading with upright triangle');
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+4000,coords:{
      latitude:3.1391,longitude:101.6870,accuracy:180,speed:5,heading:90}});
  });
  await page.waitForTimeout(60);
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),0,
    'uncertain GPS must hide geolocated arrow rather than freeze it');
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '','uncertain GPS resets camera to north-up');
  await menuClick('#passenger-2d');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-map-flat')),true);
  await menuClick('#passenger-stop');
  assert.equal(await page.locator('.passenger-demo-report-marker').count(),0);
  assert.equal(await page.evaluate(()=>map.hasLayer(reportLayer)),true,
    'End preview restores the original map demo layer');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),false);
  assert.equal(await page.evaluate(()=>routeLayer.getLayers().filter(x=>x.options.opacity>=0.6).length),3,
    'End preview restores visible route alternatives');
  assert.equal(await page.evaluate(()=>!!startMarker&&pointLayer.hasLayer(startMarker)),true,
    'route planning start marker returns after ending preview');
  assert.equal(await page.locator('#passenger-overview').isVisible(),true);
  await page.locator('#jalan-home-menu').click();
   await page.locator('#jalan-home-menu-panel [data-menu=settings]').click();
  assert.equal(await page.locator('#passenger-setup').isVisible(),true);
  await page.locator('#passenger-use-osrm').click();
  assert.equal(await page.evaluate(()=>document.getElementById('tt-primary').checked),false);
  assert.equal(await page.locator('#passenger-overview').isVisible(),false);
  // A passenger can explicitly save a restricted key once on the same device.
  // Tests use a synthetic token; no real credentials or provider requests.
  await page.locator('#jalan-home-menu').click();
   await page.locator('#jalan-home-menu-panel [data-menu=settings]').click();
  await page.locator('#passenger-key').fill('TEST_RESTRICTED_KEY_1234');
  assert.equal(await page.locator('#passenger-remember').isChecked(),true,'key saving is enabled by default');
  await page.locator('#passenger-use-tomtom').click();
  assert.equal(await page.evaluate(()=>document.getElementById('tt-primary').checked),true);
  assert.equal(await page.evaluate(()=>!!localStorage.getItem('jalan-tomtom-key')),true,
    'Use TomTom saves the key for future visits by default');
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  assert.equal(await page.locator('#passenger-remember').isChecked(),true);
  assert.equal(await page.evaluate(()=>JalanVoice.getState().unavailable),true,'saved voice remains pending while device voices load');
  await page.evaluate(()=>{
    window.__testVoices=[{voiceURI:'test-voice-us',name:'Test English US',lang:'en-US',localService:true}];
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  assert.equal(await page.locator('#passenger-voice-choice option:checked').textContent(),'Test English US · en-US',
    'saved voice selection returns after reload and async loading');
  assert.equal(await page.evaluate(()=>!!document.getElementById('tt-key').value),true,
    'both interfaces reuse saved browser key');
  assert.match(await page.locator('#passenger-provider-status').innerText(),/no re-entry needed/);
  await page.locator('#jalan-home-menu').click();
   await page.locator('#jalan-home-menu-panel [data-menu=settings]').click();
  await page.locator('#passenger-use-tomtom').click();
  assert.equal(await page.evaluate(()=>document.getElementById('tt-primary').checked),true,
    'reuse existing browser key without entering again');
  await page.locator('#jalan-home-menu').click();
   await page.locator('#jalan-home-menu-panel [data-menu=settings]').click();
  await page.locator('#passenger-forget-key').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('jalan-tomtom-key')),null);
  assert.equal(await page.evaluate(()=>document.getElementById('tt-key').value),'');
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
      sections:[{sectionType:'TRAFFIC',startPointIndex:0,endPointIndex:1,simpleCategory:'JAM',delayInSeconds:90},
        {sectionType:'TRAFFIC',startPointIndex:1,endPointIndex:2,simpleCategory:'ROAD_WORK',delayInSeconds:60}],
      guidance:{instructions:[
        {pointIndex:0,street:'Fixture first road',roadNumbers:['E1']},
        {pointIndex:1,street:'Fixture second road',roadNumbers:['E2']}]}
    }]})});
  });
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
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
        {sectionType:'TRAFFIC',startPointIndex:0,endPointIndex:1,simpleCategory:'JAM',delayInSeconds:90},
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
  await page.waitForFunction(()=>document.getElementById('passenger-traffic-summary').dataset.state==='ready');
  assert.equal(incidentRequests,0,
    'route-linked reports do not fetch unrelated bbox Incident Details');
  assert.equal(trafficRouteRequests,0,'traffic route check waits for a trusted GPS fix');
  assert.equal(await page.locator('#jalan-home-menu-panel').isVisible(),false);
  assert.match(await page.locator('#passenger-traffic-summary').innerText(),/Route-linked traffic: 2/);
  assert.equal(await page.locator('.report-marker').count(),2,
    'two provider-defined route sections, not nearby unlinked incidents');
  assert.equal(await page.locator('#passenger-traffic-toggle').getAttribute('aria-pressed'),'true');
  const trafficLayers=()=>page.evaluate(()=>{
    let n=0;map.eachLayer(layer=>{if(String(layer._url||'').includes('/traffic/map/'))n++;});return n;
  });
  assert.equal(await trafficLayers(),0,
    'Passenger Preview hides all-road TomTom traffic tiles; coloured route lines remain separate');
  await page.locator('#passenger-turn-toggle').click();
  assert.match(await page.locator('#passenger-report-list').innerText(),/Fixture second road/);
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
  await menuClick('#passenger-traffic-details summary');
  await menuClick('#passenger-traffic-toggle');
  assert.equal(await trafficLayers(),0,'Off removes traffic colour overlay');
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),0);
  assert.equal(await page.locator('#passenger-traffic-summary').getAttribute('data-state'),'off');
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('#passenger-report-list li').count(),0);
  await page.locator('#passenger-turn-close').click();
  await page.evaluate(()=>{routes[selectedRoute].trafficSectionsCheckedAt=Date.now()-11*60*1000;});
  await menuClick('#passenger-traffic-toggle');
  await page.waitForFunction(()=>document.getElementById('passenger-traffic-summary').textContent.includes('Recalculate route'));
  assert.equal(await page.locator('.report-marker').count(),0,
    'expired route snapshot must not display stale reports');
  await menuClick('#passenger-stop');
  assert.equal(await trafficLayers(),0,'End preview removes automatic traffic layers');
  assert.equal(await page.locator('#proactive-toggle').getAttribute('aria-pressed'),'false');
  await setupTrafficRoute();
  await page.evaluate(()=>{document.getElementById('tt-key').value='';});
  const beforeMissingKey=incidentRequests;
  await page.locator('#passenger-go').click();
  assert.match(await page.locator('#passenger-traffic-summary').innerText(),/add a TomTom key/);
  assert.equal(incidentRequests,beforeMissingKey);
  assert.equal(await trafficLayers(),0);
  await page.locator('#jalan-home-menu').click();
  await menuClick('#passenger-stop');
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
    const send=(latitude,longitude,advance)=>{
      window.__detourNow+=advance;
      window.__offlineGPSWatch({timestamp:Date.now(),coords:{latitude,longitude,accuracy:8,speed:5,heading:90}});
    };
    send(3,101.6,0);
    for(let i=1;i<=6;i++)send(3.0008,101.6+i*.0001,3000);
  });
  await page.waitForFunction(()=>document.getElementById('passenger-signal-alert').textContent.includes('Recalculating route'));
  assert.equal(detourRequests,1,'Go automatically requests one route after a sustained detour');
  assert.equal(await page.locator('#passenger-signal-alert').isVisible(),true,
    'recalculation feedback is visible without opening the options menu');
  assert.equal(await page.evaluate(()=>JalanGPS.getState().active&&routes[0]===window.__detourOriginal.route),true,
    'existing journey stays active while the replacement request is pending');
  const origin=new URL(detourRequest.request().url()).pathname.split('/driving/')[1].split(';')[0].split(',').map(Number);
  assert.equal(origin[1],3.0008,'request starts at actual off-route latitude, not the snapped old road');
  await detourRequest.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[{
    duration:400,distance:1250,legs:[],geometry:{type:'LineString',coordinates:[origin,[101.61,3]]}
  }]})});
  await page.waitForFunction(()=>JalanGPS.getState().active&&JalanGPS.getState().route!==window.__detourOriginal.route);
  assert.equal(await page.evaluate(()=>destination===window.__detourOriginal.destination&&destinationMarker===window.__detourOriginal.marker),true);
  assert.equal(await page.locator('#passenger-navigation').isVisible(),true);
  assert.equal(await page.locator('#passenger-go').isVisible(),false,'new route resumes guidance without another Go');
  assert.match(await page.locator('#passenger-reroute-status').textContent(),/Route updated/);
  console.log('PASS off-route recovery: Go enables auto, sustained detour requests from real GPS, pending route retained, same destination, guidance resumes');
  await page.goto(base+'/index.html?mode=engineering',{waitUntil:'load'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-mode')),false);
  assert.equal(await page.locator('#info-panel').isVisible(),true,'original engineering dashboard retained');
  assert.equal(await page.locator('#passenger-settings-top').isVisible(),false);
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
  assert.equal(await deniedPage.locator('#passenger-remember').isChecked(),true);
  await deniedPage.locator('#jalan-home-menu').click();
   await deniedPage.locator('#jalan-home-menu-panel [data-menu=settings]').click();
  await deniedPage.locator('#passenger-key').fill('TEST_RESTRICTED_KEY_1234');
  await deniedPage.locator('#passenger-remember').check();
  await deniedPage.locator('#passenger-use-tomtom').click();
  assert.equal(await deniedPage.evaluate(()=>document.getElementById('tt-primary').checked),true,
    'page-memory key remains usable when browser blocks storage');
  assert.equal(await deniedPage.locator('#passenger-remember').isChecked(),false,
    'a denied key persistence attempt must unset remember');
  assert.match(await deniedPage.locator('#passenger-provider-status').innerText(),
    /Browser storage blocked; key not saved/);
  assert.equal(await deniedPage.evaluate(()=>document.getElementById('tt-key').value),
    'TEST_RESTRICTED_KEY_1234','key is retained only in the current page');
  await deniedPage.locator('#jalan-home-menu').click();
   await deniedPage.locator('#jalan-home-menu-panel [data-menu=settings]').click();
  await deniedPage.locator('#passenger-forget-key').click();
  assert.equal(await deniedPage.evaluate(()=>document.getElementById('tt-key').value),'',
    'Forget must still clear a page-memory key when persistent storage fails');
  await deniedPage.evaluate(()=>{
    document.getElementById('report-hazard').click();
    map.fire('click',{latlng:L.latLng(3.139,101.687)});
  });
  assert.match(await deniedPage.locator('#status').innerText(),
    /visible for this page only; browser storage unavailable/);
  assert.deepEqual(deniedErrors,[],'storage denial must not crash either TomTom or Passenger scripts');
  await deniedContext.close();
  assert.deepEqual(errors,[],'no uncaught JS errors in either UI');
  console.log('JALAN passenger 390px offline PASS: two modes, fastest, real alternatives, +minutes, Go, 2D, exit and provider fallback.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
