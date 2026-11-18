const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const scope={window:{},document:{readyState:'loading',addEventListener(){},getElementById(){return null}},localStorage:{getItem(){return null},setItem(){}},navigator:{},location:{protocol:'file:'},history:{replaceState(){}},console,Math,Date,setTimeout,clearTimeout};
vm.createContext(scope);
for(const f of ['model.js','seed.js','app.js','shift.js','v4.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),scope,{filename:f});
vm.runInContext('REPORTS=JSON.parse(JSON.stringify(window.LUMEN_SEED))',scope);
let initial=vm.runInContext('v4PriorityRows({flow:45,weather:20,cross:50})',scope);
let rough=vm.runInContext('v4PriorityRows({flow:45,weather:100,cross:50})',scope);
assert.equal(initial.length,15);assert.equal(rough.length,15);
for(let i=0;i<15;i++){let a=initial.find(x=>x.node===i),b=rough.find(x=>x.node===i);assert(b.score>=a.score);}
const bad=vm.runInContext('v4QualityFromPixels(new Uint8ClampedArray(48*48*4),48,48)',scope);
assert(!bad.usable);assert(bad.flags.length>0);
const geo=scope.window.LUMEN_V4_TEST.V4_GEO;assert.equal(geo.length,4);
assert(geo.every(g=>g.lat>57.14&&g.lat<57.18&&g.lng>65.50&&g.lng<65.56));
let scores=vm.runInContext('v4PriorityRows({flow:45,weather:20,cross:50})',scope);
assert(scores.every(x=>x.score>=0&&x.score<=100));
console.log('PASS LUMEN 4.0: 4 geo-anchors, scenario monotonicity, score bounds, image-quality guard');
