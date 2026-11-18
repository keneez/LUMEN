"""Optional local API for LUMEN: persistence + neural inference, no external services.
All locations and seed incidents are illustrative. Not an official T2 service.
"""
from __future__ import annotations
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import uuid
from contextlib import contextmanager, asynccontextmanager
from datetime import datetime, timezone
from functools import lru_cache
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from package_release import public_files
from pydantic import BaseModel, Field

ROOT=Path(__file__).resolve().parents[1]
DB_PATH=Path(os.environ.get('LUMEN_DB_PATH',str(ROOT/'data'/'lumen.sqlite3')))
LABELS=('outage','dim','flicker','danger','other')
@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield

app=FastAPI(title='LUMEN local pilot API',version='5.0.0',description='Synthetic demo city data; no telecom integration.',lifespan=lifespan)

class ReportIn(BaseModel):
    node:int=Field(ge=0,le=14)
    text:str=Field(min_length=16,max_length=600)
    label:Literal['outage','dim','flicker','danger']
    # Optional UI metadata isn't considered authoritative.
    id:str|None=None
    priority:str|None=None
    status:str|None=None
    source:str|None=None
    confidence:float|None=None
    createdAt:str|None=None

class StatusIn(BaseModel):
    status:Literal['open','in_progress','resolved']

class AnalyzeIn(BaseModel):
    text:str=Field(min_length=16,max_length=600)

@contextmanager
def db_connection():
    DB_PATH.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(DB_PATH)
    db.row_factory=sqlite3.Row
    try:
        yield db
        db.commit()
    finally:
        db.close()

def init_db():
    with db_connection() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS reports
            (id TEXT PRIMARY KEY, node INTEGER NOT NULL, text TEXT NOT NULL,
             label TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL,
             source TEXT NOT NULL, confidence REAL, createdAt TEXT)''')
        columns={row['name'] for row in conn.execute('PRAGMA table_info(reports)')}
        if 'updatedAt' not in columns:
            conn.execute('ALTER TABLE reports ADD COLUMN updatedAt TEXT')
        conn.execute('CREATE TABLE IF NOT EXISTS status_events (report_id TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL)')
        existing=conn.execute('SELECT count(*) FROM reports').fetchone()[0]
        if not existing:
            seed=json.loads((ROOT/'seed.json').read_text('utf-8'))
            conn.executemany('''INSERT INTO reports (id,node,text,label,priority,status,source,confidence,createdAt)
                VALUES (:id,:node,:text,:label,:priority,:status,:source,:confidence,:createdAt)''',
                [{**r,'confidence':None,'createdAt':None} for r in seed])

def list_reports():
    with db_connection() as conn:
        rows=[dict(row) for row in conn.execute('SELECT * FROM reports ORDER BY createdAt DESC, rowid')]
        by_id={row['id']:row for row in rows}
        for event in conn.execute('SELECT * FROM status_events ORDER BY rowid'):
            by_id[event['report_id']].setdefault('history',[]).append({'at':event['at'],'status':event['status']})
        return rows

def priority_for(label:str,text:str):
    if label=='danger' or (re.search(r'(переход|водител|дтп|школ|детей|ребен|авар|опасн)',text) and re.search(r'(темн|не гор|нет свет|освещ|пешеход|фонар)',text) and label!='other'):return 'critical'
    if label=='outage':return 'high'
    if label=='flicker':return 'critical' if any(x in text.lower() for x in ('искр','провод','замыкан')) else 'high'
    if label=='dim':return 'medium'
    return 'none'

@lru_cache(maxsize=1)
def model():
    return json.loads((ROOT/'model.json').read_text('utf-8'))

def clean(s:str):
    return re.sub(r'\s+',' ',re.sub(r'[^а-яa-z0-9\s]',' ',s.lower().replace('ё','е'))).strip()

def gram_hash(s:str):
    h=2166136261
    for c in s:
        h=((h^ord(c))*16777619)&0xffffffff
    return h%256

def vectorize(text:str):
    text='^'+clean(text)+'$'
    v=[0.]*256
    for n in (3,4):
        for i in range(len(text)-n+1):
            v[gram_hash(text[i:i+n])]+=1
    norm=math.sqrt(sum(c*c for c in v))
    if norm:
        v=[c/norm for c in v]
    return v

def analyze(text:str):
    m=model();v=vectorize(text)
    hidden=[]
    for j,b in enumerate(m['biases'][0]):
        hidden.append(max(0.,b+sum(v[i]*m['weights'][0][i][j] for i in range(256))))
    logits=[b+sum(hidden[i]*m['weights'][1][i][j] for i in range(len(hidden))) for j,b in enumerate(m['biases'][1])]
    mx=max(logits);exps=[math.exp(s-mx) for s in logits];denom=sum(exps);p=[s/denom for s in exps]
    idx=max(range(len(p)),key=p.__getitem__)
    label=m['labels'][idx];normalized=clean(text)
    light=re.search(r'(фонар|ламп|свет|освещ|темн|мерца|морга|ноч|пешеход|переход|опасн|страшн|электр|искр)',normalized)
    other=re.search(r'(мусор|урн|автобус|билет|интернет|парковк|лавочк|снег|пробк)',normalized)
    if not light or (other and not re.search(r'(фонар|ламп|свет|освещ|темн)',normalized)):
        label='other';idx=m['labels'].index(label)
    if label=='danger' and not re.search(r'(опасн|дтп|авар|переход|водител|школ|детей|ребен|травм|страшн|боюсь|спотык|упал|паден|машин.*не.*вид)',normalized):
        label='dim';idx=m['labels'].index('dim')
    return {'label':label,'confidence':round(p[idx],5),'probabilities':dict(zip(m['labels'],p)),
            'priority':priority_for(label,normalized),'model':'offline-neural-mlp',
            'synthetic_training_data':True}

@app.get('/api/health')
def health():
    return {'ok':True,'model':'mlp-char-ngram','data':'synthetic-demo','t2_integration':False}

@app.get('/api/reports')
def get_reports():
    return list_reports()

@app.post('/api/reports',status_code=201)
def create_report(report:ReportIn):
    # Re-classify server-side: never trust browser AI category or priority.
    ai=analyze(report.text)
    if ai['label']=='other':
        raise HTTPException(422,detail='The submitted report does not describe street lighting.')
    r={'id':str(uuid.uuid4()),'node':report.node,'text':report.text.strip(),'label':ai['label'],
        'priority':ai['priority'],'status':'open','source':'user','confidence':ai['confidence'],
        'createdAt':datetime.now(timezone.utc).isoformat()}
    with db_connection() as conn:
        conn.execute('''INSERT INTO reports (id,node,text,label,priority,status,source,confidence,createdAt)
                        VALUES (:id,:node,:text,:label,:priority,:status,:source,:confidence,:createdAt)''',r)
        conn.execute('INSERT INTO status_events VALUES (?,?,?)',(r['id'],'open',r['createdAt']))
        r['history']=[{'at':r['createdAt'],'status':'open'}]
    return r

@app.patch('/api/reports/{report_id}')
def patch_report(report_id:str,change:StatusIn):
    with db_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row=conn.execute('SELECT * FROM reports WHERE id=?',(report_id,)).fetchone()
        if not row:
            raise HTTPException(404,detail='Report not found')
        if row['status']!=change.status:
            at=datetime.now(timezone.utc).isoformat()
            conn.execute('UPDATE reports SET status=?,updatedAt=? WHERE id=?',(change.status,at,report_id))
            conn.execute('INSERT INTO status_events VALUES (?,?,?)',(report_id,change.status,at))
        row=dict(conn.execute('SELECT * FROM reports WHERE id=?',(report_id,)).fetchone())
        row['history']=[dict(e) for e in conn.execute('SELECT status,at FROM status_events WHERE report_id=? ORDER BY rowid',(report_id,))]
        return row

@app.post('/api/analyze')
def analyze_report(data:AnalyzeIn):
    return analyze(data.text)

PUBLIC=set(public_files())|{'sw.js'}
@app.get('/runtime.js', include_in_schema=False)
def runtime():
    return Response('window.LUMEN_HAS_API = true;',media_type='application/javascript',headers={'Cache-Control':'no-store'})

@app.get('/{name:path}', include_in_schema=False)
def frontend(name:str):
    name=name or 'index.html'
    if name not in PUBLIC:
        raise HTTPException(404)
    return FileResponse(ROOT/name)
