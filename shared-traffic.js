/* Jalan V4.7 opt-in shared speed pilot. Never sends coordinates without user action. */
(()=>{'use strict';
const $=id=>document.getElementById(id),base='https://mterm2026.herokuapp.com/api/jalan';
let enabled=false,lastSent=0,lastPosition=null,lastAt=0,sessionId=null;
function status(s){$('shared-status').textContent=s;}
function randomId(){const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
function stop(){enabled=false;sessionId=null;$('shared-start').disabled=false;$('shared-stop').disabled=true;status('Sharing stopped. No further GPS observations will be uploaded.');}
$('shared-start').onclick=()=>{if(!window.isSecureContext){status('HTTPS is required.');return;}enabled=true;sessionId=randomId();lastPosition=null;lastAt=0;$('shared-start').disabled=true;$('shared-stop').disabled=false;status('Sharing enabled for this tab. Only accurate, moving GPS fixes are considered.');};
$('shared-stop').onclick=stop;
window.addEventListener('jalan:journey-stop',stop);
window.addEventListener('pagehide',stop);
window.addEventListener('jalan:gps-fix',async e=>{
 if(!enabled||document.hidden||Date.now()-lastSent<15000)return;
 const d=e.detail||{}; // v4.6 event lacks raw matched position; require explicit new event for position
 if(!d.matched||!Number.isFinite(d.accuracy)||d.accuracy>25||!Array.isArray(d.matchedPosition))return;
 const [lat,lon]=d.matchedPosition,now=Date.now();if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 let heading=d.heading;
 if(!Number.isFinite(heading)&&lastPosition&&now-lastAt<60000){const rad=Math.PI/180,a=lastPosition[0]*rad,b=lat*rad,delta=(lon-lastPosition[1])*rad;heading=(Math.atan2(Math.sin(delta)*Math.cos(b),Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(delta))*180/Math.PI+360)%360;}
 lastPosition=[lat,lon];lastAt=now;
 const speed=d.speedMps*3.6;if(!Number.isFinite(speed)||speed<5||speed>150||!Number.isFinite(heading))return;
 lastSent=now;
 try{const r=await fetch(base+'/observations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat,lon,speedKmh:speed,heading,accuracy:d.accuracy,sessionId}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('HTTP '+r.status);status('Sharing active. Last observation accepted at '+new Date().toLocaleTimeString());}catch(err){status('Sharing enabled, but upload failed: '+err.message);}
});
$('shared-check').onclick=async()=>{const s=window.JalanGPS?.getState?.(),p=s?.position;if(!p){status('Start GPS navigation to check traffic near your location.');return;}try{const r=await fetch(base+'/traffic?lat='+encodeURIComponent(p[0])+'&lon='+encodeURIComponent(p[1]),{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();status('Nearby pilot grid groups with 3+ contributors: '+data.segments.length+'. These are not road-matched traffic jams.');}catch(e){status('Traffic lookup failed: '+e.message);}};
})();
