"""Build a standalone static site and, optionally, the Netlify drag-and-drop ZIP."""
import argparse
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED
import json
import shutil
import tomllib

ROOT=Path(__file__).resolve().parent
FILES=('index.html credits.html manifest.webmanifest favicon.svg icon-192.png icon-512.png '
       'styles.css vision.css v4.css studio.css runtime.js model.js seed.js app.js operations.js '
       'v2.js cv_model.js vision.js workspace.js shift.js geo.js v4.js pitch/LUMEN_5_0_Pitch.pdf').split()
def public_files():
    return sorted(set(FILES)|{p.relative_to(ROOT).as_posix() for d in ('assets','vendor/leaflet') for p in (ROOT/d).rglob('*') if p.is_file()})
def build(out,archive=None):
    out.mkdir(parents=True,exist_ok=True)
    files=public_files()
    # Cache only local assets. OSM fetches, other sites and API traffic pass through.
    tag=sha256()
    for name in files:
        src=ROOT/name
        tag.update(name.encode());tag.update(src.read_bytes())
        dst=out/name
        dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
    template=(ROOT/'sw-template.js').read_text()
    tag.update(template.encode())
    sw=template.replace('__VERSION__',tag.hexdigest()[:16]).replace('__FILES__',json.dumps(['./'+n for n in files]))
    (out/'sw.js').write_text(sw);(ROOT/'sw.js').write_text(sw)
    config=tomllib.loads((ROOT/'netlify.toml').read_text())
    (out/'_headers').write_text(''.join(h['for']+'\n'+''.join('  '+k+': '+v+'\n' for k,v in h['values'].items()) for h in config['headers']))
    if archive:
        with ZipFile(archive,'w',ZIP_DEFLATED) as z:
            for name in [*files,'sw.js','_headers']:
                z.write(out/name,name)
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--zip',type=Path);parser.add_argument('--site-only',action='store_true')
    args=parser.parse_args()
    dist=ROOT/'dist'
    if dist.exists():shutil.rmtree(dist)
    build(dist,args.zip)

