"""Issue #231: a failed Baseline analysis must offer a retry where State tells the person to retry.

Real browser + local API, no model calls. The provider fails on the first attempt
(a source that could not be analyzed) and can then be "fixed", so the retry path is
exercised end to end: banner or review dialog -> POST /api/evidence/{id}/reanalyze ->
draft recovers -> Confirm unblocked. Before this, the dialog said "Retry failed
Evidence before confirming" but nothing in the Baseline UI offered a retry; the only
retry lived in the Notes view.
"""
import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from test_baseline_setup_lifecycle import BaselineFixtureProvider
from test_preload_project_header_browser import _hydrated, _open_page


class FlakyProvider:
    """Fails until `fail` is cleared, then behaves like the Baseline fixture provider."""
    name = 'flaky'
    model_identifier = 'flaky-v1'

    def __init__(self):
        self.good = BaselineFixtureProvider()
        self.fail = True

    def interpret(self, **kwargs):
        if self.fail:
            raise RuntimeError('provider unavailable')
        return self.good.interpret(**kwargs)


@pytest.fixture
def failed_source(tmp_path):
    provider = FlakyProvider()
    settings = Settings(database_path=str(tmp_path / 'retry.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=provider)) as client:
        project = client.post('/api/projects', json={'name': 'Retry Project'}).json()
        client.post('/api/projects/switch', json={'project_id': project['id']})
        headers = {'X-State-Project-Id': project['id']}
        response = client.post('/api/evidence', headers=headers, json={'content': 'First baseline note about what State is.', 'source_type': 'manual_note'})
        assert response.status_code == 503  # analysis failed; the Evidence itself is saved
        draft = client.get('/api/baseline/draft', headers=headers).json()
        assert draft['counts']['failed_evidence'] == 1 and not draft['can_confirm']
        yield client, project, headers, provider


def _draft(client, headers):
    return client.get('/api/baseline/draft', headers=headers).json()


def test_banner_offers_retry_and_a_successful_retry_recovers_the_starting_state(failed_source):
    client, project, headers, provider = failed_source
    page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=False)
    try:
        _hydrated(page)
        banner = page.locator('#baselineSetupBanner')
        banner.get_by_text('Some starting material needs attention').wait_for()
        retry = banner.locator('[data-baseline-retry-failed]')
        retry.wait_for()

        provider.fail = False  # whatever broke has been fixed
        retry.click()

        # The banner moves to "ready to review" and the retry button goes away.
        banner.get_by_text('Starting State ready to review').wait_for()
        assert banner.locator('[data-baseline-retry-failed]').count() == 0
        draft = _draft(client, headers)
        assert draft['counts']['failed_evidence'] == 0
        assert draft['can_confirm'] and len(draft['draft']['items']) == 1
        # It retried the failed Evidence in this project, not anything else.
        posts = [r for r in requests if r['method'] == 'POST' and r['path'].endswith('/reanalyze')]
        assert len(posts) == 1 and posts[0]['project'] == project['id']
        assert errors == []
    finally:
        browser.close(); pw.stop()


def test_review_dialog_offers_retry_and_recovery_unblocks_confirm(failed_source):
    client, project, headers, provider = failed_source
    page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=False)
    try:
        _hydrated(page)
        page.locator('#baselineSetupBanner [data-baseline-review-starting]').click()
        dialog = page.locator('.baseline-draft-dialog')
        dialog.wait_for()
        assert page.locator('[data-baseline-confirm-starting]').is_disabled()
        assert 'retry' in dialog.locator('.baseline-draft-status').inner_text().lower()
        retry = dialog.locator('[data-baseline-retry-failed]')
        retry.wait_for()

        provider.fail = False
        retry.click()

        # The dialog redraws with the recovered draft and Confirm becomes available.
        page.locator('.baseline-draft-fact').first.wait_for()
        assert dialog.locator('[data-baseline-retry-failed]').count() == 0
        assert page.locator('[data-baseline-confirm-starting]').is_enabled()
        # The banner behind the dialog catches up too.
        page.locator('#baselineSetupBanner').get_by_text('Starting State ready to review').wait_for()
        assert errors == []
    finally:
        browser.close(); pw.stop()


def test_a_retry_that_fails_again_keeps_the_button_and_says_what_happened(failed_source):
    client, project, headers, provider = failed_source
    page, browser, requests, errors, pw = _open_page(client, hold_bootstrap=False)
    try:
        _hydrated(page)
        banner = page.locator('#baselineSetupBanner')
        retry = banner.locator('[data-baseline-retry-failed]')
        retry.wait_for()

        retry.click()  # provider is still failing
        status = banner.locator('[data-baseline-retry-status]')
        page.wait_for_function(
            "document.querySelector('#baselineSetupBanner [data-baseline-retry-status]')?.textContent.trim().length>0")
        assert 'saved' in status.inner_text().lower()  # tells the person their material is still saved
        # The banner is redrawn by the view refresh a moment later; the message must survive it.
        page.wait_for_timeout(1500)
        assert 'saved' in banner.locator('[data-baseline-retry-status]').inner_text().lower()
        assert retry.is_enabled() and retry.inner_text().strip() == 'Retry failed analysis'
        assert _draft(client, headers)['counts']['failed_evidence'] == 1
        assert errors == []
    finally:
        browser.close(); pw.stop()
