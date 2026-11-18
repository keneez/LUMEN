/* LUMEN / city lighting AI. Runs completely offline: no dependencies, keys or network calls required.
   Demo routes are schematic and not usable for real-world navigation. */
'use strict';
const NODES = [
  {id:0,x:122,y:173,name:'Набережная Туры',short:'Набережная',light:94},
  {id:1,x:314,y:173,name:'Тюменский госуниверситет',short:'ТюмГУ',light:87},
  {id:2,x:507,y:173,name:'Сквер Сибирских кошек',short:'Сквер кошек',light:82},
  {id:3,x:698,y:173,name:'Цветной бульвар',short:'Цветной бульвар',light:94},
  {id:4,x:890,y:173,name:'Центральный рынок',short:'Центральный рынок',light:91},
  {id:5,x:122,y:313,name:'Северный квартал',short:'Северный квартал',light:91},
  {id:6,x:314,y:313,name:'Улица Республики',short:'Ул. Республики',light:66},
  {id:7,x:507,y:313,name:'Улица Первомайская',short:'Ул. Первомайская',light:63},
  {id:8,x:698,y:313,name:'Пешеходная зона',short:'Пешеходная зона',light:62},
  {id:9,x:890,y:313,name:'Торговый квартал',short:'Торговый квартал',light:95},
  {id:10,x:122,y:453,name:'Драматический театр',short:'Драмтеатр',light:96},
  {id:11,x:314,y:453,name:'Площадь 400-летия',short:'Площадь 400-летия',light:76},
  {id:12,x:507,y:453,name:'Городской сквер',short:'Городской сквер',light:80},
  {id:13,x:698,y:453,name:'Южный квартал',short:'Южный квартал',light:90},
  {id:14,x:890,y:453,name:'Жилой квартал',short:'Жилой квартал',light:95}
];
const EDGES=[];
for(let r=0;r<3;r++)for(let c=0;c<5;c++){
  const a=r*5+c;
  if(c<4) EDGES.push([a,a+1]);
  if(r<2) EDGES.push([a,a+5]);
}
// Realistic cross-links in illustrative graph, not verified physical streets.
EDGES.push([1,7],[6,12],[3,9],[8,14],[5,11]);
const CLASS_DATA={
  outage:{name:'Не работает фонарь',short:'Не горит свет',symbol:'◉',color:'#f62a89',next:'Проверить работоспособность светильника и направить заявку ответственной службе.'},
  dim:{name:'Недостаточная освещённость',short:'Недостаточно света',symbol:'◐',color:'#ed8f31',next:'Оценить освещённость участка и необходимость дополнительных светильников.'},
  flicker:{name:'Мерцание или неисправность',short:'Мигает фонарь',symbol:'⌁',color:'#e8873c',next:'Проверить электрику и состояние опоры освещения. При искрении избегайте контакта.'},
  danger:{name:'Потенциально опасный участок',short:'Опасный тёмный участок',symbol:'!',color:'#f12277',next:'Приоритетно проверить освещение, особенно около переходов и мест интенсивного движения.'},
  other:{name:'Тема не определена',short:'Не относится к освещению',symbol:'?',color:'#9ca1aa',next:'Опишите проблему с уличным освещением. Этот сервис не обрабатывает другие городские обращения.'}
};
const STORAGE_KEY='lumen-reports-v1';
let REPORTS=[];
let API_MODE=false;
let activeNode=null;
let activeView='overview';
let routeMode='safe';
let selectedRoute=[];
let analyzed=null;
let toastTimeout;
function $(id){return document.getElementById(id);}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

function showToast(s){const toast=$('toast');toast.textContent=s;toast.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('show'),3400);}
function smartDate(r){if(r.source==='demo')return 'Демоданные';try{return new Date(r.createdAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}catch(e){return 'Недавно';}}
function clean(s){return String(s).toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9\s]/g,' ').trim().replace(/\s+/g,' ');}
function gramHash(s){let hash=2166136261;for(let i=0;i<s.length;i++){hash=Math.imul((hash^s.charCodeAt(i))>>>0,16777619)>>>0;}return hash%256;}
function vectorize(text){const s='^'+clean(text)+'$';const arr=new Float64Array(256);for(const n of [3,4]){for(let i=0;i+n<=s.length;i++){arr[gramHash(s.slice(i,i+n))]+=1;}}let norm=0;for(let i=0;i<256;i++)norm+=arr[i]*arr[i];norm=Math.sqrt(norm);if(norm)for(let i=0;i<256;i++)arr[i]/=norm;return arr;}
function infer(text){const model=window.LUMEN_MODEL;if(!model){return {label:'other',confidence:0,probs:[0,0,0,0,1]};}
 const v=vectorize(text), w0=model.weights[0],w1=model.weights[1],b0=model.biases[0],b1=model.biases[1];
 const hidden=new Float64Array(b0.length);
 for(let j=0;j<b0.length;j++){let sum=b0[j];for(let i=0;i<v.length;i++)sum+=v[i]*w0[i][j];hidden[j]=Math.max(0,sum);}
 const logits=Array.from(b1);for(let j=0;j<b0.length;j++)for(let k=0;k<b1.length;k++)logits[k]+=hidden[j]*w1[j][k];
 const maxLogit=Math.max(...logits);let exps=logits.map(z=>Math.exp(z-maxLogit)),tot=exps.reduce((a,b)=>a+b,0);let probs=exps.map(v=>v/tot);
 let idx=probs.indexOf(Math.max(...probs));let label=model.labels[idx];
 // Scope guard for unrelated city topics. The MLP still produces the class probabilities.
 const normalized=clean(text);
 const lightingTerms=/(фонар|ламп|свет|освещ|темн|мерца|морга|ноч|пешеход|переход|опасн|страшн|электр|искр)/;
 const otherTerms=/(мусор|урн|автобус|билет|интернет|парковк|лавочк|снег|пробк)/;
 if(!lightingTerms.test(normalized)|| (otherTerms.test(normalized)&&!/(фонар|ламп|свет|освещ|темн)/.test(normalized))){label='other';idx=model.labels.indexOf('other');}
  // Conservative safety rule: darkness alone does not imply an acute hazard.
  if(label==='danger'&&!/(опасн|дтп|авар|переход|водител|школ|детей|ребен|травм|страшн|боюсь|спотык|упал|паден|машин.*не.*вид)/.test(normalized)){label='dim';idx=model.labels.indexOf('dim');}
 return {label,confidence:probs[idx],probs};
}
function priorityFor(label,text=''){const s=clean(text);const hazard=/(переход|водител|дтп|школ|детей|ребен|авар|опасн)/.test(s)&&/(темн|не гор|нет свет|освещ|пешеход|фонар)/.test(s);if(label==='danger'||(hazard&&label!=='other'))return 'critical';if(label==='outage')return 'high';if(label==='flicker')return /искр|треск|провод|замыкан/.test(clean(text))?'critical':'high';if(label==='dim')return 'medium';return 'none';}
function priorityText(s){return {critical:'Критический',high:'Высокий',medium:'Средний',none:'Не определён'}[s]||'Средний';}
function activeAt(id){return REPORTS.filter(r=>r.node===id&&r.status!=='resolved');}
function currentLight(n){const open=activeAt(n.id);const penalty=open.reduce((s,r)=>s+({critical:25,high:17,medium:10}[r.priority]||3),0);return Math.max(10,n.light-penalty);}
function riskScore(id){return (100-currentLight(NODES[id]))/100;}
function activeReports(){return REPORTS.filter(r=>r.status!=='resolved');}
function renderStats(){const open=activeReports(),critical=open.filter(r=>r.priority==='critical');$('stat-active').textContent=open.length;$('stat-critical').textContent=critical.length;$('stat-resolved').textContent=REPORTS.length-open.length;const avg=Math.round(NODES.reduce((s,n)=>s+currentLight(n),0)/NODES.length);$('stat-index').textContent=avg;$('feed-counter').textContent=REPORTS.length+' сигналов';}
function uniqueSummary(){const open=activeReports();if(!open.length)return {title:'Все сигналы обработаны.',text:'Сейчас в демосхеме нет активных обращений об освещении.'};const byNode=NODES.map(n=>({n,count:activeAt(n.id).length,score:100-currentLight(n)})).sort((a,b)=>b.score-a.score);const worst=byNode[0];return {title:'Больше внимания: '+worst.n.short+'.',text:`По данным пилотной схемы, здесь сейчас индекс освещённости ${currentLight(worst.n)}/100. Проверьте активные обращения на этом участке.`};}
function renderInsight(){const v=uniqueSummary();$('insight-heading').textContent=v.title;$('insight-copy').textContent=v.text;}
function renderFeed(){const el=$('report-feed');const items=[...REPORTS].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));if(!items.length){el.innerHTML='<div class="empty-feed">Пока нет сообщений. Создайте первое AI-обращение.</div>';return;}
 el.innerHTML=items.slice(0,9).map(r=>`<article class="feed-item"><div class="feed-icon ${r.status==='resolved'?'solved':''}">${r.status==='resolved'?'✓':CLASS_DATA[r.label]?.symbol||'!'}</div><div class="feed-text"><div class="feed-title"><b>${escapeHtml(CLASS_DATA[r.label]?.short||'Сигнал')}</b></div><span class="feed-description">${escapeHtml(NODES[r.node]?.short||'Участок')} · ${escapeHtml(smartDate(r))}</span><div class="feed-meta"><span class="feed-tag ${r.status==='resolved'?'resolved':r.priority==='critical'?'critical':''}">${r.status==='resolved'?'Решено':priorityText(r.priority)}</span><span class="feed-tag">${r.source==='demo'?'Демо':'Ваш сигнал'}</span></div>${r.status!=='resolved'?`<button class="feed-action" data-resolve="${escapeHtml(r.id)}">Отметить проверенным ✓</button>`:''}</div></article>`).join('');}
function dijkstra(from,to,mode){const dist=new Array(NODES.length).fill(Infinity),prev=new Array(NODES.length).fill(-1),visited=new Set();dist[from]=0;
 while(visited.size<NODES.length){let u=-1,best=Infinity;for(let i=0;i<NODES.length;i++)if(!visited.has(i)&&dist[i]<best){best=dist[i];u=i;}if(u<0||u===to)break;visited.add(u);
  for(const [a,b] of EDGES){if(a!==u&&b!==u)continue;const v=a===u?b:a;const len=Math.hypot(NODES[a].x-NODES[b].x,NODES[a].y-NODES[b].y);const risk=(riskScore(a)+riskScore(b))/2;const cost=len*(1+(mode==='safe'?3.3:0)*risk);if(dist[u]+cost<dist[v]){dist[v]=dist[u]+cost;prev[v]=u;}}
 }
 const path=[];let cur=to;while(cur!==-1){path.unshift(cur);if(cur===from)break;cur=prev[cur];}return path[0]===from?path:[];
}
function routeInfo(path){let dist=0;for(let i=1;i<path.length;i++)dist+=Math.hypot(NODES[path[i]].x-NODES[path[i-1]].x,NODES[path[i]].y-NODES[path[i-1]].y);const light=path.length?Math.round(path.reduce((s,id)=>s+currentLight(NODES[id]),0)/path.length):0;const risk=path.length?Math.round(path.reduce((s,id)=>s+riskScore(id),0)/path.length*100):0;return {dist:Math.round(dist),light,risk};}
function buildingsSvg(){let s='';const cols=[38,230,418,613,806],rows=[218,355];const shades=['#dde5de','#e2e8e2','#d9e2da','#dce7df'];for(let r=0;r<2;r++)for(let c=0;c<5;c++){
 const x=cols[c]+13,y=rows[r]+10,w=124,h=61;const offset=(r*5+c)%4;s+=`<rect x="${x}" y="${y}" rx="9" width="${w}" height="${h}" fill="${shades[offset]}" opacity=".86"/><path d="M${x+13} ${y+16}h38m-38 13h38m22-13h33m-33 13h33" stroke="#eef2eb" stroke-width="5" stroke-linecap="round" opacity=".7"/>`;}
 return s;
}
function svgMap(mode='overview',path=[]){const gradient='lumen-bg-'+mode;
 const roadBase=EDGES.map(([a,b])=>`<path d="M${NODES[a].x} ${NODES[a].y} L${NODES[b].x} ${NODES[b].y}" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round"/>`).join('');
 const roadInside=EDGES.map(([a,b])=>`<path d="M${NODES[a].x} ${NODES[a].y} L${NODES[b].x} ${NODES[b].y}" fill="none" stroke="#d4ddd8" stroke-width="1.5" stroke-dasharray="3 14" stroke-linecap="round"/>`).join('');
 let altRoute='';let displayRoute=path;
 if(mode==='route'&&path.length){const fast=dijkstra(path[0],path[path.length-1],'fast');if(routeMode==='safe'&&fast.join(',')!==path.join(','))altRoute=`<path class="route-line fast" d="${pathD(fast)}"/>`;}
 const routeOverlay=(mode==='route'&&displayRoute.length)?`<path class="route-shadow" d="${pathD(displayRoute)}"/>${altRoute}<path class="route-line" d="${pathD(displayRoute)}"/><circle cx="${NODES[path[0]].x}" cy="${NODES[path[0]].y}" r="15" class="route-ring"/><circle cx="${NODES[path.at(-1)].x}" cy="${NODES[path.at(-1)].y}" r="16" class="route-ring end"/><text x="${NODES[path.at(-1)].x}" y="${NODES[path.at(-1)].y}" class="route-marker-text">✓</text>`:'';
 const pins=NODES.map(n=>{const open=activeAt(n.id),risk=currentLight(n),good=!open.length;const bad=mode==='route'&&displayRoute.includes(n.id);const fill=good?'#4bbf97':risk<53?'#fb2d8a':'#ee9f46';const nodeR=good?8:11;
 return `<g class="city-node" data-node="${n.id}" role="button" tabindex="0" aria-label="${escapeHtml(n.name)}: ${open.length} обращений"><circle cx="${n.x}" cy="${n.y}" r="${nodeR+11}" fill="${fill}" opacity=".13"/><circle class="node-outer" cx="${n.x}" cy="${n.y}" r="${nodeR+2}" fill="#fff" stroke="${fill}" stroke-width="3"/><circle cx="${n.x}" cy="${n.y}" r="${nodeR-1}" fill="${fill}"/><circle cx="${n.x}" cy="${n.y}" r="2.7" fill="#fff" opacity=".95"/><text class="map-caption" text-anchor="middle" x="${n.x}" y="${n.y+32}">${escapeHtml(n.short)}</text></g>`;}).join('');
 return `<svg class="map-svg" viewBox="0 0 1020 595" preserveAspectRatio="xMidYMid meet" aria-label="Демонстрационная схема участков Тюмени" role="img" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${gradient}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ebf1ed"/><stop offset="1" stop-color="#e5ebe6"/></linearGradient><filter id="river-blur"><feGaussianBlur stdDeviation="1.5"/></filter></defs><rect x="0" y="0" width="1020" height="595" fill="url(#${gradient})"/><path d="M-35 95 C195 80,260 42,490 84 C735 130,785 20,1064 52" fill="none" stroke="#c1e2e5" stroke-width="68" opacity=".75"/><path d="M-35 95 C195 80,260 42,490 84 C735 130,785 20,1064 52" fill="none" stroke="#a7d5d8" stroke-width="38" opacity=".85" filter="url(#river-blur)"/><text x="790" y="84" class="water-label">Т У Р А</text><rect x="20" y="120" width="978" height="427" rx="15" fill="#edf2eb" opacity=".3"/>${buildingsSvg()}<path d="M40 547H986" stroke="#dce3dc" stroke-width="18" stroke-linecap="round"/>${roadBase}${roadInside}<g opacity=".7"><path d="M400 217h70v50h-70z" fill="#d1e5d4"/><circle cx="450" cy="242" r="16" fill="#a7d4b4"/><circle cx="775" cy="420" r="15" fill="#bbd7b6"/><circle cx="772" cy="433" r="9" fill="#c9e3c0"/></g><text x="33" y="579" class="map-hint">LUMEN / SCHEMATIC CITY VIEW</text><text x="988" y="579" text-anchor="end" class="street-label">УСЛОВНАЯ СЕТЬ · ТЮМЕНЬ</text>${routeOverlay}${pins}</svg>`;
}
function pathD(path){return path.map((id,i)=>`${i?'L':'M'}${NODES[id].x} ${NODES[id].y}`).join(' ');}
function bindMap(mountId,mode,path){const mount=$(mountId);mount.innerHTML=svgMap(mode,path)+'<div class="map-tooltip" id="tooltip-'+mode+'" aria-live="polite"></div>';
 const tooltip=$('tooltip-'+mode);function setNode(id){const n=NODES[id];const reports=activeAt(id);tooltip.innerHTML=`<strong>${escapeHtml(n.name)}</strong><span>${reports.length?`${reports.length} активных обращений · `:'Нет активных обращений · '}индекс ${currentLight(n)}/100</span>`;activeNode=id;}
 const init=(mode==='route'&&path.length)?path[path.length-1]:(activeNode??7);setNode(init);
 mount.querySelectorAll('.city-node').forEach(g=>{g.addEventListener('click',()=>setNode(+g.dataset.node));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setNode(+g.dataset.node);}});});
}
function renderMap(){bindMap('overview-map','overview');}
function renderRoute(){const from=+$('route-from').value,to=+$('route-to').value;if(from===to){selectedRoute=[];$('route-compare').textContent='';$('route-summary').innerHTML='<div class="error-ribbon">Выберите разные точки отправления и назначения.</div>';bindMap('route-map','route',[]);return;}
 selectedRoute=dijkstra(from,to,routeMode);bindMap('route-map','route',selectedRoute);const info=routeInfo(selectedRoute);const fastInfo=routeInfo(dijkstra(from,to,'fast'));const difference=info.dist-fastInfo.dist;renderRouteComparison(from,to);
 $('route-summary').innerHTML=`<div class="route-summary-title">✦ Результат: ${routeMode==='safe'?'более освещённый':'более короткий'} маршрут</div><div class="route-metrics"><div class="route-metric"><span>Индекс света</span><b>${info.light}<small> / 100</small></b></div><div class="route-metric"><span>Длина на схеме</span><b>${info.dist}<small> усл. ед.</small></b></div></div><div class="route-advice">${routeMode==='safe'?(difference>0?`Маршрут обходит часть проблемных участков. На схеме он длиннее кратчайшего на ${difference} усл. ед.`:'Найден маршрут с учётом сообщений и уровня освещения.'):'Самый короткий путь по демосхеме, без учёта риска тёмных зон.'} Данные условные, не используйте эту схему для реальной навигации.</div>`;
}
function renderAnalytics(){const counts=Object.keys(CLASS_DATA).filter(c=>c!=='other').map(k=>({k,n:REPORTS.filter(r=>r.label===k).length}));const max=Math.max(...counts.map(x=>x.n),1);
 $('type-chart').innerHTML=counts.map(({k,n})=>`<div class="bar-row"><span>${escapeHtml(CLASS_DATA[k].short)}</span><div class="bar-track"><div style="width:${100*n/max}%"></div></div><b>${n}</b></div>`).join('');
 const open=activeReports().length,total=REPORTS.length,closed=total-open,pct=total?Math.round(open/total*100):0;
 $('status-donut').innerHTML=`<div class="donut" style="background:conic-gradient(#ff2d90 0 ${pct}%,#52d5a1 ${pct}% 100%)"><div><strong>${total}</strong><small>всего обращений</small></div></div><div class="donut-legend"><span><i class="donut-open"></i>Открыто: ${open}</span><span><i class="donut-closed"></i>Решено: ${closed}</span></div>`;
 const sorted=NODES.map(n=>({n,opened:activeAt(n.id).length,idx:currentLight(n)})).sort((a,b)=>a.idx-b.idx).slice(0,8);
 $('areas-table').innerHTML=`<div class="areas-table-head"><div>ТОЧКА</div><div>СИГНАЛЫ</div><div>ИНДЕКС СВЕТА</div><div>СТАТУС</div></div>`+sorted.map(x=>`<div class="area-row"><div><b>${escapeHtml(x.n.name)}</b><small>Демонстрационный участок</small></div><span>${x.opened}</span><span>${x.idx} / 100</span><span class="risk-pill ${x.idx<60?'risk-high':x.idx<77?'risk-medium':''}">${x.idx<60?'Нужна проверка':x.idx<77?'Внимание':'Стабильно'}</span></div>`).join('');
}

function renderAnalysis(result,text){const info=CLASS_DATA[result.label];const urgent=priorityFor(result.label,text);const canSave=result.label!=='other';const conf=Math.round(result.confidence*100);
 $('analysis-output').className='analysis-output';$('analysis-output').innerHTML=`<div class="ai-result-label">НЕЙРОСЕТЬ ОПРЕДЕЛИЛА</div><div class="ai-result-class"><span>${escapeHtml(info.symbol)}</span><span>${escapeHtml(info.name)}</span></div><div class="confidence-bar"><div style="width:${conf}%"></div></div><div class="confidence-line"><span>Оценка уверенности модели</span><b>${conf}%</b></div><div class="ai-facts"><div class="ai-fact"><small>Приоритет проверки</small><b class="${urgent==='critical'?'priority-high':urgent==='medium'?'priority-medium':''}">${priorityText(urgent)}</b></div><div class="ai-fact"><small>Участок</small><b>${escapeHtml(NODES[+$('report-place').value].short)}</b></div></div><div class="ai-next-step"><b>✦ Рекомендация</b><p>${escapeHtml(info.next)}</p></div>${canSave?'<button class="primary-button full submit-report-button" id="save-report-button">Добавить сигнал на карту <span>↗</span></button>':'<div class="error-ribbon" style="margin-top:15px">Пожалуйста, опишите именно проблему уличного освещения.</div>'}`;
 if(canSave)$('save-report-button').addEventListener('click',submitReport);v2Proof(result,text);
}
async function submitReport(){
 const btn=$('save-report-button'),text=$('report-text').value.trim();
 if(!analyzed || analyzed.input!==text || !btn || btn.disabled || analyzed.label==='other')return;
 btn.disabled=true;
 const at=new Date().toISOString(),r={id:uid('user'),node:+$('report-place').value,text,label:analyzed.label,priority:priorityFor(analyzed.label,text),status:'open',source:'user',confidence:+analyzed.confidence.toFixed(3),createdAt:at,history:[{status:'open',at}]};
 if(API_MODE){
  try{const res=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});if(!res.ok)throw Error();const row=await res.json();serverRows=[row,...serverRows];useState(workspace);renderAll();}
  catch{btn.disabled=false;showToast('Сервер не сохранил обращение. Текст остался в форме.');return;}
 }else if(!await changeState(s=>{s.reports.unshift(r);return true;})){btn.disabled=false;return;}
 analyzed=null;$('report-text').value='';$('char-count').textContent='0 / 600';$('analysis-output').className='analysis-output empty';$('analysis-output').innerHTML='<h3>Обращение сохранено</h3><p>Статус и историю можно посмотреть в диспетчерской.</p>';
 navigate('dispatch');showToast('Обращение добавлено.');
}
function resolveReport(id){return v2SetStatus(id,'resolved');}
function initSelectors(){const routeOptions=NODES.map(n=>`<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('');$('route-from').innerHTML=routeOptions;$('route-to').innerHTML=routeOptions;$('report-place').innerHTML=routeOptions;$('route-from').value='8';$('route-to').value='4';$('report-place').value='7';}
async function connectBackend(){if(!window.LUMEN_HAS_API)return;try{const response=await fetch('/api/reports',{signal:AbortSignal.timeout(2500)});if(!response.ok)return;const list=await response.json();if(!Array.isArray(list)||!list.every(v2ValidateRow)||rehearsal)return;API_MODE=true;serverRows=list;useState(workspace);renderAll();}catch(e){/* local offline mode */}}
function init(){reloadState();initSelectors();$('today-chip').textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date());document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));
 $('route-from').addEventListener('change',renderRoute);$('route-to').addEventListener('change',renderRoute);$('build-route').addEventListener('click',renderRoute);$('swap-route').addEventListener('click',()=>{const a=$('route-from').value;$('route-from').value=$('route-to').value;$('route-to').value=a;renderRoute();});
 document.querySelectorAll('.mode-btn').forEach(b=>b.addEventListener('click',()=>{routeMode=b.dataset.mode;document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x===b));renderRoute();}));
 $('report-text').addEventListener('input',()=>{$('char-count').textContent=$('report-text').value.length+' / 600';$('form-error').textContent='';analyzed=null;$('analysis-output').className='analysis-output empty';$('analysis-output').innerHTML='<h3>Проверка текста</h3><p>Запустите анализ после редактирования.</p>';});document.querySelectorAll('.example-chip').forEach(b=>b.addEventListener('click',()=>{$('report-text').value=b.dataset.example;$('report-text').dispatchEvent(new Event('input'));$('form-error').textContent='';}));
 $('analyze-button').addEventListener('click',()=>{const value=$('report-text').value.trim();if(value.length<16){$('form-error').textContent='Опишите проблему подробнее (не менее 16 символов).';return;}const result=infer(value);result.input=value;analyzed=result;renderAnalysis(result,value);showToast(result.label==='other'?'Тема обращения не относится к освещению':'✦ Нейросеть обработала ваше сообщение');});
 $('report-place').addEventListener('change',()=>{if(analyzed)renderAnalysis(analyzed,$('report-text').value);});
 $('report-feed').addEventListener('click',e=>{const b=e.target.closest('[data-resolve]');if(b)resolveReport(b.dataset.resolve);});
 renderAll();const hash=location.hash.replace('#','');navigate(hash||'overview',false);connectBackend();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.LUMEN_TEST={infer,vectorize,dijkstra,routeInfo,NODES};
