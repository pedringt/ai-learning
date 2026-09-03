from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "implementation-context-prototype"


def _body_markup() -> str:
    html = (FRONT / "index.html").read_text()
    body = re.search(r"<body>(.*)</body>", html, flags=re.S).group(1)
    return re.sub(r"<script\b.*?</script>", "", body, flags=re.S | re.I)


def _payload(headline: str, summary: str, job: str = "current_fact") -> dict:
    return {
        "selection": {"job": job, "state_ids": [], "review_ids": [], "blocking_question_ids": [], "question_ids": [], "history_ids": [], "evidence_ids": []},
        "answer": {"job": job, "headline": headline, "summary": summary, "sections": [], "source_ids": [], "uncertainty_ids": [], "suggested_refinements": []},
        "timing": {"pipeline": "browser_fake", "context_ms": 1, "provider_ms": 1, "validation_ms": 0, "total_ms": 2},
    }


def _mock_api_script(hydration_ms: int = 120, ask_ms: int = 180, resolved_review_ms: int | None = None) -> str:
    first = json.dumps(_payload("Jane Smith", "Jane Smith is the billing contact."))
    second = json.dumps(_payload("From a recent project update", "The billing-contact answer comes from the recent project update.", "why_or_provenance"))
    resolved_review_ms = hydration_ms if resolved_review_ms is None else resolved_review_ms
    return f"""
      (() => {{
        const sleep=(v,ms)=>new Promise(r=>setTimeout(()=>r(v),ms));
        let askCount=0;
        window.STATE_API={{
          getState:()=>sleep({{items:[]}}, {hydration_ms}),
          getEvidence:()=>sleep({{items:[]}}, {hydration_ms}),
          getReviews:(status)=>sleep({{items:[]}}, status==='resolved'?{resolved_review_ms}:{hydration_ms}),
          getHistory:()=>sleep({{items:[]}}, {hydration_ms}),
          getQuestions:()=>sleep({{items:[]}}, {hydration_ms}),
          getRules:()=>sleep({{items:[]}}, {hydration_ms}),
          getDrafts:()=>sleep({{items:[]}}, {hydration_ms}),
          ask:async(q,prev)=>{{ askCount+=1; await sleep(null,{ask_ms}); return askCount===1 ? {first} : {second}; }},
          createQuestion:async(text)=>({{id:'q-new',text,status:'open',blocking:false,origin:'Added from Workspace'}}),
          resolveReview:async(id,decision)=>{{ await sleep(null,650); return {{review_id:id,decision,state:[],open_reviews:[],history:[]}}; }},
          resetDemo:async()=>({{status:'reset'}}),
        }};
      }})();
    """


def _launch_page(hydration_ms: int = 120, ask_ms: int = 180, resolved_review_ms: int | None = None):
    pw = sync_playwright().start()
    browser = pw.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1398, "height": 986})
    css = (ROOT / "site-shell.css").read_text() + "\n" + (FRONT / "context-tool.css").read_text()
    page.set_content(f"<!doctype html><html><head><style>{css}</style></head><body>{_body_markup()}</body></html>")
    page.add_script_tag(content=(FRONT / "context-data.js").read_text())
    page.add_script_tag(content=_mock_api_script(hydration_ms, ask_ms, resolved_review_ms))
    page.add_script_tag(content=(FRONT / "context-ask.js").read_text())
    page.add_script_tag(content=(FRONT / "context-app.js").read_text())
    return pw, browser, page


def test_workspace_hydration_does_not_replace_focused_ask_input():
    pw, browser, page = _launch_page(hydration_ms=220)
    try:
        box = page.locator("#askInput")
        box.click()
        box.fill("Who is my billing contact?")
        page.wait_for_timeout(350)
        assert box.input_value() == "Who is my billing contact?"
        assert page.evaluate("document.activeElement && document.activeElement.id") == "askInput"
    finally:
        browser.close(); pw.stop()


def test_shared_modal_is_never_hidden_under_portfolio_header():
    pw, browser, page = _launch_page(hydration_ms=10)
    try:
        page.locator('[data-action="add-info"]').click()
        page.wait_for_timeout(50)
        dialog = page.locator(".dialog").bounding_box()
        close = page.locator(".dialog-close").bounding_box()
        assert dialog and dialog["y"] >= 12
        assert close and close["y"] >= dialog["y"]
        assert dialog["y"] + dialog["height"] <= 976
        overlay_z = int(page.locator("#overlay").evaluate("e=>getComputedStyle(e).zIndex"))
        topbar_z = int(page.locator(".topbar").evaluate("e=>getComputedStyle(e).zIndex"))
        assert overlay_z > topbar_z
        page.locator('[data-action="close-dialog"]').first.click()
        page.locator('[data-action="show-demo-help"]').click()
        help_box = page.locator(".dialog").bounding_box()
        assert help_box and help_box["y"] >= 12
    finally:
        browser.close(); pw.stop()


def test_follow_up_keeps_existing_artifact_and_uses_compact_working_state():
    pw, browser, page = _launch_page(hydration_ms=10, ask_ms=220)
    try:
        page.locator("#askInput").fill("Who is my billing contact?")
        page.locator('[data-action="ask-submit"]').click()
        page.get_by_text("Jane Smith", exact=True).wait_for(timeout=2000)
        page.locator("#askInput").fill("What source is that from?")
        page.locator('[data-action="ask-submit"]').click()
        page.wait_for_timeout(40)
        assert page.get_by_text("Jane Smith", exact=True).count() >= 1
        assert page.locator(".ask-followup-working").count() == 1
        assert page.locator(".ask-live-loading").count() == 0
        page.get_by_text("From a recent project update", exact=True).wait_for(timeout=2000)
        assert page.locator(".ask-previous-answer").count() == 1
    finally:
        browser.close(); pw.stop()


def test_backend_review_choice_acknowledges_and_disappears_before_server_round_trip():
    pw, browser, page = _launch_page(hydration_ms=10)
    try:
        page.wait_for_timeout(40)
        page.evaluate("""() => {
          const t=window.STATE_ASK_TEST_API;
          const raw={
            id:'r-browser',review_type:'proposed_update',decision_question:'Update the pilot direction?',
            why_consequential:'New evidence changes the maintained direction.',evidence_id:'e-browser',
            evidence_content:'A reviewed update.',evidence_source_type:'manual_note',
            affected_state_items:[{id:'k-pilot',topic:'Pilot direction',statement:'Old direction',version:1}],
            proposals:[{id:'p-browser',operation:'update',state_item_id:'k-pilot',proposed_statement:'New direction',rationale:'New evidence',status:'pending'}]
          };
          t.upsertBackendReview(t.mapApiReview(raw, raw.evidence_content));
          t.state.backendStatus.reviews='loaded';
        }""")
        page.locator('.sidebar-nav [data-view="open-items"]').click()
        page.locator('[data-review-card="r-browser"] [data-action="review-update"]').click()
        page.wait_for_timeout(50)
        assert page.locator('[data-review-card="r-browser"]').count() == 0
        assert page.get_by_text('Updating understanding…', exact=True).count() == 1
        page.get_by_text('Here’s what changed.', exact=True).wait_for(timeout=2000)
    finally:
        browser.close(); pw.stop()


def test_modal_geometry_remains_top_safe_at_phone_width():
    pw, browser, page = _launch_page(hydration_ms=10)
    try:
        page.set_viewport_size({"width":390,"height":720})
        page.locator('[data-action="add-info"]').click()
        page.wait_for_timeout(30)
        box=page.locator('.dialog').bounding_box()
        assert box and box['y'] >= 10
        assert box['y'] + box['height'] <= 710
        assert page.locator('.dialog-close').is_visible()
    finally:
        browser.close(); pw.stop()

def test_project_reads_as_wiki_and_keeps_atomic_facts_collapsed_by_default():
    pw, browser, page = _launch_page(hydration_ms=10)
    try:
        page.wait_for_timeout(40)
        page.evaluate("""() => {
          const t=window.STATE_ASK_TEST_API;
          t.state.data.knowledge=[
            {id:'k-stage',title:'Project stage',statement:'Late discovery is nearly complete.',state:'current',projectArea:'evaluation',topics:['stage']},
            {id:'k-outcome',title:'Project outcome',statement:'Reduce repetitive support effort without sacrificing human control.',state:'current',projectArea:'product',topics:['outcome']},
            {id:'k-pilot',title:'Pilot direction',statement:'The core pilot use case is Tier 1 troubleshooting assistance.',state:'current',projectArea:'product',topics:['pilot']},
            {id:'k-entry',title:'Workflow fit',statement:'The assistant supports the rep inside the existing troubleshooting workflow.',state:'current',projectArea:'product',topics:['workflow']},
            {id:'k-security',title:'Human review boundary',statement:'Human review remains required for the pilot.',state:'current',projectArea:'safety',topics:['security']},
            {id:'k-readonly',title:'Read-only boundary',statement:'The assistant may retrieve information but may not execute account changes.',state:'current',projectArea:'safety',topics:['safety']},
            {id:'k-eval',title:'Evaluation direction',statement:'The pilot is judged on quality, escalation behavior, and severe failures.',state:'current',projectArea:'evaluation',topics:['evaluation']},
          ];
          t.state.backendStatus.state='loaded';
        }""")
        page.locator('.sidebar-nav [data-view="project-overview"]').click()
        assert page.get_by_text('Pilot scope & workflow', exact=True).is_visible()
        assert page.get_by_text('Human control', exact=True).is_visible()
        assert page.get_by_text('How success is judged', exact=True).is_visible()
        assert page.locator('.project-wiki-prose').count() >= 3
        assert page.locator('.project-maintained-facts[open]').count() == 0
        assert page.locator('.project-wiki-prose p').filter(has_text='The core pilot use case is Tier 1 troubleshooting assistance.').first.is_visible()
    finally:
        browser.close(); pw.stop()




def test_current_ask_survives_navigation_until_new_ask():
    pw, browser, page = _launch_page(hydration_ms=10, ask_ms=20)
    try:
        box = page.locator('#askInput')
        box.fill('Who is my billing contact?')
        page.locator('[data-action="ask-submit"]').click()
        page.get_by_text('Jane Smith', exact=True).wait_for()

        page.locator('.sidebar-nav [data-view="project-overview"]').click()
        page.locator('.sidebar-nav [data-view="overview"]').click()

        assert page.get_by_text('Jane Smith', exact=True).is_visible()
        assert page.get_by_text('Who is my billing contact?', exact=True).is_visible()

        page.locator('[data-action="new-ask"]').click()
        assert page.locator('.answer-stage.has-result').count() == 0
        assert page.locator('#askInput').input_value() == ''
    finally:
        browser.close(); pw.stop()


def test_ask_examples_fill_input_without_auto_submitting():
    pw, browser, page = _launch_page(hydration_ms=10)
    try:
        page.locator('[data-action="show-examples"]').click()
        page.locator('[data-action="example-fill"]').first.click()
        box = page.locator('#askInput')
        assert box.input_value() == "What’s the current plan for the pilot?"
        assert page.evaluate("document.activeElement && document.activeElement.id") == 'askInput'
        assert page.locator('.answer-stage.has-result').count() == 0
        assert page.locator('#overlay').evaluate('e=>e.hidden') is True
    finally:
        browser.close(); pw.stop()


def test_workspace_attention_does_not_wait_for_slow_resolved_reviews():
    pw, browser, page = _launch_page(hydration_ms=35, resolved_review_ms=650)
    try:
        page.wait_for_timeout(140)
        assert page.get_by_text('Nothing needs action right now', exact=True).is_visible()
        assert page.get_by_text('Checking what needs you', exact=True).count() == 0
    finally:
        browser.close(); pw.stop()

def test_add_note_examples_fill_field_without_submitting():
    pw, browser, page = _launch_page(hydration_ms=10)
    try:
        page.locator('[data-action="add-info"]').click()
        assert page.locator('[data-action="sample-info"]').count() == 3
        page.locator('[data-action="sample-info"][data-sample="research"]').click()
        box = page.locator('#addInfoText')
        assert 'three reps said they check recent ticket history' in box.input_value()
        assert page.evaluate("document.activeElement && document.activeElement.id") == 'addInfoText'
        assert page.locator('#overlay').evaluate('e=>e.hidden') is False
    finally:
        browser.close(); pw.stop()


def test_demo_help_start_actions_are_clickable_and_reset_is_discoverable():
    pw, browser, page = _launch_page(hydration_ms=10)
    try:
        page.locator('[data-action="show-demo-help"]').click()
        assert page.get_by_text('Good places to start', exact=True).is_visible()
        assert page.get_by_text('Reset Northstar from Project Settings', exact=False).is_visible()
        page.locator('[data-action="demo-start-ask"]').click()
        box = page.locator('#askInput')
        assert box.input_value() == 'What should I know about the Northstar pilot?'
        assert page.evaluate("document.activeElement && document.activeElement.id") == 'askInput'
        assert page.locator('.answer-stage.has-result').count() == 0
    finally:
        browser.close(); pw.stop()


def test_backend_replace_mode_removes_previous_artifact_for_natural_transform():
    pw, browser, page = _launch_page(hydration_ms=10, ask_ms=10)
    try:
        page.locator("#askInput").fill("Who is my billing contact?")
        page.locator('[data-action="ask-submit"]').click()
        page.get_by_text("Jane Smith", exact=True).wait_for(timeout=2000)
        page.evaluate("""() => {
          window.STATE_API.ask = async () => ({
            followup_mode:'replace',
            selection:{job:'current_fact',state_ids:[],review_ids:[],blocking_question_ids:[],question_ids:[],history_ids:[],evidence_ids:[]},
            answer:{job:'current_fact',headline:'Short version',summary:'Jane Smith.',sections:[],source_ids:[],uncertainty_ids:[],suggested_refinements:[]},
            timing:{pipeline:'browser_fake',context_ms:1,provider_ms:1,validation_ms:0,total_ms:2}
          });
        }""")
        page.locator("#askInput").fill("condense this")
        page.locator('[data-action="ask-submit"]').click()
        page.get_by_text("Short version", exact=True).wait_for(timeout=2000)
        assert page.locator(".ask-previous-answer").count() == 0
    finally:
        browser.close(); pw.stop()
