/* LUMEN 4.0 — geographically grounded map, auditable what-if triage, visual quality gate.
   NO live light readings, real camera connections, production routing, or prediction claims. */
'use strict';
const V4_GEO=[
 {id:'tura',name:'Набережная Туры',lat:57.163091,lng:65.522542,node:0,source:'https://nashural.ru/mobilnoe-prilozhenie-kuda/top-17-dostoprimechatelnostej-tyumeni-marshrut-v-mobilnom-prilozhenii-kuda/'},
 {id:'bridge',name:'Мост Влюблённых',lat:57.164139,lng:65.52182,node:null,source:'https://tripse.ru/excursions/russia/tyumen/sight-most-vliublennykh-3855'},
 {id:'cats',name:'Сквер Сибирских кошек',lat:57.153997,lng:65.536705,node:2,source:'https://www.tourister.ru/world/europe/russia/city/tyumen/parks/28129'},
 {id:'bulvar',name:'Цветной бульвар',lat:57.151065,lng:65.537786,node:3,source:'https://www.tourister.ru/world/europe/russia/city/tyumen/placeofinterest/24651'}
];

function v4QualityFromPixels(rgba,w,h){
 // A simple deterministic visual QC gate separate from the trained classifier.
 const gray=new Float32Array(w*h);let sum=0,sum2=0,white=0,black=0,edges=0,count=0;
 for(let i=0;i<gray.length;i++){const k=i*4,y=(.2126*rgba[k]+.7152*rgba[k+1]+.0722*rgba[k+2])/255;gray[i]=y;sum+=y;sum2+=y*y;if(y>.98)white++;if(y<.025)black++;}
 for(let y=1;y<h;y++)for(let x=1;x<w;x++){const i=y*w+x;edges+=Math.abs(gray[i]-gray[i-w])+Math.abs(gray[i]-gray[i-1]);count++;}
 const mean=sum/gray.length,contrast=Math.sqrt(Math.max(0,sum2/gray.length-mean*mean));const gradient=edges/(count*2);const clipped=(white+black)/gray.length;
 const flags=[];if(mean<.045)flags.push('Очень низкая экспозиция');if(mean>.95)flags.push('Кадр почти полностью пересвечен');if(contrast<.035)flags.push('Недостаточная детализация');if(gradient<.013)flags.push('Мало различимых контуров');if(white/gray.length>.23)flags.push('Много пересвеченных пикселей');
 return {mean,contrast,gradient,clipped,flags,usable:flags.length===0};
}
function v4QualityForElement(el){const w=96,h=96,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(el,0,0,w,h);return v4QualityFromPixels(ctx.getImageData(0,0,w,h).data,w,h);}

function v4Start(){
 ['v4-flow','v4-weather','v4-cross','v4-confirmed-only'].forEach(id=>$(id)?.addEventListener('input',v4RenderForecast));
 $('v4-reset-scenario')?.addEventListener('click',()=>{$('v4-flow').value=45;$('v4-weather').value=30;$('v4-cross').value=60;$('v4-confirmed-only').checked=true;v4RenderForecast();});
 v4RenderLocations();v4RenderForecast();
 document.querySelectorAll('[data-v4-to-map]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();navigate('citymap');}));
 initGeoControls();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v4Start);else v4Start();
window.LUMEN_V4_TEST={v4PriorityRows,v4QualityFromPixels,V4_GEO};
