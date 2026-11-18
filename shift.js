'use strict';
const SITE_FACTORS=[[30,25,90],[65,55,35],[72,72,40],[90,80,48],[78,88,44],[20,20,60],[42,38,52],[68,90,70],[82,70,82],[47,40,30],[54,85,42],[46,77,68],[24,28,85],[29,35,62],[26,28,75]];
function v4PriorityRows({flow=45,weather=30,cross=60,confirmedOnly=true}={},reports=REPORTS,reviews=typeof cvQueue==='undefined'?[]:cvQueue){
 return NODES.map((n,i)=>{
  const [localFlow,localCross,exposure]=SITE_FACTORS[i];
  const active=reports.filter(r=>r.node===n.id && r.status!=='resolved');
  const pending=confirmedOnly?0:reviews.filter(q=>q.status==='pending' && q.node===n.id && q.kind!=='glare').length;
  const signal=Math.min(100,active.reduce((t,r)=>t+({critical:34,high:24,medium:14}[r.priority]||4),pending*7));
  const parts=[.45*(100-n.light),.20*signal,.15*localFlow*flow/100,.10*localCross*cross/100,.10*exposure*weather/100];
  const raw=parts.reduce((a,b)=>a+b,0);
  return {node:n.id,name:n.name,parts,raw,score:Math.round(raw)};
 }).sort((a,b)=>b.raw-a.raw || a.node-b.node);
}
function v4ReadControls(){return {flow:+$('v4-flow').value,cross:+$('v4-cross').value,weather:+$('v4-weather').value,confirmedOnly:$('v4-confirmed-only').checked};}
function v4RenderForecast(){
 if(!$('v4-priority-list'))return;
 const cfg=v4ReadControls();for(const key of ['flow','weather','cross'])$('v4-'+key+'-value').textContent=cfg[key]+' / 100';
 const names=['Свет','Заявки','Поток','Переходы','Погода'];
 $('v4-priority-list').innerHTML=v4PriorityRows(cfg).slice(0,+$('shift-capacity').value).map((r,i)=>`<article class="v4-score-row"><span class="v4-score-rank">${String(i+1).padStart(2,'0')}</span><div class="v4-score-text"><b>${escapeHtml(r.name)}</b><small>${r.parts.map((x,k)=>names[k]+' '+x.toLocaleString('ru-RU',{maximumFractionDigits:1})).join(' · ')}</small><div class="v4-score-track"><i style="width:${r.score}%"></i></div></div><strong>${r.score}<small>/100</small></strong></article>`).join('');
}
function renderPlan(){
 const plan=workspace?.plan,root=$('saved-plan');if(!root)return;
 $('export-plan').disabled=!plan;
 if(!plan){root.innerHTML='<p class="quiet">Зафиксируйте очередь на смену, чтобы записывать результаты осмотров.</p>';return;}
 root.innerHTML=`<div class="plan-summary"><b>Осмотрено ${plan.items.filter(x=>x.outcome!=='todo').length} из ${plan.items.length}</b><span>${new Date(plan.at).toLocaleDateString('ru-RU')} · поток ${plan.settings.flow}, погода ${plan.settings.weather}, переходы ${plan.settings.cross}</span></div>`+plan.items.map((x,i)=>`<form class="plan-item" data-node="${x.node}"><div><small>${i+1} / ${x.score} балл.</small><b>${escapeHtml(NODES[x.node].name)}</b></div><label>Результат<select name="outcome" class="field-input">${Object.entries(SHIFT_OUTCOMES).map(([k,v])=>'<option value="'+k+'" '+(x.outcome===k?'selected':'')+'>'+v+'</option>').join('')}</select></label><label>Заметка<input name="note" class="field-input" maxlength="240" value="${escapeHtml(x.note)}" placeholder="Что увидели при осмотре"></label><button class="utility-button">Сохранить</button></form>`).join('');
}
async function savePlan(){
 const old=workspace.plan?.at;
 if(old && !confirm('Заменить текущий план вместе с результатами осмотров?'))return false;
 const cfg=v4ReadControls(),count=+$('shift-capacity').value;
 const ok=await changeState(s=>{
  if(s.plan?.at!==old)throw Error('План изменился в другой вкладке.');
  const rows=serverRows===null?s.reports:[...s.reports.filter(r=>r.source==='cv'),...serverRows];
  const items=v4PriorityRows(cfg,rows,s.reviews).slice(0,count).map(r=>({node:r.node,score:r.score,outcome:'todo',note:''}));
  s.plan={at:new Date().toISOString(),settings:cfg,items};return true;
 });if(ok){showToast('План смены зафиксирован.');$('saved-plan').scrollIntoView({block:'center'});}
 return ok;
}
function exportPlan(){
 const plan=workspace.plan;if(!plan)return;
 const rows=[['Дата составления','Позиция','Участок','Балл','Итог','Комментарий','Поток','Погода','Переходы'],...plan.items.map((x,i)=>[plan.at,i+1,NODES[x.node].name,x.score,SHIFT_OUTCOMES[x.outcome],x.note,plan.settings.flow,plan.settings.weather,plan.settings.cross])];
 v2Download('LUMEN-plan.csv','text/csv;charset=utf-8','\uFEFF'+rows.map(row=>row.map(v2CsvCell).join(';')).join('\r\n'));
}
function initPlan(){
 $('shift-capacity').addEventListener('input',v4RenderForecast);
 $('make-plan').addEventListener('click',savePlan);$('export-plan').addEventListener('click',exportPlan);
 $('saved-plan').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target;if(!f.matches('.plan-item'))return;
  const at=workspace.plan?.at,node=+f.dataset.node,outcome=f.elements.outcome.value,note=f.elements.note.value.trim();
  if(await changeState(s=>{if(s.plan?.at!==at)throw Error('План изменился.');const x=s.plan.items.find(x=>x.node===node);if(!x)return false;x.note=note;x.outcome=outcome;return true;}))showToast('Результат осмотра сохранён.');
 });
}
document.addEventListener('DOMContentLoaded',initPlan);
