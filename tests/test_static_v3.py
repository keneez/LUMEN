from pathlib import Path
import re, json, tomllib
from zipfile import ZipFile
ROOT=Path(__file__).resolve().parents[1]
def test_static_assets_and_navigation():
    html=(ROOT/'index.html').read_text()
    files=['index.html','styles.css','vision.css','app.js','v2.js','vision.js','model.js','cv_model.js','seed.js','sw.js','netlify.toml','manifest.webmanifest']
    files += [f'assets/{c}.jpg' for c in ['lit','dark','uneven','glare','day']]
    for f in files:assert (ROOT/f).is_file(),f
    for s in ['overview','routes','report','analytics','dispatch','pilot','vision']:
        assert f'id="view-{s}"' in html
        assert f'data-view="{s}"' in html
    assert 'ВЕРСИЯ 2.0' not in html
    assert len(re.findall(r'id="view-vision"',html))==1
    assert 'Камеры города и Т2 не подключены' in html
    assert 'синтетических' in html.lower()
def test_camera_policy_and_model():
    cfg=tomllib.loads((ROOT/'netlify.toml').read_text())
    hdr=cfg['headers'][0]['values']
    assert 'camera=(self)' in hdr['Permissions-Policy']
    assert 'blob:' in hdr['Content-Security-Policy']
    mdl=json.loads((ROOT/'cv_model.json').read_text())
    assert mdl['parameters']==4609
    assert set(mdl['classes'])=={'lit','dark','uneven','glare','day'}
    assert mdl['metrics']['train_samples']==1400
    assert mdl['metrics']['synthetic_holdout_samples']==400
    assert mdl['metrics']['independent_real_camera_validation']=='NOT PERFORMED'
    for w in ['c1.weight','c1.bias','c2.weight','c2.bias','d1.weight','d1.bias','d2.weight','d2.bias']:
        assert w in mdl['weights']
    assert 'camera=(self)' in (ROOT/'netlify.toml').read_text()
