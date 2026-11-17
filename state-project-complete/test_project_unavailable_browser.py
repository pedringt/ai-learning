"""#709: a tab whose project disappears says so, blocks writes, and waits for a deliberate choice.

Real browser + local API, no model calls. The tab opens a user-created project;
then the project is deleted behind its back (another tab, or a staging database
re-seeding). Adding a note used to land in Northstar and the tab quietly moved
there. Now the server refuses it, the tab shows which project is gone, sends no
further writes, and only resumes once the user picks a project.
"""
from fastapi.testclient import TestClient
import pytest

from api import Settings, create_app
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_preload_project_header_browser import NOTE, _evidence_contents, _hydrated, _open_page


@pytest.fixture
def backend(tmp_path):
    settings = Settings(database_path=str(tmp_path / 'unavailable.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=BaselineFixtureProvider())) as client:
        project = client.post('/api/projects', json={'name': 'Lantern'}).json()
        client.post('/api/projects/switch', json={'project_id': project['id']})
        assert client.post('/api/baseline/finish', headers={'X-State-Project-Id': project['id']}, json={}).status_code == 200
        yield client, project


def _add_note(page, text):
    page.locator('[data-action="add-info"]:visible').first.click()
    page.locator('#addInfoText').fill(text)
    page.locator('[data-action="save-info"]').click()


def test_a_deleted_project_is_reported_and_writes_stop_until_a_project_is_chosen(backend):
    client, project = backend
    page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=False)
    try:
        _hydrated(page)
        assert page.evaluate("document.getElementById('projectSwitcher').dataset.projectId") == project['id']
        northstar_before = _evidence_contents(client, 'northstar')

        # Gone behind the tab's back; the server's shared pointer moves to Northstar.
        assert client.delete(f"/api/projects/{project['id']}").status_code == 200

        _add_note(page, NOTE)
        page.wait_for_selector('.project-unavailable-choices')
        dialog = page.locator('#dialogBody').inner_text()
        assert 'Lantern is no longer available.' in dialog
        assert 'Nothing was saved to another project' in dialog
        assert _evidence_contents(client, 'northstar') == northstar_before, 'the note leaked into Northstar'
        assert page.evaluate("document.getElementById('projectSwitcher').dataset.projectId") == project['id'], \
            'the tab moved to another project without being asked'

        # Writes are blocked in the tab itself: nothing more reaches the server.
        posts_before = len([r for r in requests if r['method'] != 'GET'])
        blocked = page.evaluate("""async () => {
            try { await window.STATE_API.submitEvidence('Second try'); return 'sent'; }
            catch (e) { return e.projectUnavailable ? 'blocked' : 'other: ' + e.message; }
        }""")
        assert blocked == 'blocked'
        assert len([r for r in requests if r['method'] != 'GET']) == posts_before

        # A deliberate choice opens that project and writes work again, in that project.
        page.locator('.project-unavailable-choices [data-action="switch-project"][data-project-id="juniper"]').click()
        page.wait_for_function("document.getElementById('projectSwitcher').dataset.projectId==='juniper'")
        _hydrated(page)
        sent = page.evaluate("""async () => {
            try { await window.STATE_API.createQuestion('Is the move date confirmed?'); return 'sent'; }
            catch (e) { return (e.projectUnavailable ? 'blocked: ' : 'error: ') + e.message; }
        }""")
        assert sent == 'sent'
        juniper = client.get('/api/questions', headers={'X-State-Project-Id': 'juniper'}).json()['items']
        assert 'Is the move date confirmed?' in [q['text'] for q in juniper]
        assert errors == []
    finally:
        browser.close(); pw.stop()
