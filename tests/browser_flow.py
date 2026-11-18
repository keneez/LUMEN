"""Run against an extracted deploy using LUMEN_SITE, or the local dist by default."""
import functools
import http.server
import os
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def main():
    site=Path(os.environ.get('LUMEN_SITE',Path(__file__).resolve().parents[1]/'dist')).resolve()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=site))
    Thread(target=server.serve_forever,daemon=True).start()
    url='http://127.0.0.1:'+str(server.server_port)+'/'
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('LUMEN_CHROMIUM'),args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
        ctx=browser.new_context(viewport={'width':1365,'height':850})
        page=ctx.new_page();page.set_default_timeout(6500)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.accept())
        page.goto(url);btn=page.locator
        expect(btn('#stat-active')).not_to_have_text('—')
        assert page.title().startswith('LUMEN 5.0')
        def go(view):
            btn('button[data-view="'+view+'"]').click()
            expect(btn('#view-'+view)).to_be_visible()
        for view in ['overview','analytics','report','dispatch','citymap','routes','forecast','pilot','vision']:
            go(view)
        if os.environ.get('LUMEN_SCREENSHOTS'):
            go('overview');page.screenshot(path=os.environ['LUMEN_SCREENSHOTS']+'/desktop.png');go('vision')
        btn('#cv-analyze').click();expect(btn('#cv-place')).to_be_visible()
        btn('#cv-place').select_option('3');btn('#cv-add-to-queue').click()
        expect(btn('[data-cv-confirm]')).to_have_count(1)
        btn('#cv-add-to-queue').click();expect(btn('[data-cv-confirm]')).to_have_count(1)
        assert page.evaluate('currentLight(NODES[3])')==94
        btn('[data-review-note]').fill('Проверено в браузере');btn('[data-cv-confirm]').click()
        expect(btn('.review-status')).to_have_text('Подтверждён')
        assert page.evaluate('currentLight(NODES[3])')==84
        go('routes');table=btn('#route-compare').inner_text()
        assert '76 / 100' in table and '79 / 100' in table and table.count('332')==2,table
        go('forecast');btn('#make-plan').click();expect(btn('.plan-item')).to_have_count(3)
        first=btn('.plan-item').first;first.locator('select').select_option('clear');first.locator('input').fill('Осмотр выполнен');first.locator('button').click()
        expect(btn('.plan-summary')).to_contain_text('Осмотрено 1 из 3')
        with page.expect_download() as download:btn('#export-plan').click()
        assert 'Осмотр выполнен' in Path(download.value.path()).read_text('utf-8-sig')
        go('dispatch')
        with page.expect_download() as download:btn('#export-json').click()
        backup=Path(download.value.path()).read_bytes()
        btn('#reset-demo').click();expect(btn('#dispatch-table .dispatch-row')).to_have_count(10)
        btn('#import-json').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
        expect(btn('#dispatch-table .dispatch-row')).to_have_count(11)
        page.reload();go('forecast');expect(btn('.plan-summary')).to_contain_text('Осмотрено 1 из 3')
        prior=page.evaluate('localStorage.getItem(WORKSPACE_KEY)')
        for _ in range(2):
            btn('#start-demo-top').click()
            for step in range(1,7):
                expect(btn('#v2-coach .v2-coach-top')).to_contain_text(str(step)+'/6')
                btn('#v2-coach-next').click()
            expect(btn('#v2-coach')).to_have_count(0)
            assert page.evaluate('localStorage.getItem(WORKSPACE_KEY)')==prior
        go('report');btn('#report-text').fill('На улице у остановки фонарь не горит уже три дня.')
        btn('#analyze-button').click();expect(btn('#save-report-button')).to_be_visible()
        btn('#report-text').fill('На улице у остановки фонарь не горит уже неделю.')
        expect(btn('#save-report-button')).to_have_count(0)
        btn('#analyze-button').click();btn('#save-report-button').click()
        expect(btn('#dispatch-table .dispatch-row')).to_have_count(12)
        btn('[data-status-id^="user-"]').select_option('in_progress')
        expect(btn('.status-history').first).to_be_attached()
        go('citymap');btn('[data-v4-loc="cats"]').click();expect(btn('#geo-detail')).to_contain_text('Сибирских кошек')
        page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller !== null')
        ctx.set_offline(True);page.reload();go('vision');btn('#cv-analyze').click();expect(btn('#cv-add-to-queue')).to_be_visible()
        ctx.set_offline(False);page.set_viewport_size({'width':390,'height':844});page.goto(url)
        btn('#mobile-menu').click();go('vision');expect(btn('#navigation')).not_to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if os.environ.get('LUMEN_SCREENSHOTS'):
            page.goto(url);page.screenshot(path=os.environ['LUMEN_SCREENSHOTS']+'/mobile.png')
        assert not errors,errors
        browser.close()
    server.shutdown();server.server_close()
    print('PASS: navigation, image review, route, plan, CSV, backup restore, two isolated rehearsals, text, geo, offline, mobile.')
if __name__=='__main__':main()
