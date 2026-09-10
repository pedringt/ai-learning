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


def _mock_api_script() -> str:
    empty_bootstrap = json.dumps({
        "state": [], "evidence": [], "open_reviews": [], "resolved_reviews": [],
        "history": [], "questions": [], "rules": [], "drafts": [],
    })
    return f"""
    (() => {{
      const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      window.__reviewCalls=[];
      window.StateAnalytics={{track(){{}},trackAskQuery(){{}}}};
      window.STATE_API={{
        getAttention:async()=>({{open_reviews:[],questions:[]}}),
        getBootstrap:async()=>({empty_bootstrap}),
        getState:async()=>({{items:[]}}),
        getEvidence:async()=>({{items:[]}}),
        getReviews:async()=>({{items:[]}}),
        getHistory:async()=>({{items:[]}}),
        getQuestions:async()=>({{items:[]}}),
        getRules:async()=>({{items:[]}}),
        getDrafts:async()=>({{items:[]}}),
        resolveReview:async(id,decision)=>{{
          window.__reviewCalls.push({{id,decision}});
          await sleep(80);
          return {{review_id:id,decision,state:[],open_reviews:[],history:[]}};
        }},
        createQuestion:async text=>({{id:'q-new',text,status:'open',blocking:false,origin:'Added from Workspace'}}),
      }};
    }})();
    """


def _launch_page():
    pw = sync_playwright().start()
    browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.set_content(f"<!doctype html><html><body>{_body_markup()}</body></html>")
    page.add_script_tag(content=(FRONT / "context-data.js").read_text())
    page.add_script_tag(content=_mock_api_script())
    page.add_script_tag(content=(FRONT / "context-ask.js").read_text())
    page.add_script_tag(content=(FRONT / "context-notes-view.js").read_text())
    page.add_script_tag(content=(FRONT / "context-open-items-view.js").read_text())
    page.add_script_tag(content=(FRONT / "context-project-view.js").read_text())
    page.add_script_tag(content=(FRONT / "context-app.js").read_text())
    page.add_script_tag(content=(FRONT / "context-review-outcomes.js").read_text())
    page.wait_for_timeout(50)
    return pw, browser, page


def _inject_question_review(page, *, review_type="missing_understanding", proposals=None, linked=True, review_id="r-browser"):
    proposals = proposals or []
    raw = {
        "id": review_id,
        "review_type": review_type,
        "decision_question": "Do the confirmed retention terms answer the open question?",
        "why_consequential": "This may close an implementation dependency.",
        "evidence_id": "e-browser",
        "evidence_content": "Legal confirmed a 30-day retention window.",
        "evidence_source_type": "manual_note",
        "affected_state_items": [],
        "proposals": proposals,
        "resolves_question_ids": ["q-browser"] if linked else [],
    }
    page.evaluate(
        """raw => {
          const t=window.STATE_ASK_TEST_API;
          t.state.data.questions=[{
            id:'q-browser',text:'What retention terms apply?',status:'open',blocking:true,
            blocks:'Security approval',origin:'Security review',backendManaged:true,topics:['security']
          }];
          t.state.data.notes=[{
            id:'n-browser',title:'Retention confirmation',text:raw.evidence_content,
            source:'Project update',status:'pending',evidenceId:raw.evidence_id,backendManaged:true
          }];
          const mapped=t.mapApiReview(raw,raw.evidence_content);
          mapped.evidenceId='n-browser';
          t.state.data.reviews=[mapped];
          t.state.backendStatus.reviews='loaded';
          t.state.backendStatus.questions='loaded';
          t.state.backendStatus.drafts='loaded';
        }""",
        raw,
    )
    page.locator('.sidebar-nav [data-view="open-items"]').click()


def test_state_index_loads_consequence_specific_review_controller():
    html = (FRONT / "index.html").read_text()
    assert "context-review-outcomes.js" in html
    assert html.index("context-app.js") < html.index("context-review-outcomes.js")


def test_question_only_confirm_resolves_question_immediately_without_state_change():
    pw, browser, page = _launch_page()
    try:
        _inject_question_review(page)
        page.get_by_text("Confirm answer", exact=True).wait_for()
        assert page.get_by_text("Current State will not change.", exact=False).count() >= 1
        before = page.evaluate("JSON.stringify(window.STATE_ASK_TEST_API.state.data.knowledge)")

        page.get_by_text("Confirm answer", exact=True).click()
        page.get_by_text(
            "Answer confirmed. The question is resolved. Current State was not changed.", exact=True
        ).wait_for(timeout=2000)

        outcome = page.evaluate("""() => {
          const s=window.STATE_ASK_TEST_API.state;
          return {
            question:s.data.questions.find(q=>q.id==='q-browser'),
            review:s.data.reviews.find(r=>r.id==='r-browser'),
            note:s.data.notes.find(n=>n.id==='n-browser'),
            calls:window.__reviewCalls,
            knowledge:JSON.stringify(s.data.knowledge),
          };
        }""")
        assert outcome["calls"] == [{"id": "r-browser", "decision": "accept"}]
        assert outcome["question"]["status"] == "resolved"
        assert outcome["review"]["status"] == "update"
        assert outcome["note"]["status"] == "reviewed"
        assert outcome["knowledge"] == before
        assert page.locator('[data-question-id="q-browser"]').count() == 0
    finally:
        browser.close(); pw.stop()


def test_question_only_keep_closes_review_but_leaves_question_open():
    pw, browser, page = _launch_page()
    try:
        _inject_question_review(page)
        page.get_by_text("Keep question open", exact=True).click()
        page.get_by_text(
            "Question left open. Evidence is preserved. Current State was not changed.", exact=True
        ).wait_for(timeout=2000)
        outcome = page.evaluate("""() => {
          const s=window.STATE_ASK_TEST_API.state;
          return {
            question:s.data.questions.find(q=>q.id==='q-browser'),
            review:s.data.reviews.find(r=>r.id==='r-browser'),
            note:s.data.notes.find(n=>n.id==='n-browser'),
            calls:window.__reviewCalls,
          };
        }""")
        assert outcome["calls"] == [{"id": "r-browser", "decision": "keep"}]
        assert outcome["question"]["status"] == "open"
        assert outcome["review"]["status"] == "keep-current"
        assert outcome["note"]["status"] == "reviewed"
    finally:
        browser.close(); pw.stop()


def test_zero_proposal_state_at_risk_linked_to_question_has_no_accept_path():
    pw, browser, page = _launch_page()
    try:
        _inject_question_review(page, review_type="state_at_risk")
        assert page.get_by_text("Review uncertainty →", exact=True).count() == 1
        assert page.get_by_text("Uncertainty found · Awaiting review", exact=True).count() == 1
        assert page.locator('[data-review-card="r-browser"] [data-action="review-confirm-answer"]').count() == 0
        assert page.locator('[data-review-card="r-browser"] [data-action="review-update"]').count() == 0
        assert page.get_by_text("Keep Current State", exact=True).count() == 1
        assert page.get_by_text("Confirm answer", exact=True).count() == 0
    finally:
        browser.close(); pw.stop()


def test_zero_proposal_missing_understanding_without_question_stays_open():
    pw, browser, page = _launch_page()
    try:
        _inject_question_review(page, review_type="missing_understanding", linked=False)
        page.get_by_text("Leave this Review open and add Evidence when more is known.", exact=True).wait_for()
        card = page.locator('[data-review-card="r-browser"]')
        assert card.locator('[data-action="review-update"]').count() == 0
        assert card.locator('[data-action="review-confirm-answer"]').count() == 0
        assert card.locator('[data-action="review-keep"]').count() == 0
        assert card.locator('[data-action="review-keep-question"]').count() == 0
    finally:
        browser.close(); pw.stop()


def test_legacy_question_submission_explanations_are_corrected_without_changing_behavior():
    pw, browser, page = _launch_page()
    try:
        page.evaluate("""() => {
          document.getElementById('dialogBody').innerHTML='<p>The question stays unresolved until you accept reviewed evidence that establishes an answer.</p>';
        }""")
        page.wait_for_function("""() => document.querySelector('#dialogBody p')?.textContent === 'The question stays unresolved until you confirm reviewed evidence that establishes an answer.'""")
        page.evaluate("""() => {
          document.getElementById('dialogBody').innerHTML='<p>The evidence did not produce a State change, so it was not enough to resolve this question.</p>';
        }""")
        page.wait_for_function("""() => document.querySelector('#dialogBody p')?.textContent === 'State did not identify reviewed evidence that establishes an answer, so the question stays open.'""")
    finally:
        browser.close(); pw.stop()
