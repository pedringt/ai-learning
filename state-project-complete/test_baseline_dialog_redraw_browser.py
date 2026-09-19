"""Issue #230: the Baseline review dialog must not stay stale after analysis finishes.

Real browser + local API, no model calls. The fixture provider produces two
draft facts. A fetch shim makes ``GET /api/baseline/draft`` report "still
analyzing, no facts yet" until the test releases it, which is what the app sees
when a person opens the review dialog before background analysis completes.
"""
from pathlib import Path
import json
import re
import time

import pytest
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright

from api import Settings, create_app
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_browser_user_flows import _launch_chromium

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'implementation-context-prototype'


@pytest.fixture
def flow(tmp_path):
    settings = Settings(database_path=str(tmp_path / 'baseline.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as client:
        project = client.post('/api/projects', json={'name': 'Redraw Project'}).json()
        headers = {'X-State-Project-Id': project['id']}
        client.post('/api/projects/switch', json={'project_id': project['id']})
        for note in ('First baseline note about what State is.', 'Second baseline note about development.'):
            assert client.post('/api/evidence', headers=headers, json={'content': note, 'source_type': 'manual_note'}).status_code == 201
        assert len([i for i in client.get('/api/baseline/draft', headers=headers).json()['draft']['items'] if i['kind'] == 'proposed']) == 2

        with sync_playwright() as pw:
            browser = _launch_chromium(pw)
            page = browser.new_page(viewport={'width': 1365, 'height': 900})
            page.set_default_timeout(8000)
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            gate = {'analyzing': True, 'slow': False, 'keep_facts': False}

            def local_api(method, path, body, request_headers):
                response = client.request(method, path, content=body, headers=request_headers)
                text = response.text
                if gate['analyzing'] and method == 'GET' and path.split('?')[0] == '/api/baseline/draft' and response.status_code == 200:
                    payload = response.json()
                    payload['counts'].update(processing_evidence=1)
                    if not gate['keep_facts']:
                        payload['counts'].update(current_items=0, proposed_items=0)
                    payload['can_confirm'] = False
                    if not gate['keep_facts']:
                        payload['draft']['items'] = []
                    text = json.dumps(payload)
                if gate['slow'] and method == 'GET' and path.split('?')[0] == '/api/baseline/draft':
                    time.sleep(0.6)  # a slow deployed round trip
                return {'status': response.status_code, 'body': text}

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
              window.fetch=async(url, options={})=>{
                const target=new URL(url,window.STATE_API_BASE);
                const result=await window.localApi(options.method||'GET',target.pathname+target.search,options.body||null,options.headers||{});
                return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json'}});
              };
              window.StateAnalytics={track(){},trackAskQuery(){}};
            """)
            for name in re.findall(r"'(context-[a-z-]+\.js)'", html):
                if name != 'context-analytics.js':
                    page.add_script_tag(content=(FRONTEND / name).read_text())
            page.wait_for_function("window.STATE_ASK_TEST_API?.state.backendStatus.reviews==='loaded'")
            try:
                yield page, client, project, headers, gate, errors
            finally:
                browser.close()


def open_review_dialog_while_analyzing(page, gate):
    """Open the dialog the way Deep QA (or a fast user) can while analysis runs.

    While ``processing_evidence > 0`` the current banner has no review button,
    but the older banner renderer in context-baseline-setup.js briefly puts one
    back whenever the view re-renders. With a slow draft response that window is
    wide enough to click into.
    """
    gate['slow'] = True
    page.evaluate("""(() => {const root=document.getElementById('viewRoot');
      const n=document.createElement('span');root.appendChild(n);n.remove();})()""")
    page.locator('[data-baseline-review-starting]').first.click()
    page.locator('.baseline-draft-dialog').wait_for()
    gate['slow'] = False


def test_dialog_opened_during_analysis_redraws_with_facts_when_analysis_finishes(flow):
    page, client, project, headers, gate, errors = flow
    open_review_dialog_while_analyzing(page, gate)
    dialog = page.locator('.baseline-draft-dialog')
    assert 'still being analyzed' in dialog.inner_text()
    assert dialog.locator('.baseline-draft-fact').count() == 0

    gate['analyzing'] = False  # analysis completes on the server
    page.evaluate("document.dispatchEvent(new Event('state-baseline-analysis-started'))")

    page.locator('.baseline-draft-fact').first.wait_for()
    assert page.locator('.baseline-draft-fact').count() == 2
    assert 'still being analyzed' not in page.locator('.baseline-draft-dialog').inner_text()
    assert page.locator('[data-baseline-confirm-starting]').is_enabled()
    assert errors == []


def test_edits_in_an_open_dialog_survive_the_redraw_when_analysis_finishes(flow):
    page, client, project, headers, gate, errors = flow
    gate['keep_facts'] = True  # a first source is done; another is still analyzing
    open_review_dialog_while_analyzing(page, gate)
    assert page.locator('.baseline-draft-fact').count() == 2
    first = page.locator('.baseline-draft-fact').first
    proposal_id = first.get_attribute('data-proposal-id')
    first.locator('[data-baseline-statement]').fill('My own wording, typed while analysis was running.')
    page.locator('.baseline-draft-fact').nth(1).locator('[data-baseline-remove-fact]').click()
    second_id = page.locator('.baseline-draft-fact').nth(1).get_attribute('data-proposal-id')

    gate['analyzing'] = False  # analysis finishes: the draft changes, so the dialog redraws
    page.wait_for_function("!document.querySelector('.baseline-draft-status')?.textContent.includes('still being analyzed')")

    edited = page.locator(f'.baseline-draft-fact[data-proposal-id="{proposal_id}"] [data-baseline-statement]')
    assert edited.input_value() == 'My own wording, typed while analysis was running.'
    assert page.locator(f'.baseline-draft-fact[data-proposal-id="{second_id}"]').get_attribute('data-removed') == 'true'
    assert errors == []


def test_adding_a_manual_fact_reopens_the_dialog_even_without_a_banner_review_button(flow):
    """Deep QA run 2: the fact saved (201) but the dialog kept showing the old rows.

    The reopen used to click the banner's review button, which is absent whenever
    the banner is mid-render, so the click silently did nothing.
    """
    page, client, project, headers, gate, errors = flow
    gate['analyzing'] = False
    page.locator('[data-baseline-review-starting]').first.click()
    page.locator('.baseline-draft-dialog').wait_for()
    assert page.locator('.baseline-draft-fact').count() == 2

    page.locator('[data-baseline-add-fact]').click()
    page.locator('[data-baseline-new-area]').fill('Success')
    page.locator('[data-baseline-new-topic]').fill('Success measure')
    page.locator('[data-baseline-new-statement]').fill('Weekly status preparation takes under 30 minutes.')
    gate['slow'] = True  # keeps the banner without its button for a while
    page.evaluate("document.querySelectorAll('[data-baseline-review-starting]').forEach(b => b.remove())")
    page.locator('[data-baseline-save-new-fact]').click()

    page.wait_for_function("document.querySelectorAll('.baseline-draft-fact').length === 3")
    assert errors == []
