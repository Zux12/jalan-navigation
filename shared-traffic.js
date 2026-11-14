/* Jalan V4.7.4 — opt-in low-speed traffic pilot. No sharing without explicit consent. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const base='https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan';
let enabled=false,lastSent=0,lastPosition=null,lastAt=0,sessionId=null,pending=false,lastStatusAt=0;
const rad=Math.PI/180;
function status(s,force=false){const now=Date.now();if(force||now-lastStatusAt>4500){$('shared-status').textContent=s;lastStatusAt=now;}}
function randomId(){const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
function stop(){enabled=false;sessionId=null;lastPosition=null;lastAt=0;$('shared-start').disabled=false;$('shared-stop').disabled=true;status('Sharing stopped. No further GPS observations will be uploaded.',true);}
function distance(a,b){const dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;const q=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(q)));}
function bearing(a,b){const d=(b[1]-a[1])*rad,x=Math.sin(d)*Math.cos(b[0]*rad),y=Math.cos(a[0]*rad)*Math.sin(b[0]*rad)-Math.sin(a[0]*rad)*Math.cos(b[0]*rad)*Math.cos(d);return (Math.atan2(x,y)/rad+360)%360;}
$('shared-start').onclick=()=>{if(!window.isSecureContext){status('HTTPS is required.',true);return;}enabled=true;sessionId=randomId();lastPosition=null;lastAt=0;lastSent=0;$('shared-start').disabled=true;$('shared-stop').disabled=false;status('Sharing enabled. Waiting for a reliable GPS fix; low-speed traffic is accepted.',true);};
$('shared-stop').onclick=stop;
window.addEventListener('jalan:journey-stop',stop);
window.addEventListener('pagehide',stop);
window.addEventListener('jalan:gps-fix',async e=>{
 if(!enabled||document.hidden||pending||Date.now()-lastSent<15000)return;
 const d=e.detail||{};
 if(!d.matched||!Array.isArray(d.matchedPosition)||!Number.isFinite(d.accuracy)||d.accuracy>25){status('Waiting for reliable route-matched GPS (accuracy 25 m or better).');return;}
 const [lat,lon]=d.matchedPosition,now=Date.now();
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){status('Waiting for valid GPS coordinates.');return;}
 const previous=lastPosition,elapsed=lastAt?(now-lastAt)/1000:0;
 const moved=previous&&elapsed>=3&&elapsed<=90?distance(previous,[lat,lon]):null;
 const calculatedSpeed=moved!==null?moved/elapsed*3.6:null;
 const reportedSpeed=typeof d.speedMps==='number'&&Number.isFinite(d.speedMps)&&d.speedMps>=0?d.speedMps*3.6:null;
 // Prefer device speed. If absent, use consecutive accurate route-matched fixes.
 const speed=reportedSpeed!==null?reportedSpeed:calculatedSpeed;
 let heading=typeof d.heading==='number'&&Number.isFinite(d.heading)?d.heading:null;
 if(heading===null&&moved!==null&&moved>=5)heading=bearing(previous,[lat,lon]);
 lastPosition=[lat,lon];lastAt=now;
 if(speed===null){status('Waiting for a second GPS fix to estimate speed.');return;}
 if(speed>150||(calculatedSpeed!==null&&calculatedSpeed>180)){status('GPS jump or implausible speed detected; observation skipped.');return;}
 // 1–5 km/h is useful congestion evidence. Near-zero speed needs actual movement evidence.
 if(speed<1&&!(moved!==null&&moved>=5&&elapsed<=60)){status('Vehicle appears stationary; waiting for evidence of road movement.');return;}
 if(heading===null){status('Waiting for travel direction; keep GPS navigation active.');return;}
 const token=sessionId;
 pending=true;
 try{
  const r=await fetch(base+'/observations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat,lon,speedKmh:Math.max(0,Math.min(150,speed)),heading:((heading%360)+360)%360,accuracy:d.accuracy,sessionId:token}),signal:AbortSignal.timeout(8000)});
  if(!r.ok){let reason='HTTP '+r.status;try{const data=await r.json();if(data.error)reason+=': '+data.error;}catch{}throw Error(reason);}
  if(enabled&&sessionId===token){lastSent=Date.now();status('Sharing active. Last observation accepted at '+new Date().toLocaleTimeString()+'. Speed '+speed.toFixed(1)+' km/h.',true);}
 }catch(err){if(enabled&&sessionId===token)status('Upload failed: '+err.message,true);}finally{pending=false;}
});
// The opt-in shared observation POST is a separate, existing feature.
// Nearby GET lookup exposes the live GPS fix in Heroku router URL logs while
// shared-Mterms query redaction is disabled. Hold only the GET lookup pending
// operator-verified redaction or a reviewed body-only replacement.
const nearbyLookupPrivacyHold=true;
if(nearbyLookupPrivacyHold){
 $('shared-check').disabled=true;
 $('shared-check').textContent='Nearby lookup paused';
}else{
 $('shared-check').onclick=async()=>{const s=window.JalanGPS?.getState?.(),p=s?.position;if(!p){status('Start GPS navigation to check traffic near your location.',true);return;}try{const r=await fetch(base+'/traffic?lat='+encodeURIComponent(p[0])+'&lon='+encodeURIComponent(p[1]),{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();status('Nearby pilot grid groups with 3+ contributors: '+(Array.isArray(data.segments)?data.segments.length:0)+'. These are not road-matched traffic jams.',true);}catch(e){status('Traffic lookup failed: '+e.message,true);}};
}
})();
