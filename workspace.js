/* Both parts of a confirmed visual signal live in the same versioned record. */
'use strict';
const WORKSPACE_KEY = 'lumen-workspace-v5';
const SHIFT_OUTCOMES = {todo:'Предстоит осмотр',confirmed:'Проблема подтверждена',clear:'Проблемы не обнаружено',revisit:'Нужен повторный осмотр'};
let workspace, rehearsal=null, serverRows=null, memoryOnly=false;
function freshState(){return {version:5,reports:structuredClone(window.LUMEN_SEED),reviews:[],plan:null};}
function validId(v){return typeof v==='string' && v.trim() && v.length<=100 && !/[\u0000-\u001F]/.test(v);}
function validNode(n){return Number.isInteger(n) && n>=0 && n<NODES.length;}
function isDate(d){return typeof d==='string' && Number.isFinite(Date.parse(d));}
function validReview(q){
 return q && validId(q.id) && validNode(q.node) && ['dark','uneven','glare'].includes(q.kind) && ['pending','confirmed','rejected'].includes(q.status)
  && !(q.status==='confirmed' && q.kind==='glare') && isDate(q.at) && typeof q.source==='string' && q.source.length<=100;
}
function validPlan(p){
 if(p===null)return true;
 return p && isDate(p.at) && p.settings && ['flow','weather','cross'].every(k=>Number.isFinite(p.settings[k]) && p.settings[k]>=0 && p.settings[k]<=100)
  && typeof p.settings.confirmedOnly==='boolean' && Array.isArray(p.items) && p.items.length>0 && p.items.length<=15 && new Set(p.items.map(i=>i.node)).size===p.items.length
  && p.items.every(x=>validNode(x.node) && Number.isInteger(x.score) && x.score>=0 && x.score<=100 && Object.hasOwn(SHIFT_OUTCOMES,x.outcome) && typeof x.note==='string' && x.note.length<=240);
}
function validateState(s){
 if(!s || s.version!==5 || !Array.isArray(s.reports) || !Array.isArray(s.reviews) || !s.reports.every(r=>v2ValidateRow(r)&&validId(r.id)&&(!r.history || Array.isArray(r.history)&&r.history.every(x=>x&&Object.hasOwn(V2_STATUSES,x.status)&&isDate(x.at)))) ||
   !s.reviews.every(validReview) || !validPlan(s.plan)) throw Error('Некорректная структура резервной копии.');
 const reports=new Map(s.reports.map(r=>[r.id,r])), reviews=new Map(s.reviews.map(q=>[q.id,q]));
 if(reports.size!==s.reports.length || reviews.size!==s.reviews.length)throw Error('Повторяющийся идентификатор.');
 for(const q of s.reviews){const r=reports.get(q.id);if(q.status==='confirmed'?(!r || r.source!=='cv' || r.node!==q.node):!!r)throw Error('Решение о кадре расходится с заявкой.');}
 if(s.reports.some(r=>r.source==='cv' && reviews.get(r.id)?.status!=='confirmed'))throw Error('Отсутствует решение диспетчера.');
 return s;
}
function cvReport(q){
 const at=q.reviewedAt||q.at;
 return {id:q.id,node:q.node,text:'По кадру отмечены признаки проблемы с освещением. Диспетчер подтвердил визуальный сигнал для осмотра участка. Источник: '+q.source+'.',
  label:'dim',status:'open',priority:'medium',source:'cv',createdAt:q.at,updatedAt:at,history:[{status:'open',at}]};
}
function migrateState(rows,reviews=[]){
 if(!Array.isArray(rows)||!Array.isArray(reviews)||!rows.every(v2ValidateRow))throw Error('Некорректный архив обращений.');
 const s={version:5,reports:structuredClone(rows),reviews:structuredClone(reviews.filter(validReview)),plan:null};
 for(const q of s.reviews)if(!q.sample && q.source==='синтетический кадр')q.sample=q.kind;
 for(const q of s.reviews.filter(q=>q.status==='confirmed')){
  const r=s.reports.find(r=>r.id===q.id);if(!r)s.reports.push(cvReport(q));else r.source='cv';
 }
 for(const r of s.reports.filter(r=>r.source==='cv'))if(!s.reviews.some(q=>q.id===r.id)){
  s.reviews.push({id:r.id,node:r.node,status:'confirmed',kind:/неравномер/i.test(r.text)?'uneven':'dark',at:r.createdAt||new Date().toISOString(),source:'архив LUMEN'});
 }
 return validateState(s);
}
function readState(){
 if(memoryOnly)return structuredClone(workspace||freshState());
 let raw,rows,reviews;
 try{raw=localStorage.getItem(WORKSPACE_KEY);if(!raw){rows=localStorage.getItem('lumen-reports-v1');reviews=localStorage.getItem('lumen-cv-review-v3');}}
 catch{memoryOnly=true;return structuredClone(workspace||freshState());}
 if(raw)return validateState(JSON.parse(raw));
 return migrateState(rows?JSON.parse(rows):window.LUMEN_SEED,reviews?JSON.parse(reviews):[]);
}
function useState(s){
 workspace=s;cvQueue=s.reviews;REPORTS=serverRows===null?s.reports:[...s.reports.filter(r=>r.source==='cv'),...serverRows];
}
function reloadState(){
 try{useState(readState());}catch{if(!workspace)useState(freshState());showToast('Не удалось прочитать данные. В диспетчерской можно восстановить копию.');}
}
async function changeState(fn,replace=false){
 const session=rehearsal;
 const apply=()=>{
  if(session!==rehearsal)return false;
  const s=replace?freshState():rehearsal?structuredClone(workspace):readState();
  const result=fn(s);validateState(s);
  if(!rehearsal&&!memoryOnly)localStorage.setItem(WORKSPACE_KEY,JSON.stringify(s));
  useState(s);renderAll();return result;
 };
 try{return navigator.locks?.request?await navigator.locks.request(WORKSPACE_KEY,apply):apply();}
 catch(e){showToast('Изменение не сохранено. '+e.message);return false;}
}
function makeBackup(){return {kind:'lumen-local-demo',...(rehearsal?workspace:readState()),exportedAt:new Date().toISOString()};}
function parseBackup(o){
 if(o?.version===5 && o.kind==='lumen-local-demo')return validateState(o);
 if(Array.isArray(o))return migrateState(o);
 if(o?.kind==='lumen-local-demo' && /^[234](\.|$)/.test(String(o.version)))return migrateState(o.reports);
 throw Error('Ожидается резервная копия LUMEN.');
}
function uid(prefix){return prefix+'-'+(globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
window.addEventListener('storage',e=>{if(!rehearsal && workspace && (e.key===WORKSPACE_KEY || e.key===null)){reloadState();renderAll();}});
