const fs=require('fs'),vm=require('vm'),assert=require('assert'),sharp=require('sharp'),path=require('path');
const root=path.resolve(__dirname,'..');
const ctx={console,window:{},document:{readyState:'loading',createElement:()=>({width:48,height:48,getContext:()=>({})}),addEventListener:()=>{}},Float32Array,Math};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'cv_model.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'vision.js'),'utf8'),ctx);
const expect={lit:'lit',dark:'dark',uneven:'uneven',glare:'glare',day:'day'};
(async()=>{
 for(const [name,wanted] of Object.entries(expect)){
  const {data,info}=await sharp(path.join(root,'assets',name+'.jpg')).resize(48,48,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.channels!==4)throw Error('bad channels '+info.channels);
  const r=ctx.window.LUMEN_CV_TEST.cvInferPixels(data);
  console.log(name,'=>',r.kind,'p',r.confidence.toFixed(5),r.stats);
  assert.equal(r.kind,wanted);
 }
 console.log('CV browser-runtime inference matches synthetic test gallery.');
})().catch(e=>{console.error(e);process.exit(1)});
