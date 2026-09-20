"""Issue #232: Evidence added before the app finishes opening its project must not go to the seed project.

Real browser + local API, no model calls. The page ships with seed data for
Northstar, and `#projectSwitcher`'s `data-project-id` used to be filled from that
seed before the server had confirmed which project the tab is on. The Evidence
code builds its `X-State-Project-Id` header from that attribute, so Evidence added
in the window between page load and hydration was sent to Northstar even though the
server's active project (what the tab is about to open) was a different one.

The fetch shim can hold `GET /api/bootstrap` open, which keeps the page unhydrated
for as long as the test wants.
"""
from pathlib import Path
import re

import pytest
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright

from api import Settings, create_app
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_browser_user_flows import _launch_chromium

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'implementation-context-prototype'
NOTE = 'Second baseline note about development, added before the project finished opening.'


def _open_page(client, *, hold_bootstrap):
    """Load the real frontend against `client`. Returns (page, browser, requests, errors, pw)."""
    pw = sync_playwright().start()
    browser = _launch_chromium(pw)
    page = browser.new_page(viewport={'width': 1365, 'height': 900})
    page.set_default_timeout(8000)
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def local_api(method, path, body, request_headers):
        headers = {k.lower(): v for k, v in (request_headers or {}).items()}
        requests.append({'method': method, 'path': path.split('?')[0], 'project': headers.get('x-state-project-id'), 'body': body})
        response = client.request(method, path, content=body, headers=request_headers)
        return {'status': response.status_code, 'body': response.text}

    page.expose_function('localApi', local_api)
    html = (FRONTEND / 'index.html').read_text()
    body = re.search(r'<body>(.*)</body>', html, flags=re.S).group(1)
    body = re.sub(r'<script\b.*?</script>', '', body, flags=re.S | re.I)
    css = (FRONTEND / 'state-shell.css').read_text() + '\n' + (FRONTEND / 'context-tool.css').read_text()
    css += '\n' + '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', html, flags=re.S))
    page.set_content('<html><head><style>' + css + '</style></head><body>' + body + '</body></html>')
    page.add_script_tag(content="""
      history.replaceState=()=>{}; history.pushState=()=>{};
      window.STATE_API_BASE='http://local-api.test';
      let release=null;
      window.__bootstrapGate=%s?new Promise(r=>{release=r}):null;
      window.__releaseBootstrap=()=>{if(release)release()};
      window.fetch=async(url, options={})=>{
        const target=new URL(url,window.STATE_API_BASE);
        if(target.pathname==='/api/bootstrap'&&window.__bootstrapGate)await window.__bootstrapGate;
        const result=await window.localApi(options.method||'GET',target.pathname+target.search,options.body||null,options.headers||{});
        return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json'}});
      };
      window.StateAnalytics={track(){},trackAskQuery(){}};
    """ % ('true' if hold_bootstrap else 'false'))
    for name in re.findall(r"'(context-[a-z-]+\.js)'", html):
        if name != 'context-analytics.js':
            page.add_script_tag(content=(FRONTEND / name).read_text())
    return page, browser, requests, errors, pw


def _hydrated(page):
    page.wait_for_function("window.STATE_ASK_TEST_API?.state.backendStatus.reviews==='loaded'")


@pytest.fixture
def backend(tmp_path):
    settings = Settings(database_path=str(tmp_path / 'preload.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as client:
        project = client.post('/api/projects', json={'name': 'Preload Project'}).json()
        client.post('/api/projects/switch', json={'project_id': project['id']})
        # Established, so "Add Evidence" is the ordinary Evidence flow (what Deep QA hit
        # after Confirm), not the Baseline starting-material dialog.
        assert client.post('/api/baseline/finish', headers={'X-State-Project-Id': project['id']}, json={}).status_code == 200
        yield client, project


def _evidence_contents(client, project_id):
    response = client.get('/api/evidence', headers={'X-State-Project-Id': project_id})
    items = response.json().get('items', [])
    return [item['content'] for item in items]


def test_evidence_added_before_the_project_opens_goes_to_the_servers_active_project(backend):
    client, project = backend
    page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=True)
    try:
        # Still unhydrated: the switcher must not claim the seed project (Northstar).
        assert page.evaluate("document.getElementById('projectSwitcher').dataset.projectId || ''") == ''

        page.locator('[data-action="add-info"]:visible').first.click()
        page.locator('#addInfoText').fill(NOTE)
        page.locator('[data-action="save-info"]').click()
        page.wait_for_timeout(1500)

        posts = [r for r in requests if r['method'] == 'POST' and r['path'] == '/api/evidence']
        assert posts, f'no Evidence POST was made: {[(r["method"], r["path"]) for r in requests]}'
        assert posts[0]['project'] != 'northstar', 'Evidence was sent with the seed project id'

        page.evaluate('window.__releaseBootstrap()')
        _hydrated(page)
        assert NOTE in _evidence_contents(client, project['id']), 'Evidence did not land in the active project'
        assert NOTE not in _evidence_contents(client, 'northstar'), 'Evidence leaked into Northstar'
        assert errors == []
    finally:
        browser.close(); pw.stop()


def test_once_the_project_is_open_the_switcher_and_evidence_use_its_id(backend):
    client, project = backend
    page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=False)
    try:
        _hydrated(page)
        assert page.evaluate("document.getElementById('projectSwitcher').dataset.projectId") == project['id']

        page.locator('[data-action="add-info"]:visible').first.click()
        page.locator('#addInfoText').fill(NOTE)
        page.locator('[data-action="save-info"]').click()
        page.wait_for_timeout(1500)
        posts = [r for r in requests if r['method'] == 'POST' and r['path'] == '/api/evidence']
        assert posts and posts[0]['project'] == project['id']
        assert errors == []
    finally:
        browser.close(); pw.stop()


def test_a_tab_that_opens_northstar_still_gets_its_project_id(tmp_path):
    """Northstar's name equals the seed's, so the label-change guard must not swallow the id."""
    settings = Settings(database_path=str(tmp_path / 'northstar.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as client:
        page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=True)
        try:
            assert page.evaluate("document.getElementById('projectSwitcher').dataset.projectId || ''") == ''
            page.evaluate('window.__releaseBootstrap()')
            _hydrated(page)
            assert page.evaluate("document.getElementById('projectSwitcher').dataset.projectId") == 'northstar'
            assert errors == []
        finally:
            browser.close(); pw.stop()
