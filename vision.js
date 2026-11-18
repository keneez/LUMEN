/* LUMEN 3.0 CV Evidence Lab.
 * Inference is a real, off-line PyTorch-trained CNN port to vanilla JavaScript.
 * Training domain = procedurally generated street-like intensity patterns ONLY.
 * Real camera performance is unknown; outputs are evidence suggestions, never
 * measurements in lux, diagnoses of failed lamps, or real-world safety scores.
 * Images remain in memory; queue stores metadata only in this browser.
 */
'use strict';
const CV_CLASSES={
 lit:{name:'В кадре есть признаки освещения',short:'Освещённый участок',icon:'✦',tone:'green',explain:'Модель видит относительно освещённую сцену. Это не означает, что освещённость соответствует нормативам.',action:'Визуальная аномалия не установлена; дополнительных действий по одному кадру не требуется.'},
 dark:{name:'Возможный недостаток света',short:'Тёмный участок',icon:'◐',tone:'red',explain:'Изображение содержит мало светлых областей. Причиной может быть недостаточное освещение или экспозиция камеры.',action:'Нужна проверка ночного кадра, времени, экспозиции и реальной освещённости участка.'},
 uneven:{name:'Неравномерное освещение',short:'Разная освещённость зон',icon:'◒',tone:'amber',explain:'Свет распределён неравномерно: яркие и тёмные участки на одном изображении.',action:'Сравнить кадр с другими временными интервалами и проверить участок на месте.'},
 glare:{name:'Засветка / блики',short:'Сильная засветка',icon:'✷',tone:'amber',explain:'Очень яркий источник может мешать оценке видимости. Это не доказательство неисправности фонаря.',action:'Проверить объектив и экспозицию, сделать второй кадр без засветки.'},
 day:{name:'Светлый / дневной кадр',short:'Дневная сцена',icon:'☼',tone:'neutral',explain:'Дневной кадр нельзя использовать для диагностики ночного уличного освещения.',action:'Для анализа вечернего освещения нужен кадр после наступления темноты.'}
};
const CV_KEY='lumen-cv-review-v3';
const CV_MODEL=window.LUMEN_CV_MODEL;
let cvQueue=[];
let cvLast=null;
let cvSource={kind:'sample',sample:'dark'};
let cvStream=null;
let cvObjectURL=null;
const CV_RGBA=document.createElement('canvas');
CV_RGBA.width=CV_RGBA.height=48;
const CV_CTX=CV_RGBA.getContext('2d',{willReadFrequently:true});
function cvConv(input,inC,H,W,weights,bias,outC){
 const OH=Math.ceil(H/2),OW=Math.ceil(W/2),out=new Float32Array(outC*OH*OW);
 for(let oc=0;oc<outC;oc++)for(let oy=0;oy<OH;oy++)for(let ox=0;ox<OW;ox++){
  let sum=bias[oc];
  for(let ic=0;ic<inC;ic++)for(let ky=0;ky<3;ky++)for(let kx=0;kx<3;kx++){
   const iy=oy*2+ky-1,ix=ox*2+kx-1;
   if(iy>=0&&iy<H&&ix>=0&&ix<W){
    sum+=input[(ic*H+iy)*W+ix]*weights[((oc*inC+ic)*3+ky)*3+kx];
   }
  }
  out[(oc*OH+oy)*OW+ox]=Math.max(0,sum);
 }
 return {arr:out,H:OH,W:OW};
}
function cvInferPixels(rgba){
 if(!CV_MODEL||!CV_MODEL.weights)throw Error('Модель компьютерного зрения не загружена');
 const data=new Float32Array(48*48);let sum=0,lower=0,bright=0,veryDark=0;
 for(let i=0;i<data.length;i++){
  const p=4*i,v=(.2126*rgba[p]+.7152*rgba[p+1]+.0722*rgba[p+2])/255;
  data[i]=v;sum+=v;if(i>=24*48)lower+=v;
  if(v>.90)bright++;if(v<.14)veryDark++;
 }
 const w=CV_MODEL.weights;
 const a=cvConv(data,1,48,48,w['c1.weight'],w['c1.bias'],8);
 const b=cvConv(a.arr,8,24,24,w['c2.weight'],w['c2.bias'],12);
 const pool=new Float32Array(108);
 for(let c=0;c<12;c++)for(let py=0;py<3;py++)for(let px=0;px<3;px++){
  let s=0;for(let iy=0;iy<4;iy++)for(let ix=0;ix<4;ix++)s+=b.arr[(c*12+py*4+iy)*12+px*4+ix];
  pool[c*9+py*3+px]=s/16;
 }
 const hidden=new Float32Array(32);for(let i=0;i<32;i++){
  let s=w['d1.bias'][i];for(let j=0;j<108;j++)s+=pool[j]*w['d1.weight'][i*108+j];
  hidden[i]=Math.max(0,s);
 }
 const logits=new Array(5);for(let i=0;i<5;i++){
  let s=w['d2.bias'][i];for(let j=0;j<32;j++)s+=hidden[j]*w['d2.weight'][i*32+j];logits[i]=s;
 }
 const max=Math.max(...logits),exp=logits.map(v=>Math.exp(v-max)),total=exp.reduce((a,b)=>a+b,0);
 const probabilities=exp.map(v=>v/total);const id=probabilities.indexOf(Math.max(...probabilities));
 return {kind:CV_MODEL.classes[id],confidence:probabilities[id],probabilities,stats:{mean:sum/data.length,lower:lower/(24*48),bright:bright/data.length,dark:veryDark/data.length},version:CV_MODEL.version};
}
function cvInferElement(el){
 const w=el?.videoWidth||el?.naturalWidth||el?.width;
 const h=el?.videoHeight||el?.naturalHeight||el?.height;
 if(!w||!h)throw Error('Не удалось прочитать кадр');
 // Deliberately stretch the whole frame to 48 x 48: the trained synthetic input shape.
 CV_CTX.drawImage(el,0,0,48,48);
 return cvInferPixels(CV_CTX.getImageData(0,0,48,48).data);
}
const photoCache=new Map();
let cameraEpoch=0,analysisEpoch=0;
function cvSetSourceTag(){
 $('cv-source-tag').textContent={sample:'Учебный кадр',file:'Ваше фото',camera:'Камера устройства'}[cvSource.kind];
}
function frameCanvas(image,width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 canvas.getContext('2d',{willReadFrequently:true}).drawImage(image,0,0,width,height);return canvas;
}
function photoThumb(im){
 const ratio=Math.min(1,650/Math.max(im.naturalWidth,im.naturalHeight));
 return frameCanvas(im,Math.max(1,Math.round(im.naturalWidth*ratio)),Math.max(1,Math.round(im.naturalHeight*ratio))).toDataURL('image/jpeg',.81);
}
async function fingerprint(im){
 if(!globalThis.crypto?.subtle)return null;
 const px=frameCanvas(im,96,96).getContext('2d').getImageData(0,0,96,96).data;
 const digest=await crypto.subtle.digest('SHA-256',px);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
function originalOf(q){return Object.hasOwn(CV_CLASSES,q.sample)?'assets/'+q.sample+'.jpg':photoCache.get(q.id);}
function cvRenderOutput(){
 const out=$('cv-output'),quality=$('v4-cv-quality');if(!out)return;
 if(!cvLast){out.innerHTML='<div class="cv-empty-symbol">◎</div><h3>Кадр готов к анализу</h3><p>Запустите модель, чтобы увидеть категорию и проверить качество изображения.</p>';quality.hidden=true;return;}
 const r=cvLast,q=r.quality,c=CV_CLASSES[r.kind],actionable=q.usable && ['dark','uneven'].includes(r.kind);
 quality.hidden=false;quality.className='v4-cv-quality-note '+(q.usable?'v4-pass':'v4-warning');
 quality.innerHTML=`<strong>${q.usable?'Кадр пригоден для просмотра':'Нужна пересъёмка'}</strong><span>${q.usable?'Экспозиция, контраст и детализация прошли проверку.':escapeHtml(q.flags.join(' · '))}</span><div class="v4-qstats"><span>Яркость ${Math.round(q.mean*100)}%</span><span>Контраст ${Math.round(q.contrast*100)}%</span></div>`;
 const scores=CV_MODEL.classes.map((key,i)=>[key,r.probabilities[i]]).sort((a,b)=>b[1]-a[1]);
 out.innerHTML=`<div class="cv-decision"><span class="cv-result-mark">${icon('ScanEye')}</span><div><small>Предположение CNN</small><h3>${escapeHtml(c.name)}</h3></div></div><p class="model-action">${escapeHtml(q.usable?c.action:'Повторите съёмку, чтобы были видны детали участка.')}</p>
 ${actionable?'<label for="cv-place" class="field-label">Участок модельной сети</label><select id="cv-place" class="field-input">'+NODES.map(n=>'<option value="'+n.id+'">'+escapeHtml(n.name)+'</option>').join('')+'</select><button class="primary-button full" id="cv-add-to-queue">На ручную проверку '+icon('ArrowRight')+'</button>':''}
 <details class="score-details"><summary>Оценки пяти классов</summary><div class="cv-prob-list">${scores.map(([k,v])=>`<div class="cv-prob"><span>${escapeHtml(CV_CLASSES[k].short)}</span><i><b style="width:${v*100}%"></b></i><strong>${Math.round(v*100)}%</strong></div>`).join('')}</div><p>Проценты показывают распределение softmax. Для оценки полевой точности нужны размеченные ночные кадры.</p></details>`;
 if($('cv-place'))$('cv-place').value='3';
 $('cv-add-to-queue')?.addEventListener('click',cvAddQueue);
}
async function cvAnalyze(){
 if(cvStream){showToast('Сначала сделайте снимок.');return false;}
 const im=$('cv-preview'),epoch=++analysisEpoch;
 try{await im.decode();if(epoch!==analysisEpoch)return false;
  const r=cvInferElement(im);r.quality=v4QualityForElement(im);r.fingerprint=await fingerprint(im);
  if(epoch!==analysisEpoch)return false;cvLast=r;cvRenderOutput();showToast('Анализ кадра завершён.');return true;
 }catch{if(epoch===analysisEpoch){cvLast=null;cvRenderOutput();showToast('Не удалось прочитать изображение. Выберите другой файл.');}return false;}
}
async function cvAddQueue(){
 if(!cvLast?.quality.usable || !['dark','uneven'].includes(cvLast.kind))return false;
 const node=+$('cv-place').value;if(!validNode(node))return false;
 const q={id:uid('CV'),node,kind:cvLast.kind,sample:cvSource.sample||null,fingerprint:cvLast.fingerprint,status:'pending',at:new Date().toISOString(),
  source:{sample:'учебный кадр',file:'фото пользователя',camera:'камера пользователя'}[cvSource.kind]};
 const img=q.sample?null:photoThumb($('cv-preview'));
 const id=await changeState(s=>{
  const same=s.reviews.find(x=>x.status==='pending' && x.node===node && ((q.fingerprint && x.fingerprint===q.fingerprint)||(q.sample && q.sample===x.sample)));
  if(same)return same.id;s.reviews.unshift(q);return q.id;
 });
 if(!id)return false;if(img)photoCache.set(id,img);cvRenderQueue();showToast('Кадр в очереди. Маршрут пока прежний.');
 $('cv-review-list').scrollIntoView({block:'center'});return id;
}
async function cvDecide(id,status,note=''){
 const ok=await changeState(s=>{
  const q=s.reviews.find(q=>q.id===id);if(!q || q.status!=='pending')return false;
  if(status==='confirmed' && (!originalOf(q) || !['dark','uneven'].includes(q.kind)))return false;
  q.status=status;q.reviewedAt=new Date().toISOString();q.note=String(note).slice(0,240);
  if(status==='confirmed')s.reports.unshift(cvReport(q));return true;
 });
 if(ok)showToast(status==='confirmed'?'Заявка создана. Модельный маршрут пересчитан.':'Сигнал отклонён. Маршрут прежний.');return ok;
}
function cvConfirm(id,note){return cvDecide(id,'confirmed',note);}
function cvReject(id,note){return cvDecide(id,'rejected',note);}
function cvRenderQueue(){
 const root=$('cv-review-list');if(!root)return;
 if(!cvQueue.length){root.innerHTML='<p class="quiet">Очередь пуста. Сюда попадут кадры, которые вы отправите на проверку.</p>';return;}
 root.innerHTML=cvQueue.map(q=>{
  const src=originalOf(q),pending=q.status==='pending',confirmable=src && q.kind!=='glare';
  return `<article class="review-entry" data-q="${escapeHtml(q.id)}">${src?'<img class="review-image" alt="Кадр для проверки" src="'+escapeHtml(src)+'">':''}<div class="review-content"><small>${escapeHtml(q.source)} · ${new Date(q.at).toLocaleDateString('ru-RU')}</small><h3>${escapeHtml(NODES[q.node].name)}</h3><p>${escapeHtml(CV_CLASSES[q.kind].short)}</p><strong class="review-status">${{pending:'На проверке',confirmed:'Подтверждён',rejected:'Отклонён'}[q.status]}</strong>${q.note?'<p>'+escapeHtml(q.note)+'</p>':''}</div>${pending?`<div class="review-actions">${!src?(q.fingerprint?'<label class="utility-button">Открыть исходное фото<input type="file" accept="image/*" data-original></label>':'<small>Для архивной записи повторите анализ с исходным кадром.</small>'):''}<label>Комментарий<input data-review-note maxlength="240" placeholder="Что видно на участке"></label><div><button class="utility-button" data-cv-confirm ${confirmable?'':'disabled'}>Подтвердить в демо</button> <button class="utility-button" data-cv-reject>Отклонить</button></div></div>`:''}</article>`;
 }).join('');
}
async function attachOriginal(id,file){
 const q=cvQueue.find(q=>q.id===id);if(!file || !q?.fingerprint || file.size>10485760){showToast('Выберите исходное фото размером до 10 МБ.');return;}
 const url=URL.createObjectURL(file);
 try{const im=new Image();im.src=url;await im.decode();if(await fingerprint(im)!==q.fingerprint){showToast('Это другой кадр. Выберите исходный файл.');return;}photoCache.set(id,photoThumb(im));cvRenderQueue();}
 catch{showToast('Не удалось прочитать файл.');}finally{URL.revokeObjectURL(url);}
}

function cvSelectSample(kind){if(!CV_CLASSES[kind])return;cvStopCamera();cvReleaseImage();cvSource={kind:'sample',sample:kind};cvLast=null;
 $('cv-preview').src='assets/'+kind+'.jpg';$('cv-preview').hidden=false;$('cv-video').hidden=true;
 document.querySelectorAll('[data-cv-sample]').forEach(b=>b.classList.toggle('active',b.dataset.cvSample===kind));cvSetSourceTag();cvRenderOutput();}
function cvReleaseImage(){if(cvObjectURL){URL.revokeObjectURL(cvObjectURL);cvObjectURL=null;}}
function cvLoadFile(file){if(!file)return;if(!['image/jpeg','image/png','image/webp','image/gif','image/bmp'].includes(file.type)){showToast('Нужен JPG, PNG, WebP, GIF или BMP');return;}if(file.size>10*1024*1024){showToast('Максимальный размер изображения — 10 МБ');return;}
 cvStopCamera();cvReleaseImage();cvObjectURL=URL.createObjectURL(file);cvSource={kind:'file'};cvLast=null;
 $('cv-preview').src=cvObjectURL;$('cv-preview').hidden=false;$('cv-video').hidden=true;document.querySelectorAll('[data-cv-sample]').forEach(b=>b.classList.remove('active'));cvSetSourceTag();cvRenderOutput();}
async function cvStartCamera(){if(!navigator.mediaDevices?.getUserMedia){showToast('Камера недоступна: нужен HTTPS и совместимый браузер');return;}
 cvStopCamera();const epoch=cameraEpoch;try{
 const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
 if(epoch!==cameraEpoch || activeView!=='vision'){stream.getTracks().forEach(t=>t.stop());return;}cvStream=stream;
 const vid=$('cv-video');vid.srcObject=cvStream;vid.hidden=false;$('cv-preview').hidden=true;
 await vid.play();if(epoch!==cameraEpoch)return;$('cv-start-camera').hidden=true;$('cv-capture').hidden=false;$('cv-stop-camera').hidden=false;cvLast=null;cvRenderOutput();
 }catch(e){if(epoch!==cameraEpoch)return;cvStopCamera();showToast('Нет доступа к камере — выберите тестовый кадр или фото');}}
function cvStopCamera(){cameraEpoch++;analysisEpoch++;if(cvStream){for(const t of cvStream.getTracks())t.stop();cvStream=null;}
 const vid=$('cv-video');if(vid){vid.pause();vid.srcObject=null;vid.hidden=true;}
 const preview=$('cv-preview');if(preview)preview.hidden=false;
 for(const [id,flag] of [['cv-start-camera',false],['cv-capture',true],['cv-stop-camera',true]]){const el=$(id);if(el)el.hidden=flag;}}
function cvCapture(){const vid=$('cv-video');if(!cvStream||!vid?.videoWidth){showToast('Камера пока не передаёт кадры');return;}
 const c=document.createElement('canvas');c.width=vid.videoWidth;c.height=vid.videoHeight;c.getContext('2d').drawImage(vid,0,0);
 cvStopCamera();cvReleaseImage();cvSource={kind:'camera'};cvLast=null;$('cv-preview').src=c.toDataURL('image/jpeg',.82);
 document.querySelectorAll('[data-cv-sample]').forEach(b=>b.classList.remove('active'));cvSetSourceTag();cvRenderOutput();showToast('Кадр сохранён только в памяти страницы');}
function cvInit(){cvSetSourceTag();cvRenderQueue();cvRenderOutput();
 document.querySelectorAll('[data-cv-sample]').forEach(b=>b.addEventListener('click',()=>cvSelectSample(b.dataset.cvSample)));
 $('cv-file')?.addEventListener('change',e=>cvLoadFile(e.target.files?.[0]));
 $('cv-start-camera')?.addEventListener('click',cvStartCamera);
 $('cv-stop-camera')?.addEventListener('click',()=>{cvStopCamera();showToast('Доступ к камере остановлен');});
 $('cv-capture')?.addEventListener('click',cvCapture);
 $('cv-analyze')?.addEventListener('click',cvAnalyze);
 $('cv-review-list').addEventListener('click',async e=>{const b=e.target.closest('button'),row=b?.closest('[data-q]');if(!row)return;const id=row.dataset.q,note=row.querySelector('[data-review-note]')?.value||'';if(b.hasAttribute('data-cv-confirm'))await cvConfirm(id,note);if(b.hasAttribute('data-cv-reject'))await cvReject(id,note);});
 $('cv-review-list').addEventListener('change',e=>{const f=e.target;if(f.matches('[data-original]'))attachOriginal(f.closest('[data-q]').dataset.q,f.files[0]);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cvStopCamera();});
 window.addEventListener('pagehide',cvStopCamera);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cvInit);else cvInit();
window.LUMEN_CV_TEST={cvInferPixels,cvInferElement,cvConv,CV_CLASSES};
