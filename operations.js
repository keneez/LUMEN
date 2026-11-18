'use strict';
const viewNames={overview:'Обзор',vision:'Проверка кадра',dispatch:'Диспетчерская',forecast:'План смены',citymap:'Геокарта',routes:'Маршруты',report:'Сообщить о проблеме',analytics:'Аналитика',pilot:'О проекте'};
function icon(name){return '<svg class="ui-icon" aria-hidden="true"><use href="assets/icons.svg#'+name+'"></use></svg>';}
function historyHtml(r){
 if(!Array.isArray(r.history)||!r.history.length)return '';
 return '<details class="status-history"><summary>История статусов</summary>'+r.history.slice(-10).map(x=>'<div>'+escapeHtml(V2_STATUSES[x.status]||'')+' · '+escapeHtml(new Date(x.at).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}))+'</div>').join('')+'</details>';
}
async function v2SetStatus(id,status){
 if(!Object.hasOwn(V2_STATUSES,status))return;
 if(API_MODE && !workspace.reports.some(r=>r.id===id && r.source==='cv')){
  try{const res=await fetch('/api/reports/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
   if(!res.ok)throw Error();const row=await res.json();serverRows=serverRows.map(r=>r.id===id?row:r);useState(workspace);renderAll();}
  catch{renderDispatch();showToast('Сервер не сохранил статус. Проверьте соединение и повторите.');return;}
 }else if(!await changeState(s=>{const r=s.reports.find(x=>x.id===id);if(!r)return false;if(r.status!==status){r.status=status;r.updatedAt=new Date().toISOString();(r.history??=[]).push({status,at:r.updatedAt});}return true;}))return;
 showToast('Статус обращения обновлён.');
}
function v2ExportJson(){try{v2Download('LUMEN-backup.json','application/json;charset=utf-8',JSON.stringify(makeBackup(),null,2));}catch{showToast('Не удалось прочитать данные для копии.');}}
async function v2ImportJson(file){
 if(!file||API_MODE)return;if(file.size>8e6){showToast('Максимальный размер копии — 8 МБ.');return;}
 try{const b=parseBackup(JSON.parse(await file.text()));
  if(!confirm('Восстановить копию? Текущие локальные обращения, очередь и план будут заменены.'))return;
  if(await changeState(s=>{s.reports=b.reports;s.reviews=b.reviews;s.plan=b.plan;return true;},true))showToast('Копия восстановлена.');
 }catch(e){showToast('Копия не загружена. '+e.message);}
}
async function v2Reset(){
 if(API_MODE||!confirm('Восстановить учебный набор? Локальные обращения, очередь и план смены будут заменены.'))return;
 if(await changeState(()=>true,true)){photoCache.clear();showToast('Учебный набор восстановлен.');}
}
function renderRouteComparison(from,to){
 const paths=['fast','safe'].map(m=>dijkstra(from,to,m));
 $('route-compare').innerHTML='<h3>Два варианта пути</h3><table><thead><tr><th>Критерий</th><th>Кратчайший</th><th>С учётом света</th></tr></thead><tbody>'+
 [['Длина на схеме',...paths.map(p=>routeInfo(p).dist+' усл. ед.')],['Средний индекс света',...paths.map(p=>routeInfo(p).light+' / 100')],['Путь',...paths.map(p=>p.map(i=>NODES[i].short).join(' → '))]].map(row=>'<tr>'+row.map((v,i)=>i?'<td>'+escapeHtml(v)+'</td>':'<th>'+v+'</th>').join('')+'</tr>').join('')+'</tbody></table>';
}
function setMenu(open){
 document.body.classList.toggle('menu-open',open);$('mobile-menu').setAttribute('aria-expanded',String(open));$('menu-shade').hidden=!open;
 if(open)document.querySelector('.nav-btn.active')?.focus();else if(document.activeElement?.closest('.sidebar') && matchMedia('(max-width: 900px)').matches)$('mobile-menu').focus();
}
function navigate(view,record=true){
 if(!Object.hasOwn(viewNames,view))view='overview';
 if(activeView==='vision'&&view!==activeView)cvStopCamera();
 activeView=view;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('view-visible',v.id==='view-'+view));
 document.querySelectorAll('.nav-btn').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('active',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current');});
 $('top-view').textContent=viewNames[view];setMenu(false);
 if(record&&location.hash!=='#'+view)history.pushState(null,'','#'+view);
 if(view==='citymap')v4BuildMap();if(view==='routes')renderRoute();if(view==='forecast')v4RenderForecast();window.scrollTo(0,0);
}
function renderAll(){
 renderStats();renderFeed();renderMap();renderInsight();renderAnalytics();renderRoute();renderDispatch();cvRenderQueue();v4RenderForecast();renderPlan();v4RefreshMap();
 $('nav-review-count').textContent=cvQueue.filter(q=>q.status==='pending').length||'';
 $('shift-mode').textContent=rehearsal?'Репетиция':API_MODE?'Локальный сервер':memoryOnly?'До закрытия вкладки':'Локальное демо';
 $('exit-tour').hidden=!rehearsal;
 for(const id of ['reset-demo','import-json-trigger','export-json'])$(id).disabled=API_MODE;
}
function finishTour(){
 if(!rehearsal)return;const prior=rehearsal;rehearsal=null;$('v2-coach')?.remove();serverRows=prior.serverRows;API_MODE=prior.api;
 useState(prior.state);reloadState();cvSelectSample('dark');for(const [id,v] of Object.entries(prior.controls))$(id).value=v;
 $('v4-confirmed-only').checked=prior.confirmed;routeMode=prior.routeMode;document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===routeMode));
 renderAll();navigate(prior.view);showToast('Репетиция завершена. Ваши данные восстановлены.');
}
function v2StartTour(){
 if(rehearsal){finishTour();return;}
 const controls=Object.fromEntries(['v4-flow','v4-weather','v4-cross','shift-capacity','route-from','route-to'].map(id=>[id,$(id).value]));
 const tour={state:workspace,serverRows,api:API_MODE,view:activeView,controls,confirmed:$('v4-confirmed-only').checked,routeMode};
 rehearsal=tour;serverRows=null;API_MODE=false;useState(freshState());$('v4-flow').value=45;$('v4-weather').value=30;$('v4-cross').value=60;$('v4-confirmed-only').checked=true;
 renderAll();navigate('vision');cvSelectSample('dark');
 function coach(step,title,desc,action,next){if(rehearsal!==tour)return;v2Coach(title,desc,action,async()=>{if(rehearsal!==tour)return;try{await next();}catch{if(rehearsal===tour){finishTour();showToast('Сценарий прерван. Его можно запустить снова.');}}},step);$('v2-coach-close').addEventListener('click',finishTour);}
 coach(1,'Прочитайте кадр','Перед вами учебная ночная сцена. CNN оценит пять классов, а отдельная проверка — пригодность кадра.','Запустить анализ',async()=>{
  if(!await cvAnalyze()||rehearsal!==tour||!$('cv-place'))throw Error();
  coach(2,'Назначьте участок','В этом примере диспетчер проверяет Цветной бульвар. Добавление кадра в очередь пока не меняет маршрут.','Отправить на проверку',async()=>{
   $('cv-place').value=3;const id=await cvAddQueue();if(!id||rehearsal!==tour)throw Error();
   coach(3,'Проверьте изображение','На учебном кадре почти не освещена пешеходная зона. Подтвердите наблюдение для осмотра.','Подтвердить кадр',async()=>{
    if(!await cvConfirm(id,'Учебная проверка участка.')||rehearsal!==tour)throw Error();$('route-from').value=8;$('route-to').value=4;routeMode='safe';document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===routeMode));navigate('routes');
    coach(4,'Сравните два пути','Оба пути имеют длину 332 условные единицы. После проверки средний индекс света составляет 76 у кратчайшего и 79 у альтернативы.','Открыть план смены',()=>{
     $('shift-capacity').value=3;navigate('forecast');coach(5,'Зафиксируйте очередь','Посмотрите, из чего сложились баллы первых трёх участков. Сохраните их для осмотра.','Составить план',async()=>{
      if(!await savePlan()||rehearsal!==tour)throw Error();coach(6,'План смены готов','У каждого участка можно записать результат осмотра. Выход вернёт ваши рабочие данные.','Завершить репетицию',finishTour);
     });
    });
   });
  });
 });
}
function initShell(){
 $('mobile-menu').addEventListener('click',()=>setMenu(!document.body.classList.contains('menu-open')));$('menu-shade').addEventListener('click',()=>setMenu(false));
 $('hero-tour').addEventListener('click',v2StartTour);$('exit-tour').addEventListener('click',finishTour);
 window.addEventListener('hashchange',()=>navigate(location.hash.slice(1),false));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.body.classList.contains('menu-open'))setMenu(false);else if(rehearsal)finishTour();}});
}
document.addEventListener('DOMContentLoaded',initShell);
