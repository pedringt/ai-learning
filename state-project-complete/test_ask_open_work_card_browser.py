"""#710 / DEC-031: "What's still open?" and "What's unresolved?" are answered by the browser's Open Items card, with
both totals, from the tab's own project, and with no Ask call.

Real browser + local API, no model calls. The card used to count Questions only ("0 questions are open." while
Reviews waited for a decision), which is how the Nov 17 report started.
"""
from fastapi.testclient import TestClient
import pytest

from api import Settings, create_app
from ask_display import open_work_line
from test_ask_open_work import OneRecordAsk
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_preload_project_header_browser import _hydrated, _open_page

QUERIES = ["What's still open?", "What's unresolved?"]


@pytest.fixture
def client(tmp_path):
    settings = Settings(database_path=str(tmp_path / 'card.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider(), ask_provider=OneRecordAsk())) as c:
        yield c


def _expected(client, project_id):
    headers = {'X-State-Project-Id': project_id}
    questions = client.get('/api/questions', params={'status': 'open'}, headers=headers).json()['items']
    reviews = client.get('/api/reviews', params={'status': 'open'}, headers=headers).json()['items']
    return open_work_line({'open_work': {'questions': len(questions), 'reviews': len(reviews)}})


def _ask_card(page, query):
    page.locator('#askStateLauncher').click()
    box = page.locator('#askStateDrawerInput')
    box.fill(query)
    # The test page loads only part of the CSS, which leaves the Ask button off-screen; submit the form itself.
    page.evaluate("document.querySelector('.ask-state-drawer-form').requestSubmit()")
    page.wait_for_selector('.ask-routing-card')
    return page.locator('.ask-routing-card').last


def _close_drawer(page):
    page.keyboard.press('Escape')


def _run(client, *, check):
    page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=False)
    try:
        _hydrated(page)
        check(page, requests)
        assert not [r for r in requests if r['path'].startswith('/api/ask')], 'the card should answer without Ask'
        assert errors == []
    finally:
        browser.close(); pw.stop()


@pytest.mark.parametrize('query', QUERIES)
def test_the_card_shows_both_totals_for_the_tabs_project(client, query):
    def check(page, requests):
        card = _ask_card(page, query)
        text = card.inner_text()
        assert _expected(client, 'northstar') in text, text
        assert 'Open Items' in text and card.locator('[data-view="open-items"]').count() == 1
    _run(client, check=check)


def test_no_open_questions_still_shows_the_reviews_waiting(client):
    juniper = {'X-State-Project-Id': 'juniper'}
    for q in client.get('/api/questions', params={'status': 'open'}, headers=juniper).json()['items']:
        assert client.post(f"/api/questions/{q['id']}/stop", headers=juniper, json={}).status_code == 200
    client.post('/api/projects/switch', json={'project_id': 'juniper'})
    reviews = len(client.get('/api/reviews', params={'status': 'open'}, headers=juniper).json()['items'])
    assert reviews > 0

    def check(page, requests):
        text = _ask_card(page, "What's unresolved?").inner_text()
        assert f"No open Questions · {reviews} Reviews awaiting a decision" in text, text
        assert '0 questions are open' not in text
    _run(client, check=check)


def test_an_empty_project_says_no_for_both(client):
    project = client.post('/api/projects', json={'name': 'Blank'}).json()
    client.post('/api/projects/switch', json={'project_id': project['id']})
    assert client.post('/api/baseline/finish', headers={'X-State-Project-Id': project['id']}, json={}).status_code == 200

    def check(page, requests):
        text = _ask_card(page, "What's still open?").inner_text()
        assert 'No open Questions · No Reviews awaiting a decision' in text, text
    _run(client, check=check)


def test_the_card_counts_the_tabs_project_not_the_one_another_tab_switched_to(client):
    client.post('/api/projects/switch', json={'project_id': 'juniper'})
    juniper_line = _expected(client, 'juniper')
    assert juniper_line != _expected(client, 'northstar')

    def check(page, requests):
        assert page.evaluate("document.getElementById('projectSwitcher').dataset.projectId") == 'juniper'
        client.post('/api/projects/switch', json={'project_id': 'northstar'})   # another tab moves the shared pointer
        text = _ask_card(page, "What's still open?").inner_text()
        assert juniper_line in text, text
    _run(client, check=check)


def test_before_the_project_loads_the_card_does_not_guess_zero(client):
    page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=True)
    try:
        page.locator('#askStateLauncher').click()
        page.locator('#askStateDrawerInput').fill("What's still open?")
        page.evaluate("document.querySelector('.ask-state-drawer-form').requestSubmit()")
        page.wait_for_timeout(1500)
        cards = page.locator('.ask-routing-card')
        assert cards.count() == 0 or 'No Reviews awaiting a decision' not in cards.last.inner_text()
        page.evaluate('window.__releaseBootstrap()')
        assert errors == []
    finally:
        browser.close(); pw.stop()
