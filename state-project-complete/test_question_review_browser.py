"""Real browser + local API tests. No model calls or production writes."""
from pathlib import Path
from urllib.parse import urlparse
import re
import json

import pytest
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright

from api import Settings, create_app
from test_browser_user_flows import _launch_chromium
from test_question_review_creation import QuestionProvider, TEXT

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def flow(tmp_path):
    settings = Settings(database_path=str(tmp_path/'browser.db'), cors_origins=[], demo_bootstrap=False)
    with TestClient(create_app(settings, provider=QuestionProvider())) as client:
        review = client.post('/api/evidence', json={'content':'An audit suggests some agents approve AI drafts without checking them.'}).json()['reviews'][0]
        with sync_playwright() as pw:
            browser = _launch_chromium(pw)
            page = browser.new_page(viewport={'width':1365,'height':900})
            page.set_default_timeout(5000)
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            requests = []
            def local_api(method, path, body):
                requests.append((method, path.split('?')[0], body))
                response = client.request(method, path, content=body, headers={'content-type':'application/json'})
                return {'status':response.status_code, 'body':response.text}
            page.expose_function('localApi', local_api)
            def boot():
                html = (ROOT/'implementation-context-prototype/index.html').read_text()
                body = re.search(r'<body>(.*)</body>', html, flags=re.S).group(1)
                body = re.sub(r'<script\b.*?</script>', '', body, flags=re.S|re.I)
                css = (ROOT/'site-shell.css').read_text() + '\n' + (ROOT/'implementation-context-prototype/context-tool.css').read_text()
                css += '\n' + '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', html, flags=re.S))
                page.set_content('<html><head><style>'+css+'</style></head><body>'+body+'</body></html>')
                # Local transport only: exercise the real HTTP client against
                # TestClient without a network request or production backend.
                page.add_script_tag(content="""
                  // about:blank has an opaque origin; URL-history rewriting is
                  // outside this flow test, while app navigation stays real.
                  history.replaceState=()=>{}; history.pushState=()=>{};
                  window.STATE_API_BASE='http://local-api.test';
                  window.fetch=async(url, options={})=>{
                    const path=new URL(url,window.STATE_API_BASE).pathname+new URL(url,window.STATE_API_BASE).search;
                    const result=await window.localApi(options.method||'GET',path,options.body||null);
                    return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json'}});
                  };
                  window.StateAnalytics={track(){},trackAskQuery(){}};
                """)
                files = re.findall(r"'(context-[a-z-]+\.js)'", html)
                for name in files:
                    if name == 'context-analytics.js': continue
                    page.add_script_tag(content=(ROOT/'implementation-context-prototype'/name).read_text())
                page.wait_for_function("window.STATE_ASK_TEST_API?.state.backendStatus.reviews==='loaded'")
            page._question_boot = boot
            boot()
            try:
                yield page, client, review, errors, requests
            finally:
                browser.close()


def open_items(page):
    page.locator('[data-view="open-items"]:visible').first.click()
    page.get_by_role('heading', name='Open Items', exact=True).wait_for()


@pytest.mark.parametrize('width',[1365,390])
def test_create_question_uses_same_review_then_becomes_normal_open_item(flow, width):
    page, client, review, errors, requests = flow
    page.set_viewport_size({'width':width,'height':900})
    before_state = client.get('/api/state').json()
    before_history = client.get('/api/history').json()
    open_items(page)
    row = page.locator(f'[data-review-card="{review["id"]}"]')
    # A sole Review expands by default, exactly as the existing workflow does.
    assert row.get_by_text('Question to track', exact=True).count() == 1
    assert row.get_by_role('button', name='Mark reviewed', exact=True).count() == 0
    row.get_by_role('button', name='Create Question', exact=True).click()
    page.locator('.state-toast').filter(has_text='Question created. Current State was not changed.').wait_for()
    assert client.get('/api/state').json() == before_state
    assert client.get('/api/history').json() == before_history
    q = client.get('/api/questions').json()['items'][0]
    page.locator(f'.open-question-item[data-question-id="{q["id"]}"]').wait_for()
    assert not q['blocking']
    assert page.locator(f'[data-review-card="{review["id"]}"]').count() == 0
    page.reload()
    page._question_boot()
    page.wait_for_function("window.STATE_ASK_TEST_API?.state.backendStatus.questions==='loaded'")
    open_items(page)
    page.get_by_text(TEXT, exact=True).first.wait_for()
    assert not errors, errors
    assert len([r for r in requests if r[1].endswith('/resolve')]) == 1
    # Check actual API-backed starter payload, not a fixture scenario.
    result = page.evaluate("async()=>window.STATE_ASK.submit('What are we still unsure about?')")
    items = [i for s in result['answer']['sections'] for i in s['items']]
    assert any(i['record_type']=='question' and i['record_id']==q['id'] for i in items)
    assert not any(i['record_type']=='state' and TEXT in i['text'] for i in items)


def test_dismiss_suggestion_creates_nothing(flow):
    page, client, review, errors, _ = flow
    open_items(page)
    page.get_by_role('button',name='Dismiss suggestion',exact=True).click()
    page.locator('.state-toast').filter(has_text='No Question was created.').wait_for()
    assert client.get('/api/questions').json()['items'] == []
    assert client.get('/api/reviews').json()['items'] == []
    assert client.get('/api/history').json()['items'] == []
    assert not errors, errors


def test_duplicate_is_explained_before_authorization_and_not_created_again(flow):
    page, client, review, errors, _ = flow
    existing = client.post('/api/questions',json={'text':TEXT,'origin':'Manual'}).json()
    page.reload()
    page._question_boot()
    page.wait_for_function("window.STATE_ASK_TEST_API?.state.backendStatus.reviews==='loaded'")
    open_items(page)
    page.get_by_text('Already tracked', exact=True).wait_for()
    page.get_by_role('button',name='Link existing Question',exact=True).click()
    page.locator('.state-toast').filter(has_text='Linked to the existing Question.').wait_for()
    assert [q['id'] for q in client.get('/api/questions').json()['items']] == [existing['id']]
    assert not errors, errors


def test_open_ask_answer_becomes_stale_after_question_only_review(flow):
    page, client, review, errors, _ = flow
    page.locator('#askStateLauncher').click()
    page.locator('#askStateDrawerInput').fill('What are we still unsure about?')
    page.locator('#askStateDrawerInput').press('Enter')
    page.locator('#askStateDrawerResult .ask-live-answer').wait_for()
    assert page.locator('#askStateDrawerResult .ask-state-stale').count() == 0
    page.locator('[data-review-batch-action="close-ask"]').click()
    open_items(page)
    page.get_by_role('button', name='Create Question', exact=True).click()
    page.locator('.state-toast').filter(has_text='Question created.').wait_for()
    page.locator('#askStateLauncher').click()
    page.locator('#askStateDrawerResult .ask-state-stale').wait_for()
    page.locator('[data-review-batch-action="refresh-ask"]').click()
    try:
        page.wait_for_function("!document.querySelector('#askStateDrawerResult .ask-state-stale') && document.querySelector('#askStateDrawerResult .ask-record-question')")
    except Exception:
        print(page.locator('#askStateDrawerResult').inner_html())
        print(errors)
        raise
    assert not errors, errors
