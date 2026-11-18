const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const fake={style:{},innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},value:'',addEventListener(){},querySelectorAll(){return []}};
const elements={'dispatch-table':{...fake},'dispatch-summary':{...fake}};
const scope={window:{},document:{readyState:'loading',addEventListener(){},getElementById(id){return elements[id]||null;}},console,localStorage:{getItem(){return null},setItem(){}},navigator:{},location:{protocol:'file:'},history:{replaceState(){}},setTimeout,clearTimeout,Date,Math,URL,Blob};
vm.createContext(scope);
for(const script of ['model.js','seed.js','app.js','operations.js','v2.js'])vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),scope,{filename:script});
for(const [phrase,label] of [
 ['Рядом с остановкой фонарь перестал работать и совсем не горит','outage'],
 ['Возле подъезда ночью очень темно и не хватает освещения','dim'],
 ['Светильник моргает и мерцает почти каждую минуту','flicker'],
 ['На тёмном переходе водители совсем не видят людей, опасно','danger'],
 ['Мусор у остановки, автобус опаздывает','other'],
]){
 const got=vm.runInContext(`infer(${JSON.stringify(phrase)}).label`,scope);
 console.log(label,'<-',got,phrase);
 assert.equal(got,label);
}
vm.runInContext('REPORTS=JSON.parse(JSON.stringify(window.LUMEN_SEED))',scope);
assert.equal(vm.runInContext('REPORTS.length',scope),10);
vm.runInContext('renderDispatch()',scope);
assert.ok(elements['dispatch-table'].innerHTML.includes('dispatch-row'));
assert.ok(elements['dispatch-summary'].innerHTML.includes('Групп похожих'));
const group=vm.runInContext('v2Group(REPORTS.find(x=>x.id==="demo-1")).length',scope);
assert.ok(group>0);
assert.equal(vm.runInContext('v2ValidateRow(REPORTS[0])',scope),true);
assert.equal(vm.runInContext('v2ValidateRow({...REPORTS[0],node:999})',scope),false);
const route=vm.runInContext('dijkstra(0,14,"safe")',scope),fast=vm.runInContext('dijkstra(0,14,"fast")',scope);
assert.ok(route.length>0 && fast.length>0);
console.log('OK: model, grouping, dashboard rendering, import validation, routing. Routes:',route.join('→'),'vs',fast.join('→'));
