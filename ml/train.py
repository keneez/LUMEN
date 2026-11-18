"""Reproducible demonstrator: train a small neural classifier on SYNTHETIC Russian reports.
No city records / T2 data are used. Exports offline-compatible model.json.
Run: pip install numpy scikit-learn ; python ml/train.py
"""
from pathlib import Path
import json, re, random
import numpy as np
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

ROOT = Path(__file__).resolve().parents[1]
LABELS=['outage','dim','flicker','danger','other']
TEMPLATES={
'outage':[
'не горит фонарь {place}','сломался фонарь {place}','на улице {place} перестал работать свет',
'светильник выключен {place}','перегорела лампа {place}','уже несколько дней фонари не работают {place}',
'полностью погасло освещение {place}','ряд фонарей не включается {place}',
'по вечерам на участке {place} не работает уличный свет','опора освещения сломалась {place}',
'фонарь погас {place}','не работает освещение пешеходной дорожки {place}',
'сегодня лампы не включились {place}','вдоль улицы {place} не светят фонари',
'весь вечер нет света на тротуаре {place}','сразу два фонаря не работают {place}',
'у остановки {place} перегорел уличный фонарь','у пешеходного перехода {place} отключился свет',
],
'dim':[
'очень темно {place}','плохое освещение {place}','на тротуаре {place} почти нет света',
'не хватает фонарей {place}','слабый свет вдоль дороги {place}',
'дорога {place} плохо освещена','фонари светят слишком тускло {place}',
'пешеходную дорожку {place} практически не видно ночью','нужно добавить освещение {place}',
'по вечерам здесь темно {place}','ночью трудно разглядеть тротуар {place}',
'свет только с одной стороны {place}','на дорожке {place} недостаточно освещения',
'темный участок между домами {place}','света мало около сквера {place}',
'в переулке {place} не хватает яркости фонарей',
],
'flicker':[
'фонарь мигает {place}','уличная лампа мерцает {place}','светильник постоянно моргает {place}',
'искрит опора освещения {place}','фонарь работает с перебоями {place}',
'то включается то выключается свет {place}','свет периодически пропадает {place}',
'нестабильно горит лампа {place}','фонарь трещит и мерцает {place}',
'на улице {place} постоянно моргают фонари','у остановки {place} свет то гаснет то появляется',
'лампа очень сильно мигает {place}','светильник искрит и щелкает {place}',
'электрическая лампа на столбе вспыхивает {place}',
],
'danger':[
'опасный темный переход {place}','на неосвещенном переходе {place} машины не видят пешеходов',
'страшно идти вечером {place}','боюсь ходить ночью {place}',
'не видно детей на переходе {place}','из за темноты люди спотыкаются {place}',
'на дороге {place} можно попасть под машину из за отсутствия света',
'опасно идти по темной дороге {place}','ночью здесь риск ДТП {place}',
'неосвещенный участок у школы {place} очень опасен','пешеходов не видно водителям {place}',
'на плохо освещенном участке {place} человек упал',
'у перехода {place} срочно нужно освещение','нужен срочный ремонт света потому что опасно {place}',
'темный переход и рядом ездят машины {place}',
],
'other':[
'переполнена урна {place}','мусор на тротуаре {place}','автобус долго не приходит {place}',
'сломана лавочка {place}','хочу узнать погоду {place}','большая пробка {place}',
'нет парковочных мест {place}','дорога разбита ямы {place}',
'когда будет автобус {place}','поставьте больше скамеек {place}',
'вода течет из трубы {place}','хочу купить билет {place}',
'кошка потерялась {place}','добрый день {place}',
'мне нужен интернет {place}','плохо ловит мобильная сеть {place}',
'не работает вай фай {place}','уберите снег {place}',
]}
PLACES=['на цветном бульваре','у набережной туры','возле драмтеатра',
'рядом с тюмгу','около центрального рынка','у сквера сибирских кошек',
'в центре тюмени','возле остановки','около школы','на улице республики',
'у пешеходной дорожки','в жилом квартале']
PRE=['','пожалуйста проверьте ','прошу разобраться ','здравствуйте ','сообщаю что ','срочно ']
POST=['',' уже неделю',' по вечерам',' ночью',' помогите решить проблему',' это мешает жителям']

def clean(s):
    s=s.lower().replace('ё','е')
    s=re.sub(r'[^а-яa-z0-9\s]',' ',s)
    return ' '.join(s.split())

def hash_gram(s):
    h=2166136261
    for ch in s:
        h=((h^ord(ch))*16777619)&0xffffffff
    return h%256

def featurize(text):
    s='^'+clean(text)+'$'
    v=np.zeros(256,dtype=np.float32)
    for n in (3,4):
        for i in range(max(0,len(s)-n+1)):
            v[hash_gram(s[i:i+n])]+=1.
    norm=np.sqrt(np.sum(v*v))
    if norm: v/=norm
    return v

def samples():
    rng=random.Random(42)
    rows=[]
    for label, examples in TEMPLATES.items():
        for phrase in examples:
            for _ in range(23):
                place=rng.choice(PLACES)
                text=rng.choice(PRE)+phrase.format(place=place)+rng.choice(POST)
                rows.append((text,label))
    rng.shuffle(rows)
    return rows

if __name__=='__main__':
    data=samples()
    X=np.stack([featurize(x) for x,_ in data]); Y=np.array([LABELS.index(y) for _,y in data])
    Xtr,Xte,Ytr,Yte=train_test_split(X,Y,test_size=.18,stratify=Y,random_state=42)
    model=MLPClassifier(hidden_layer_sizes=(40,),activation='relu',solver='adam',
                        learning_rate_init=.003,max_iter=125,early_stopping=True,
                        n_iter_no_change=11,random_state=42,batch_size=96)
    model.fit(Xtr,Ytr)
    print('train points:',len(Xtr),'test:',len(Xte),'iters:',model.n_iter_)
    print(classification_report(Yte,model.predict(Xte),target_names=LABELS,digits=3))
    payload={
       'kind':'MLPClassifier','input_dim':256,'labels':LABELS,'trained_on':'synthetic_examples_only',
       'notes':'Neural model for demonstration, not validated on live city complaints.',
       'weights':[model.coefs_[0].round(7).tolist(),model.coefs_[1].round(7).tolist()],
       'biases':[model.intercepts_[0].round(7).tolist(),model.intercepts_[1].round(7).tolist()],
    }
    (ROOT/'model.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),'utf-8')
    (ROOT/'model.js').write_text('window.LUMEN_MODEL='+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
    print('model MB:',round((ROOT/'model.json').stat().st_size/1e6,2))
    for t in ['На Цветном бульваре совсем не горят два фонаря','Очень темно около остановки, света мало','Фонарь моргает у ТюмГУ','Пешеходов не видно водителям возле школы, опасно','Автобусы опаздывают и мусор кругом']:
        v=featurize(t)
        p=model.predict_proba(v.reshape(1,-1))[0]
        print(t, '->',LABELS[np.argmax(p)],round(max(p),2))
