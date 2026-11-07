/* Jalan V4.1: local-only journey quality logging; no coordinates, no API key. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const KEY='jalan-v41-journeys', EVENTKEY='jalan-v41-events';
 const read=k=>{try {const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
 let journeys=read(KEY), events=read(EVENTKEY), current=null, accuracySamples=[], nearCount=0;
 const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(journeys.slice(-100)));localStorage.setItem(EVENTKEY,JSON.stringify(events.slice(-1500)));}catch(e){$('journey-status').textContent='Browser storage unavailable: export your data.';}};
 const event=(type,detail={})=>{if(!current)return;events.push({journeyId:current.id,time:new Date().toISOString(),type,...detail});events=events.slice(-1500);persist();};
 const fmt=s=>Number.isFinite(s)?(s/60).toFixed(1)+' min':'—';
 function render(){const el=$('journey-history');el.replaceChildren();const recent=journeys.slice(-5).reverse();for(const j of recent){const d=document.createElement('div');d.className='journey-row';d.textContent=`${new Date(j.start).toLocaleString()} · ${j.status} · predicted ${fmt(j.predictedSeconds)} · elapsed ${fmt(j.elapsedSeconds)} · reroutes ${j.reroutes||0} · GPS median ${j.medianAccuracyMeters??'—'} m`;el.appendChild(d);}if(!recent.length)el.textContent='No saved journeys yet.';$('journey-status').textContent=current?'Recording GPS test journey since '+new Date(current.start).toLocaleTimeString():'Saved journeys: '+journeys.length;}
 function median(a){if(!a.length)return null;const v=[...a].sort((x,y)=>x-y);return Math.round(v[Math.floor(v.length/2)]);}
 function finalize(status){if(!current)return;current.end=new Date().toISOString();current.elapsedSeconds=Math.max(0,(Date.parse(current.end)-Date.parse(current.start))/1000);current.status=status;current.medianAccuracyMeters=median(accuracySamples);current.etaErrorSeconds=status==='arrived'&&Number.isFinite(current.predictedSeconds)?current.elapsedSeconds-current.predictedSeconds:null;event(status==='arrived'?'arrival':'journey_incomplete');journeys.push(current);journeys=journeys.slice(-100);current=null;accuracySamples=[];nearCount=0;persist();render();}
 window.addEventListener('jalan:journey-start',e=>{if(current)finalize('interrupted');const d=e.detail||{};current={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),start:new Date().toISOString(),status:'active',provider:d.provider||'unknown',predictedSeconds:Number.isFinite(d.predictedSeconds)?d.predictedSeconds:null,distanceMeters:Number.isFinite(d.distanceMeters)?d.distanceMeters:null,reroutes:0,offers:0,declines:0};accuracySamples=[];nearCount=0;event('start',{provider:current.provider});render();});
 window.addEventListener('jalan:journey-stop',()=>finalize('incomplete'));
 window.addEventListener('jalan:gps-fix',e=>{if(!current)return;const d=e.detail||{};if(Number.isFinite(d.accuracy)){accuracySamples.push(Math.round(d.accuracy));if(accuracySamples.length>2000)accuracySamples.shift();if(d.accuracy>75)event('poor_gps',{accuracyMeters:Math.round(d.accuracy)});}if(d.nearDestination&&d.accuracy<=50){nearCount++;if(nearCount>=3)finalize('arrived');}else nearCount=0;});
 window.addEventListener('jalan:route-offer',e=>{if(!current)return;current.offers++;event('route_offer',{estimatedSavingSeconds:Math.round(e.detail?.estimatedSavingSeconds||0)});render();});
 window.addEventListener('jalan:route-decline',()=>{if(!current)return;current.declines++;event('route_declined');render();});
 window.addEventListener('jalan:route-change',e=>{if(!current)return;current.reroutes++;event('route_changed',{reason:e.detail?.reason||'unknown'});render();});
 const csv=(rows,fields)=>[fields.join(','),...rows.map(row=>fields.map(k=>{const v=row[k]??'';return '"'+String(v).replaceAll('"','""')+'"';}).join(','))].join('\r\n');
 function download(name,rows,fields){const blob=new Blob([csv(rows,fields)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('journey-export').onclick=()=>download('jalan-v41-journeys.csv',journeys,['id','start','end','status','provider','predictedSeconds','distanceMeters','elapsedSeconds','etaErrorSeconds','reroutes','offers','declines','medianAccuracyMeters']);
 $('journey-events-export').onclick=()=>download('jalan-v41-events.csv',events,['journeyId','time','type','provider','accuracyMeters','estimatedSavingSeconds','reason']);
 $('journey-clear').onclick=()=>{if(!confirm('Delete all locally saved Jalan journey and event logs?'))return;journeys=[];events=[];persist();render();};
 render();
})();
