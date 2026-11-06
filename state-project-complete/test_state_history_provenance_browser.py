"""Nov 5 cleanup, step 3: context-provenance.js used to watch #viewRoot to learn History had been drawn; it now listens
for the 'state:view-rendered' event. Kept in its own file because test_state_view_rendered_event_browser.py holds a
module-scoped Playwright session, and Playwright's sync API cannot start a second one in the same process.
"""
import re
from pathlib import Path

from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright

from api import Settings, create_app
from test_browser_user_flows import _launch_chromium

FRONTEND = Path(__file__).resolve().parents[1] / 'implementation-context-prototype'


class _RefusingProvider:
    name = "refusing"
    model_identifier = "refusing-v1"

    def interpret(self, *, context, evidence):
        raise AssertionError("no model calls in this test")


def test_opening_a_facts_history_looks_up_its_provenance(tmp_path):
    """context-provenance.js decorates a focused History entry after History is drawn. The demo seed has History but
    no accepted provenance to show, so this checks that the lookup (GET /api/bootstrap) runs once History for a fact is
    drawn. Real local API with the demo seed, served through a fetch shim; no model calls."""
    settings = Settings(database_path=str(tmp_path / 'state.db'), cors_origins=[], demo_bootstrap=True)
    with TestClient(create_app(settings, provider=_RefusingProvider())) as client, sync_playwright() as pw:
        calls = []

        def local_api(method, path, body, request_headers):
            calls.append(path.split('?')[0])
            response = client.request(method, path, content=body, headers=request_headers)
            return {'status': response.status_code, 'body': response.text}

        browser = _launch_chromium(pw)
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            page.set_default_timeout(10000)
            page.expose_function('localApi', local_api)
            html = (FRONTEND / 'index.html').read_text()
            body = re.sub(r'<script\b.*?</script>', '', re.search(r'<body>(.*)</body>', html, flags=re.S).group(1), flags=re.S | re.I)
            page.set_content('<html><head></head><body>' + body + '</body></html>')
            page.add_script_tag(content="""
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
            page.wait_for_function("window.STATE_ASK_TEST_API?.state.backendStatus.history==='loaded'")
            page.evaluate("document.querySelector('.sidebar-nav [data-view=\"project-overview\"]').click()")
            page.wait_for_selector('.project-history-link[data-knowledge-id]', state='attached')
            start = len(calls)
            page.evaluate("document.querySelector('.project-history-link[data-knowledge-id]').click()")
            page.wait_for_selector('#viewRoot .history-context [data-action="clear-history-topic"]')
            page.wait_for_function("document.querySelectorAll('#viewRoot .history-list .history-entry').length > 0")
            page.wait_for_timeout(500)
            assert '/api/bootstrap' in calls[start:]
        finally:
            browser.close()
