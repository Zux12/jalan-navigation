/* Jalan prototype — browser-only demo. No Waze data or live traffic. */
const KL = [3.139, 101.6869];
const map = L.map('map', {zoomControl:false}).setView(KL, 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);
L.control.zoom({position:'bottomright'}).addTo(map);
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const routeEl = document.getElementById('route-summary');
const markers = L.layerGroup().addTo(map);
let destinationMarker = null;
let userLocation = null;
let reportMode = null;
const reportTypes = {accident:'🚗', flood:'🌊', hazard:'⚠️', rain:'🌧️'};
const storageKey = 'jalan-demo-reports-v1';
function getReports(){try{return JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{return []}}
function showReport(r){
  const icon = L.divIcon({className:'report-marker',html:reportTypes[r.type],iconSize:[32,32],iconAnchor:[16,16]});
  L.marker([r.lat,r.lng],{icon}).addTo(markers).bindPopup(`<b>${r.type.toUpperCase()} (demo)</b><br>Unverified community report<br>${new Date(r.time).toLocaleString()}`);
}
getReports().forEach(showReport);
for(const type of Object.keys(reportTypes)){
 document.getElementById('report-'+type).addEventListener('click',()=>{
  reportMode=type;statusEl.textContent=`Tap the map where you want to report ${type}.`;
 });
}
map.on('click',e=>{
 if(!reportMode)return;
 const r={type:reportMode,lat:e.latlng.lat,lng:e.latlng.lng,time:Date.now()};
 const reports=getReports();reports.push(r);localStorage.setItem(storageKey,JSON.stringify(reports));
 showReport(r);statusEl.textContent=`Demo ${reportMode} report saved on this browser.`;reportMode=null;
});
document.getElementById('locate').addEventListener('click',()=>{
 if(!navigator.geolocation){statusEl.textContent='Geolocation is not available.';return}
 statusEl.textContent='Finding your location…';
 navigator.geolocation.getCurrentPosition(p=>{
  userLocation=[p.coords.latitude,p.coords.longitude];
  L.circleMarker(userLocation,{radius:8,color:'#fff',weight:3,fillColor:'#2563eb',fillOpacity:1}).addTo(map).bindPopup('Your approximate location');
  map.setView(userLocation,15);statusEl.textContent='Location found.';
 },()=>{statusEl.textContent='Location permission denied or unavailable.'},{enableHighAccuracy:true,timeout:12000});
});
document.getElementById('reset').addEventListener('click',()=>{map.setView(KL,12);statusEl.textContent='Map reset to Kuala Lumpur.';routeEl.classList.add('hidden')});
document.getElementById('search-form').addEventListener('submit',async e=>{
 e.preventDefault();const query=document.getElementById('destination').value.trim();if(!query)return;
 statusEl.textContent='Searching…';resultsEl.classList.add('hidden');
 try{
  // Public Nominatim is for light manual testing only: max 1 request/second, attribution required.
  const url='https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=my&q='+encodeURIComponent(query);
  const response=await fetch(url);if(!response.ok)throw new Error('Search service unavailable');
  const places=await response.json();resultsEl.innerHTML='';
  if(!places.length){statusEl.textContent='No Malaysian locations found. Try another search.';return}
  places.forEach(place=>{
   const btn=document.createElement('button');btn.textContent=place.display_name;
   btn.addEventListener('click',()=>{
    const pos=[Number(place.lat),Number(place.lon)];
    if(destinationMarker)map.removeLayer(destinationMarker);
    destinationMarker=L.marker(pos).addTo(map).bindPopup('Destination: '+place.display_name).openPopup();
    map.setView(pos,14);resultsEl.classList.add('hidden');
    routeEl.textContent='📍 Destination selected. Route calculation and live traffic will be added in the next version.';
    routeEl.classList.remove('hidden');statusEl.textContent='Destination selected.';
   });resultsEl.appendChild(btn);
  });resultsEl.classList.remove('hidden');statusEl.textContent='Choose a search result.';
 }catch(err){statusEl.textContent='Search unavailable. Please try again later.';console.error(err)}
});
