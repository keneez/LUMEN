"""LUMEN CV pilot. Tiny actual CNN trained ONLY on procedurally synthesized images.
No claim of camera/real-city validation, no lux estimation or failed-lamp diagnosis.
Reproducible deterministic synthetic train / disjoint synthetic test split.
"""
import random, json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from PIL import Image,ImageDraw,ImageFont
from scenes import CLASSES, scene
ROOT=Path(__file__).resolve().parent.parent
SEED=20261114

class CNN(nn.Module):
 def __init__(self):
    super().__init__()
    self.c1=nn.Conv2d(1,8,3,stride=2,padding=1)
    self.c2=nn.Conv2d(8,12,3,stride=2,padding=1)
    self.d1=nn.Linear(108,32)
    self.d2=nn.Linear(32,len(CLASSES))
 def forward(self,x):
    x=torch.relu(self.c1(x));x=torch.relu(self.c2(x))
    x=nn.functional.adaptive_avg_pool2d(x,(3,3)).flatten(1)
    return self.d2(torch.relu(self.d1(x)))

def make_gallery(model):
    font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    try:f=ImageFont.truetype(font_path,16)
    except:f=None
    result={}
    model.eval()
    for ci,k in enumerate(CLASSES):
        candidates=[]
        for si in range(120):
            seed=880000+ci*200+si
            arr=scene(k,seed)
            with torch.no_grad():
                pred=torch.softmax(model(torch.from_numpy(arr)[None,None]),1).numpy().ravel()
            if int(pred.argmax())==ci:
                candidates.append((pred[ci],seed,arr))
        if not candidates:raise RuntimeError('Could not construct matching demo for '+k)
        # Pick a middle example to avoid cherry-picking max-confidence samples
        candidates.sort(reverse=True,key=lambda v:v[0]);index=min(len(candidates)-1,len(candidates)//3)
        prob,seed,arr=candidates[index]
        # The image itself contains a legitimate street-shape synthetic input;
        # all pixels in the source scene are used by the browser classifier.
        src=Image.fromarray(np.uint8(np.clip(arr*255,0,255)),'L').resize((880,520),Image.Resampling.BICUBIC)
        image=Image.merge('RGB',(src,src,src));px=ImageDraw.Draw(image,'RGBA')
        # transparent outlines act as camera HUD but avoid middle image so not bias model
        px.rectangle((14,12,315,52),fill=(5,9,24,185))
        px.text((28,24),'SYNTHETIC CAMERA / DEMO',font=f,fill=(255,255,255,255))
        px.rectangle((14,469,860,505),fill=(5,9,24,190))
        px.text((27,478),'LUMEN CV LAB   •   TEST SCENE, NOT A LIVE TYUMEN CAMERA',font=f,fill=(237,239,246,255))
        image.save(ROOT/'assets'/f'{k}.jpg',quality=93)
        result[k]={'seed':seed,'predicted_class':CLASSES[int(pred.argmax())],'synthetic_demo_confidence':round(float(prob),4)}
    return result

def main():
    torch.set_num_threads(2);torch.manual_seed(SEED)
    train=[];test=[]
    for ci,k in enumerate(CLASSES):
        for i in range(280):train.append((scene(k,SEED+ci*200000+i),ci))
        for i in range(80):test.append((scene(k,900000+ci*200000+i),ci))
    x=torch.from_numpy(np.stack([a for a,_ in train]))[:,None];y=torch.tensor([b for _,b in train])
    tx=torch.from_numpy(np.stack([a for a,_ in test]))[:,None];ty=torch.tensor([b for _,b in test])
    m=CNN();opt=torch.optim.Adam(m.parameters(),lr=.005,weight_decay=.0001)
    for epoch in range(16):
        m.train();indices=torch.randperm(len(y))
        for batch in indices.split(70):
            out=m(x[batch]);loss=nn.functional.cross_entropy(out,y[batch]);opt.zero_grad();loss.backward();opt.step()
        if epoch%5==0 or epoch==15:
            m.eval()
            with torch.no_grad():acc=(m(tx).argmax(1)==ty).float().mean().item()
            print('epoch',epoch+1,'heldout synthetic acc',round(acc,4),flush=True)
    m.eval()
    with torch.no_grad():preds=m(tx).argmax(1).tolist()
    actual=ty.tolist();conf=[[sum(a==i and p==j for a,p in zip(actual,preds)) for j in range(5)] for i in range(5)]
    metrics={'training':'procedural synthetic city-like illumination frames ONLY','train_samples':len(train),'synthetic_holdout_samples':len(test),'heldout_synthetic_accuracy':round(sum(a==p for a,p in zip(actual,preds))/len(actual),4),'confusion_matrix':conf,'classes':CLASSES,'independent_real_camera_validation':'NOT PERFORMED','source':'ml/train_vision.py','seed':SEED}
    raw={'version':'3.0-demo-cv','classes':CLASSES,'size':[48,48], 'architecture':'2 convolutional layers, adaptive pooling, 2 dense layers, softmax','parameters':sum(z.numel() for z in m.parameters()),'metrics':metrics,'weights':{key:[round(float(v),6) for v in val.detach().reshape(-1)] for key,val in m.state_dict().items()}}
    (ROOT/'cv_model.json').write_text(json.dumps(raw,separators=(',',':')),encoding='utf-8')
    (ROOT/'cv_model.js').write_text('window.LUMEN_CV_MODEL='+json.dumps(raw,separators=(',',':'))+';',encoding='utf-8')
    (ROOT/'ml'/'metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')
    torch.save(m.state_dict(),ROOT/'ml'/'model.pt')
    samples=make_gallery(m)
    (ROOT/'ml'/'samples.json').write_text(json.dumps(samples,indent=2),encoding='utf-8')
    print('parameters',raw['parameters'],'synthetic validation',metrics['heldout_synthetic_accuracy'],'gallery',samples,flush=True)
if __name__=='__main__':main()
