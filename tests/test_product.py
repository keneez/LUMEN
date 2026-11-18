from pathlib import Path
import os
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ['LUMEN_DB_PATH']=str(ROOT/'tests'/'_test_database.sqlite3')
from fastapi.testclient import TestClient
from backend.server import app, analyze, init_db, DB_PATH

def test_model_inference():
    cases=[
        ('Перегорела лампа у остановки и больше не горит фонарь','outage'),
        ('Слишком темно на улице, не хватает освещения и фонарей','dim'),
        ('Фонарь мигает и мерцает рядом с домом','flicker'),
        ('Неосвещенный переход, водители не видят пешеходов, опасно','danger'),
        ('Когда будет автобус и почему на улице мусор','other'),
    ]
    for text,expected in cases:
        assert analyze(text)['label']==expected, (text,analyze(text))

def test_api_roundtrip():
    if DB_PATH.exists():DB_PATH.unlink()
    with TestClient(app) as client:
        h=client.get('/api/health');assert h.status_code==200
        before=client.get('/api/reports');assert before.status_code==200
        assert len(before.json())==10
        d={'node':3,'text':'На Цветном бульваре не работает фонарь, уже три дня не горит свет','label':'dim'}
        r=client.post('/api/reports',json=d);assert r.status_code==201,r.text
        item=r.json();assert item['label']=='outage' # backend independently verifies category
        assert len(client.get('/api/reports').json())==11
        p=client.patch('/api/reports/'+item['id'],json={'status':'resolved'})
        assert p.status_code==200 and p.json()['status']=='resolved'
        reject=client.post('/api/reports',json={'node':3,'text':'Мусор лежит около остановки и автобусы опаздывают','label':'dim'})
        assert reject.status_code==422
    if DB_PATH.exists():DB_PATH.unlink()
