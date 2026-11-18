'use strict';
let streetMap=null,tileTimer,geoSelected='tura',geoStarted=false;
const geoPoints={tura:[-26,29],bridge:[18,-13],cats:[16,-8],bulvar:[16,23]};
function styleGeo(g){return g.node!==null && activeAt(g.node).length?'#c42871':'#237f73';}
function selectGeo(id,pan=true){
 const g=V4_GEO.find(x=>x.id===id);if(!g)return;geoSelected=id;
 document.querySelectorAll('[data-v4-loc]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v4Loc===id)));
 $('geo-detail').innerHTML='<strong>'+escapeHtml(g.name)+'</strong><span>'+g.lat.toFixed(6)+'° с. ш. · '+g.lng.toFixed(6)+'° в. д.</span><p>'+(g.node===null?'Географический ориентир.':'Открытых учебных обращений на участке — '+activeAt(g.node).length+'.')+'</p><a href="'+escapeHtml(g.source)+'" target="_blank" rel="noopener noreferrer">Источник координат ↗</a>';
 if(streetMap&&pan)streetMap.setView([g.lat,g.lng],15);else if(!streetMap&&geoStarted)drawScheme();
}
function drawScheme(){
 const pins=V4_GEO.map((g,i)=>{
  const x=350+(g.lng-65.53)*19200*Math.cos(57.158*Math.PI/180),y=196-(g.lat-57.158)*19200,[dx,dy]=geoPoints[g.id];
  return `<g class="geo-pin" data-pin="${g.id}" tabindex="0" role="button" aria-label="${escapeHtml(g.name)}"><circle cx="${x}" cy="${y}" r="17" fill="${styleGeo(g)}" opacity="${g.id===geoSelected?.25:.10}"/><circle cx="${x}" cy="${y}" r="8" fill="${styleGeo(g)}" stroke="white" stroke-width="3"/><text x="${x+dx}" y="${y+dy}" text-anchor="${dx<0?'end':'start'}">${escapeHtml(g.name)}</text></g>`;
 }).join('');
 $('v4-osm-map').innerHTML=''+`<svg class="geo-svg" viewBox="0 0 700 390" role="group" aria-label="Расположение ориентиров по координатам"><defs><pattern id="geogrid" width="45" height="45" patternUnits="userSpaceOnUse"><path d="M45 0H0V45" stroke="#c2d8df" fill="none"/></pattern></defs><rect width="700" height="390" fill="#e6eff1"/><rect width="700" height="390" fill="url(#geogrid)"/><text x="24" y="34" class="geo-grid-label">ТЮМЕНЬ · 57° С. Ш.</text><text x="654" y="35">↑ С</text>${pins}<text x="24" y="369" class="geo-grid-label">КООРДИНАТНАЯ СХЕМА</text></svg>`;
}
function v4RenderLocations(){
 $('v4-location-list').innerHTML=V4_GEO.map(g=>'<button type="button" class="v4-place" data-v4-loc="'+g.id+'"><span class="v4-place-dot" style="background:'+styleGeo(g)+'"></span><span><b>'+escapeHtml(g.name)+'</b><small>'+g.lat.toFixed(4)+'°, '+g.lng.toFixed(4)+'°</small></span><span>↗</span></button>').join('');
 selectGeo(geoSelected,false);
}
function switchMap(streets,reason){
 clearTimeout(tileTimer);if(streetMap){streetMap.remove();streetMap=null;}
 $('geo-streets').setAttribute('aria-pressed',String(streets));$('geo-scheme').setAttribute('aria-pressed',String(!streets));
 const status=$('geo-status');
 if(!streets||!window.L){status.textContent=reason||'Офлайн-схема по координатам';drawScheme();return;}
 try{
  $('v4-osm-map').replaceChildren();streetMap=L.map('v4-osm-map',{scrollWheelZoom:false}).fitBounds(V4_GEO.map(g=>[g.lat,g.lng]),{padding:[38,38]});const map=streetMap;
  status.textContent='Загружаем улицы…';let loaded=false;
  function fallback(){if(!loaded&&streetMap===map)switchMap(false,'Улицы недоступны. Показана офлайн-схема.');}
  tileTimer=setTimeout(fallback,6500);
  const layer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
  layer.on('tileload',()=>{if(streetMap===map){loaded=true;clearTimeout(tileTimer);status.textContent='Улицы · OpenStreetMap';}});layer.on('load',()=>{if(!loaded)fallback();});layer.addTo(map);
  V4_GEO.forEach(g=>L.circleMarker([g.lat,g.lng],{radius:8,color:'white',weight:3,fillColor:styleGeo(g),fillOpacity:1}).addTo(map).bindTooltip(g.name).on('click',()=>selectGeo(g.id,false)));
 }catch{switchMap(false,'Показана офлайн-схема.');}
}
function v4BuildMap(){if(!geoStarted){geoStarted=true;switchMap(false);}else streetMap?.invalidateSize();}
function v4RefreshMap(){v4RenderLocations();if(streetMap)streetMap.eachLayer(layer=>{if(layer instanceof L.CircleMarker){const pt=layer.getLatLng(),g=V4_GEO.find(x=>x.lat===pt.lat&&x.lng===pt.lng);if(g)layer.setStyle({fillColor:styleGeo(g)});}});}
function initGeoControls(){
 $('geo-streets').addEventListener('click',()=>switchMap(true));$('geo-scheme').addEventListener('click',()=>switchMap(false));
 $('v4-location-list').addEventListener('click',e=>{const b=e.target.closest('[data-v4-loc]');if(b)selectGeo(b.dataset.v4Loc);});
 $('v4-osm-map').addEventListener('click',e=>{const b=e.target.closest('[data-pin]');if(b)selectGeo(b.dataset.pin);});
 $('v4-osm-map').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.dataset.pin){e.preventDefault();selectGeo(e.target.dataset.pin);}});
}
