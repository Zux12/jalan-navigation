/* Passenger rendering adapter: Leaflet retains route/GPS state; MapLibre draws
   the same coordinates. No routing, traffic-feed or GPS-confidence changes. */
(() => {
 'use strict';
 const params=new URLSearchParams(location.search);
 if(params.get('mode')!=='passenger'||params.get('renderer')==='raster'||window.JalanLaunch?.basicOnly)return;
 const host=map.getContainer(),original={},virtualTiles=new Set(),pins=new Map(),rasters=new Map();
 const watched=new WeakSet(),handlers=[],zoomSnap=map.options.zoomSnap;
 let gl=null,active=false,stopped=false,queued=false,syncing=false,lineSignature='',trafficSignature='',trafficFeatureCount=0,timer,popup=null,popupLayer=null;
 const status=document.createElement('button');
 status.type='button';status.disabled=true;status.id='jalan-map-status';status.setAttribute('aria-live','polite');
 status.addEventListener('click',fallback);
 status.textContent='Loading detailed map…';document.body.append(status);
 const container=document.createElement('div');container.id='jalan-vector-map';host.append(container);
 // Native events belong to MapLibre; the parent Leaflet container would
 // otherwise emit a second click using its flat, hidden map projection.
 L.DomEvent.disableClickPropagation(container);L.DomEvent.disableScrollPropagation(container);
 const methods=['setView','panTo','panBy','fitBounds','setZoom','zoomIn','zoomOut',
   'stop','invalidateSize','getBounds','addLayer','removeLayer','hasLayer','eachLayer'];
 methods.forEach(name=>{original[name]=map[name].bind(map);});
 const lngLat=value=>{const p=L.latLng(value);return [p.lng,p.lat];};
 const emit=()=>window.dispatchEvent(new CustomEvent('jalan:map-renderer',{detail:{active}}));
 const schedule=()=>{
   if(!active||queued)return;queued=true;
   requestAnimationFrame(()=>{queued=false;if(active)syncLayers();});
 };
 function watch(layer){
   if(watched.has(layer))return;watched.add(layer);
   ['setLatLng','setLatLngs','setStyle','setIcon','setUrl','bindPopup','bindTooltip'].forEach(name=>{
     if(typeof layer[name]!=='function')return;
     const fn=layer[name];layer[name]=function(...args){const result=fn.apply(this,args);schedule();return result;};
   });
   if(typeof layer.openPopup==='function'){
     const open=layer.openPopup,close=layer.closePopup;
     layer.openPopup=function(position){
       if(!active)return open.call(this,position);
       const content=this.getPopup?.()?.getContent();
       if(content!==undefined&&this.getLatLng){
         popup?.remove();popupLayer=this;
         popup=new maplibregl.Popup({maxWidth:'250px'}).setLngLat(lngLat(position||this.getLatLng()))
           .setDOMContent(popupContent(content)).addTo(gl);
       }
       return this;
     };
     layer.closePopup=function(){
       if(!active)return close.call(this);
       if(popupLayer===this){popup?.remove();popup=null;popupLayer=null;}return this;
     };
   }
 }
 function syncCamera(){
   if(!active||syncing)return;
   const center=gl.getCenter(),zoom=gl.getZoom()+1,latlng=L.latLng(center.lat,center.lng);
   // A pure bearing or pitch change already belongs to the native renderer.
   if(map.getZoom()===zoom&&map.getCenter().equals(latlng,1e-12))return;
   syncing=true;
   // reset:true avoids Leaflet's setView -> this.panBy optimization calling
   // back into the native camera and applying the movement a second time.
   try{original.setView(latlng,zoom,{animate:false,reset:true});}
   finally{syncing=false;}
 }
 function fallback(){
   if(stopped)return;stopped=true;clearTimeout(timer);active=false;
   document.body.classList.remove('passenger-vector-active');
   // Restore the exact logical layers, including a currently enabled traffic map.
   methods.forEach(name=>{map[name]=original[name];});
   map.options.zoomSnap=zoomSnap;
   virtualTiles.forEach(layer=>original.addLayer(layer));virtualTiles.clear();
   handlers.forEach(handler=>handler.enable());
   pins.forEach(pin=>{pin.marker.remove();pin.label?.remove();});pins.clear();
   if(gl){gl.remove();gl=null;}popup=null;popupLayer=null;container.remove();
   trafficFeatureCount=0;status.disabled=true;status.textContent='Basic map · detailed view unavailable';
   original.invalidateSize({animate:false});emit();
 }
 window.JalanVectorMap={
   get active(){return active;},
   requestFrame(){if(active)gl.triggerRepaint();},
   getMarkerElement(layer){return pins.get(L.stamp(layer))?.marker.getElement();},
   project(position){return active?gl.project(lngLat(position)):null;},
   unproject(x,y){const p=active&&gl.unproject([x,y]);return p?[p.lat,p.lng]:null;},
   getBearing(){return active?gl.getBearing():0;},
   getPitch(){return active?gl.getPitch():0;},
   setCamera(options){if(active)gl.jumpTo(options);},
   getReportRoad(position,heading){
     try{
     const P=window.JalanReportModel;if(!active||!P||!P.coord(position)||!P.heading(heading))return null;
     const layers=gl.getStyle().layers.filter(l=>l.type==='line'&&l['source-layer']==='transportation').map(l=>l.id);
     if(!layers.length)return null;
     const point=gl.project(lngLat([position[1],position[0]])),seen=new Set(),candidates=[];
     for(const feature of gl.queryRenderedFeatures([[point.x-45,point.y-45],[point.x+45,point.y+45]],{layers})){
       const p=feature.properties||{};if(!['motorway','trunk','primary','secondary','tertiary','minor','service','residential','unclassified','living_street'].includes(p.class))continue;
       const lines=feature.geometry.type==='LineString'?[feature.geometry.coordinates]:feature.geometry.type==='MultiLineString'?feature.geometry.coordinates:[];
       for(const line of lines){const match=P.project(position,line);if(!match||match.offset>20||Math.min(P.delta(match.heading,heading),P.delta((match.heading+180)%360,heading))>40)continue;
         const level=String(p.layer??0)+':'+String(p.brunnel||'surface');
         const raw=String(p.osm_id??feature.id??JSON.stringify(line))+'|'+p.class+'|'+level;
         let hash=2166136261;for(let i=0;i<raw.length;i++)hash=Math.imul(hash^raw.charCodeAt(i),16777619);
         const key='vector-'+(hash>>>0).toString(16);if(seen.has(key))continue;seen.add(key);candidates.push({key,level,offset:match.offset});
       }
     }
     candidates.sort((a,b)=>a.offset-b.offset);
     // Ambiguous parallel/crossing roads remain unmatched rather than guessed.
     if(!candidates.length||(candidates[1]&&candidates[1].offset-candidates[0].offset<5))return null;
     return {key:candidates[0].key,level:candidates[0].level};
     }catch{return null;}
   },
   nearbyRoads(position,origin=position){
     if(!active)return null;
     const layers=gl.getStyle().layers.filter(l=>l.type==='line'&&l['source-layer']==='transportation').map(l=>l.id);
     if(!layers.length)return null;
     const a=gl.project(lngLat(position)),b=gl.project(lngLat(origin));
     const bounds=[[Math.min(a.x,b.x)-100,Math.min(a.y,b.y)-100],[Math.max(a.x,b.x)+100,Math.max(a.y,b.y)+100]];
     if(bounds[1][0]-bounds[0][0]>700||bounds[1][1]-bounds[0][1]>700)return null;
     const seen=new Set(),roads=[];
     for(const f of gl.queryRenderedFeatures(bounds,{layers})){
       const p=f.properties||{};
       if(!['motorway','trunk','primary','secondary','tertiary','minor','service','residential','unclassified','living_street'].includes(p.class))continue;
       const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.type==='MultiLineString'?f.geometry.coordinates:[];
       for(const coordinates of lines){
         const key=JSON.stringify(coordinates);if(seen.has(key))continue;seen.add(key);
         roads.push({coordinates,layer:p.layer,bridge:p.brunnel==='bridge',tunnel:p.brunnel==='tunnel'});
         if(roads.length>=80)return roads;
       }
     }return roads.length||gl.areTilesLoaded()?roads:null;
   },
   // Read-only diagnostic snapshot, without tile URLs, keys or stored locations.
   getState(){
     const layers=active?gl.getStyle().layers.map(x=>x.id):[];
     return {active,pitch:active?gl.getPitch():0,bearing:active?gl.getBearing():0,
       zoom:active?gl.getZoom()+1:null,markers:pins.size,trafficLayers:rasters.size,
       selectedTrafficSegments:active?trafficFeatureCount:0,
       trafficAboveRoute:active&&layers.indexOf('jalan-selected-traffic-lines')>
         layers.indexOf('jalan-route-lines')};
   },
   useBasicMap:fallback
 };
 function installCamera(){
   map.setView=(position,zoom=map.getZoom())=>{
     if(syncing)return original.setView(position,zoom,{animate:false,reset:true});
     gl.jumpTo({center:lngLat(position),zoom:zoom-1});return map;
   };
   map.panTo=position=>{gl.jumpTo({center:lngLat(position)});return map;};
   map.setZoom=zoom=>{gl.jumpTo({zoom:zoom-1});return map;};
   map.zoomIn=(delta=1)=>map.setZoom(map.getZoom()+delta);
   map.zoomOut=(delta=1)=>map.setZoom(map.getZoom()-delta);
   map.panBy=offset=>{gl.panBy([offset.x??offset[0],offset.y??offset[1]],{duration:0});return map;};
   map.stop=()=>{gl.stop();return map;};
   map.fitBounds=(bounds,options={})=>{
     const b=L.latLngBounds(bounds),pad=L.point(options.padding||[0,0]);
     const a=L.point(options.paddingTopLeft||pad),z=L.point(options.paddingBottomRight||pad);
     gl.fitBounds([[b.getWest(),b.getSouth()],[b.getEast(),b.getNorth()]],{
       padding:{top:a.y,bottom:z.y,left:a.x,right:z.x},maxZoom:(options.maxZoom||19)-1,
       pitch:0,bearing:0,duration:0});return map;
   };
   map.getBounds=()=>{const b=gl.getBounds();return L.latLngBounds([b.getSouth(),b.getWest()],[b.getNorth(),b.getEast()]);};
   map.invalidateSize=options=>{original.invalidateSize(options);gl.resize();return map;};
   gl.on('move',syncCamera);
   gl.on('render',()=>{if(active)window.dispatchEvent(new Event('jalan:vector-render'));});
   // Only physical gestures suspend GPS follow; programmatic camera changes do not.
   ['dragstart','zoomstart','rotatestart','pitchstart'].forEach(event=>gl.on(event,e=>{
     if(e.originalEvent)window.dispatchEvent(new Event('jalan:vector-gesture'));
   }));
   ['dragend','zoomend','rotateend','pitchend'].forEach(event=>gl.on(event,e=>{
     if(e.originalEvent)window.dispatchEvent(new Event('jalan:vector-gesture-end'));
   }));
   gl.on('click',event=>{
     if(window.JalanPassengerRouteInfo?.close())return;
     const hit=gl.queryRenderedFeatures(event.point,{layers:['jalan-route-lines']})[0];
     const layer=hit&&map._layers[hit.properties.leafletId];
     const data={latlng:L.latLng(event.lngLat.lat,event.lngLat.lng),originalEvent:event.originalEvent};
     if(layer)layer.fire('click',data);else map.fire('click',data);
   });
   ['dragging','touchZoom','doubleClickZoom','scrollWheelZoom','boxZoom','keyboard'].forEach(name=>{
     if(map[name]?.enabled()){handlers.push(map[name]);map[name].disable();}
   });
 }
 function installTiles(){
   // Hidden Leaflet tiles must not fetch a second copy underneath the vector map.
   map.addLayer=layer=>{
     if(layer instanceof L.TileLayer){virtualTiles.add(layer);watch(layer);schedule();return map;}
     return original.addLayer(layer);
   };
   map.removeLayer=layer=>{
     if(virtualTiles.delete(layer)){schedule();return map;}return original.removeLayer(layer);
   };
   map.hasLayer=layer=>virtualTiles.has(layer)||original.hasLayer(layer);
   map.eachLayer=(fn,context)=>{original.eachLayer(fn,context);virtualTiles.forEach(layer=>fn.call(context,layer));return map;};
   const tiles=[];original.eachLayer(layer=>{if(layer instanceof L.TileLayer)tiles.push(layer);});
   tiles.forEach(layer=>{original.removeLayer(layer);virtualTiles.add(layer);watch(layer);});
 }
 function popupContent(content){
   if(content instanceof HTMLElement)return content.cloneNode(true);
   const node=document.createElement('div');
   // Existing Leaflet string popups contain small markup. Display plain text;
   // never promote third-party report strings into executable map HTML.
   const doc=new DOMParser().parseFromString(String(content??''),'text/html');
   node.textContent=doc.body.textContent;return node;
 }
 function pinFor(layer,id){
   const o=layer.options,icon=o.icon;
   if(icon?.options.className?.includes('jalan-vehicle-marker'))return;
   if(o.opacity===0&&(!('fillOpacity'in o)||o.fillOpacity===0)){
     const previous=pins.get(id);previous?.marker.remove();previous?.label?.remove();pins.delete(id);return;
   }
   const signature=JSON.stringify(icon?icon.options:{radius:o.radius,color:o.color,fillColor:o.fillColor,
     fillOpacity:o.fillOpacity,weight:o.weight,className:o.className});
   let pin=pins.get(id);
   if(pin&&pin.signature!==signature){pin.marker.remove();pin.label?.remove();pins.delete(id);pin=null;}
   if(!pin){
     const element=document.createElement('div');element.className='jalan-vector-pin';
     let offset=[0,0];
     if(icon){
       const node=icon.createIcon();node.style.margin='0';node.style.position='relative';node.style.transform='none';
       element.append(node);
       const size=L.point(icon.options.iconSize||[25,41]),anchor=L.point(icon.options.iconAnchor||[size.x/2,size.y/2]);
       offset=[size.x/2-anchor.x,size.y/2-anchor.y];
     }else{
       const radius=o.radius||6;element.style.cssText='width:'+radius*2+'px;height:'+radius*2+
         'px;border-radius:50%;background:'+(o.fillColor||o.color||'#167de5')+';border:'+(o.weight||2)+'px solid '+(o.color||'#fff');
       if(o.className)element.classList.add(...o.className.split(' ').filter(Boolean));
     }
     element.style.opacity=String(o.opacity??1);
     const vehiclePin=icon?.options.className==='passenger-startup-pin'||o.className==='jalan-vehicle-accuracy';
     const marker=new maplibregl.Marker({element,anchor:'center',offset,subpixelPositioning:vehiclePin})
       .setLngLat(lngLat(layer.getLatLng())).addTo(gl);
     if(vehiclePin)gl.triggerRepaint();
     if(o.interactive!==false){
       element.setAttribute('role','button');
       element.setAttribute('aria-label',o.title||'Map location');
       if(o.keyboard!==false){
         element.tabIndex=0;
         element.addEventListener('keydown',event=>{
           if(event.key==='Enter'||event.key===' '){event.preventDefault();element.click();}
         });
       }
       element.addEventListener('click',event=>{
         event.stopPropagation();layer.fire('click',{latlng:layer.getLatLng(),originalEvent:event});
       });
     }else element.style.pointerEvents='none';
     pin={marker,signature};pins.set(id,pin);
   }
   pin.marker.setLngLat(lngLat(layer.getLatLng()));
   const tooltip=layer.getTooltip?.();
   if(tooltip?.options.permanent){
     if(!pin.label)pin.label=new maplibregl.Popup({closeButton:false,closeOnClick:false,anchor:'bottom',offset:18,
       className:'jalan-vector-report-label'}).setLngLat(lngLat(layer.getLatLng()))
         .setDOMContent(popupContent(tooltip.getContent())).addTo(gl);
     pin.label.setLngLat(lngLat(layer.getLatLng()));
   }else if(pin.label){pin.label.remove();pin.label=null;}
 }
 function syncLayers(){
   const features=[],trafficFeatures=[],stopFeatures=[],travelledFeatures=[],seen=new Set(),tileIds=new Set();
   original.eachLayer(layer=>{
     watch(layer);const id=L.stamp(layer);
     if(layer instanceof L.Polyline&&layer.options.opacity!==0){
       const opt=layer.options,classes=opt.className?.split(' ')||[];
       const isTravelled=classes.includes('jalan-travelled-route'),isTraffic=classes.includes('jalan-selected-traffic-colour');
       const output=isTravelled?travelledFeatures:classes.includes('jalan-stop-route')?stopFeatures:isTraffic?trafficFeatures:features;
       const feature=layer.toGeoJSON(opt.jalanRouteScale?false:6);
       feature.properties={leafletId:id,color:opt.color||'#087af5',width:opt.weight||5,
         routeScale:opt.jalanRouteScale||0,opacity:opt.opacity??1};
       output.push(feature);
     }else if(layer instanceof L.Marker||layer instanceof L.CircleMarker){seen.add(id);pinFor(layer,id);}
   });
   pins.forEach((pin,id)=>{if(!seen.has(id)){pin.marker.remove();pin.label?.remove();pins.delete(id);}});
   if(popupLayer&&!original.hasLayer(popupLayer)){popup?.remove();popup=null;popupLayer=null;}
   const signature=JSON.stringify(features);
   if(signature!==lineSignature){lineSignature=signature;gl.getSource('jalan-routes').setData({type:'FeatureCollection',features});}
   trafficFeatures.push(...stopFeatures,...travelledFeatures);
   const coloredSignature=JSON.stringify(trafficFeatures);
   if(coloredSignature!==trafficSignature){
     trafficSignature=coloredSignature;trafficFeatureCount=trafficFeatures.length;
     gl.getSource('jalan-selected-traffic').setData({type:'FeatureCollection',features:trafficFeatures});
   }
   virtualTiles.forEach(layer=>{
     // Replace only the base map. Preserve the existing TomTom flow overlay.
     if(!layer._url?.startsWith('https://api.tomtom.com/traffic/map/'))return;
     const id='jalan-traffic-'+L.stamp(layer);tileIds.add(id);
     if(!rasters.has(id)){
       gl.addSource(id,{type:'raster',tiles:[layer._url],tileSize:256,maxzoom:layer.options.maxNativeZoom||18,
         attribution:'Traffic © TomTom'});
       gl.addLayer({id,source:id,type:'raster',paint:{'raster-opacity':layer.options.opacity??.82,
         'raster-fade-duration':0}},'jalan-route-casing');
       rasters.set(id,{layer,url:layer._url});
     }else if(rasters.get(id).url!==layer._url){
       gl.getSource(id).setTiles([layer._url]);rasters.get(id).url=layer._url;
     }
   });
   rasters.forEach((entry,id)=>{if(!tileIds.has(id)){gl.removeLayer(id);gl.removeSource(id);rasters.delete(id);}});
 }
 function broaderRoadWidth(value){
   const scale=width=>typeof width==='number'?width*1.5:['*',width,1.5];
   if(typeof value==='number')return scale(value);
   // Keep zoom expressions outermost; scaling the entire expression is invalid.
   if(Array.isArray(value)&&['interpolate','step'].includes(value[0])){
     const first=value[0]==='interpolate'?4:2;
     return value.map((part,index)=>index>=first&&index%2===0?scale(part):part);
   }
   if(value?.stops)return {...value,stops:value.stops.map(([zoom,width])=>[zoom,scale(width)])};
   return value;
 }
 // Zoom is evaluated by the renderer during pinch/fly animations, without
 // rebuilding route geometry. Non-route overlays keep their own pixel widths.
 function lineWidth(outline=0){
   const stops=window.JalanRouteDisplay.widthStops.flatMap(([zoom,pixels])=>[
     zoom-1,['+',outline,['case',['>', ['get','routeScale'],0],
       ['*',pixels,['get','routeScale']],['get','width']]]
   ]);
   return ['interpolate',['linear'],['zoom'],...stops];
 }
 function styleMap(){
   // A light, quiet road map. Provider attribution remains in the source metadata.
   const layers=gl.getStyle().layers;
   layers.forEach(layer=>{
     if(layer.type==='line'&&layer['source-layer']==='transportation'&&
       /^(highway_(minor|major|motorway)|tunnel_motorway)/.test(layer.id)){
       // Widen the road surface and its casing together, including bridges/tunnels.
       for(const property of ['line-width','line-gap-width']){
         const width=layer.paint?.[property];
         if(width!==undefined)gl.setPaintProperty(layer.id,property,broaderRoadWidth(width));
       }
     }
     if(layer.type==='background')gl.setPaintProperty(layer.id,'background-color','#f5f3ee');
     if(layer.type==='fill'&&layer['source-layer']==='water')gl.setPaintProperty(layer.id,'fill-color','#b4e0ec');
     if(layer.type==='fill'&&layer['source-layer']==='park')gl.setPaintProperty(layer.id,'fill-color','#d5e8cb');
     if(layer.type==='fill'&&['landcover','landuse'].includes(layer['source-layer'])){
       const color=gl.getPaintProperty(layer.id,'fill-color')||'#eeece7';
       gl.setPaintProperty(layer.id,'fill-color',['match',['get','class'],
         ['wood','grass','grassland','park','recreation_ground'],'#dcead4',color]);
     }
     if(layer.type==='fill'&&layer['source-layer']==='building')gl.setPaintProperty(layer.id,'fill-color','#e1dfda');
   });
   const building=layers.find(layer=>layer['source-layer']==='building');
   const labels=layers.find(layer=>layer.type==='symbol');
   if(building)gl.addLayer({id:'jalan-buildings',type:'fill-extrusion',source:building.source,
     'source-layer':'building',minzoom:15,filter:['all',['has','render_height'],['!=',['get','hide_3d'],true]],
     paint:{'fill-extrusion-color':'#dedcd6','fill-extrusion-opacity':.6,
       'fill-extrusion-height':['coalesce',['get','render_height'],0],
       'fill-extrusion-base':['coalesce',['get','render_min_height'],0]}},labels?.id);
   gl.addSource('jalan-routes',{type:'geojson',maxzoom:20,tolerance:0,data:{type:'FeatureCollection',features:[]}});
   gl.addLayer({id:'jalan-route-casing',type:'line',source:'jalan-routes',layout:{'line-cap':'round','line-join':'round'},
     paint:{'line-color':'#ffffff','line-width':lineWidth(2),'line-opacity':['get','opacity']}});
   gl.addLayer({id:'jalan-route-lines',type:'line',source:'jalan-routes',
     layout:{'line-cap':'round','line-join':'round','line-sort-key':['get','opacity']},
     paint:{'line-color':['get','color'],'line-width':lineWidth(),'line-opacity':['get','opacity']}});
   // Dedicated TOP layers guarantee coloured segments replace the blue line
   // on identical road geometry. Never let base line-sort-key bury them.
   gl.addSource('jalan-selected-traffic',{type:'geojson',maxzoom:20,tolerance:0,
     data:{type:'FeatureCollection',features:[]}});
   gl.addLayer({id:'jalan-selected-traffic-casing',type:'line',source:'jalan-selected-traffic',
     layout:{'line-cap':'round','line-join':'round'},
     paint:{'line-color':'#ffffff','line-width':lineWidth(2),'line-opacity':['get','opacity']}});
   gl.addLayer({id:'jalan-selected-traffic-lines',type:'line',source:'jalan-selected-traffic',
     layout:{'line-cap':'round','line-join':'round'},
     paint:{'line-color':['get','color'],'line-width':lineWidth(),
       'line-opacity':['get','opacity']}});
 }
 function dependency(tag,url,integrity){return new Promise((resolve,reject)=>{
   const node=document.createElement(tag);node.crossOrigin='anonymous';node.integrity=integrity;
   if(tag==='script'){node.src=url;node.async=true;}else{node.rel='stylesheet';node.href=url;}
   node.onload=resolve;node.onerror=reject;document.head.append(node);
 });}
 async function boot(){
   timer=setTimeout(fallback,20000);
   try{
     await Promise.all([
       dependency('script','https://unpkg.com/maplibre-gl@5.15.0/dist/maplibre-gl.js',
         'sha384-YhF9vhIfvucb/wOyTQ2aaSCaHO3Tzp/lb74ZMq7t2VBHZfrW3+FojKSxIEVynxN8'),
       dependency('link','https://unpkg.com/maplibre-gl@5.15.0/dist/maplibre-gl.css',
         'sha384-mnM9NG1099tBMNxdDQNDKIxYcn/fmqQXFJvbT5l1MsrWvzfxBEffceBsw75/cW2R')]);
     if(stopped)return;
     // MapLibre 5 has no public supported() probe. Its constructor performs
     // context creation; an unsupported device reaches the guarded fallback.
     const center=map.getCenter();
     gl=new maplibregl.Map({container,style:'https://tiles.openfreemap.org/styles/positron',
       center:[center.lng,center.lat],zoom:map.getZoom()-1,minZoom:2,maxZoom:19,maxPitch:60,
       maxTileCacheSize:96,pixelRatio:Math.min(window.devicePixelRatio||1,2),
       attributionControl:{compact:false},canvasContextAttributes:{antialias:true}});
     gl.on('error',event=>{
       if(event.sourceId&&rasters.has(event.sourceId))rasters.get(event.sourceId).layer.fire('tileerror');
       else if(active){
         // A style can load successfully before later tile/glyph requests fail.
         // Keep an accessible escape from the native canvas for that outage.
         status.disabled=false;status.textContent='Map details unavailable · Use basic map';
       }
     });
     gl.on('webglcontextlost',fallback);
     gl.once('load',()=>{
       if(stopped)return;
       try{
         styleMap();
         const latest=map.getCenter();gl.jumpTo({center:[latest.lng,latest.lat],zoom:map.getZoom()-1});
         active=true;map.options.zoomSnap=0;
         installCamera();installTiles();
         map.on('layeradd layerremove',schedule);
         document.body.classList.add('passenger-vector-active');
         gl.resize();syncLayers();syncCamera();clearTimeout(timer);
         status.textContent='';emit();
         // Show source credits on initial load, then collapse them completely.
         // Full linked data credits remain in the same-page menu About dialog.
         const credit=container.querySelector('.maplibregl-ctrl-attrib');
         let creditTouched=false;
         credit?.addEventListener('pointerdown',()=>{creditTouched=true;});
         credit?.addEventListener('keydown',()=>{creditTouched=true;});
         setTimeout(()=>{
           if(active&&!creditTouched&&!credit?.contains(document.activeElement)&&credit)
             credit.style.display='none';
         },5500);
       }catch{fallback();}
     });
   }catch{fallback();}
 }
 boot();
})();
