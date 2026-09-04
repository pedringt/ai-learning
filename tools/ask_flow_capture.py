#!/usr/bin/env python3
"""Screenshot the Ask flow: answer, refinement wait state, and appended follow-up.

Usage: python3 askshots.py <repo-root> <out-dir>

Drives the real UI with a stubbed STATE_API so the flow is deterministic and no
model is called. Captures the states final-polish.js used to patch after render.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get("STATE_SHOT_PORT", "8090"))


def payload(headline, summary, job="current_fact", mode="new"):
    return {
        "selection": {"job": job, "state_ids": [], "review_ids": [], "blocking_question_ids": [],
                      "question_ids": [], "history_ids": [], "evidence_ids": []},
        "answer": {"job": job, "headline": headline, "summary": summary,
                   "sections": [{"label": "What is established",
                                 "items": [{"text": "Human review remains required for customer-facing responses.",
                                            "detail": "Accepted from the leadership update on Aug 29."},
                                           {"text": "The pilot targets 25% autonomous resolution.",
                                            "detail": "Superseding the earlier 50% ambition."}]}],
                   "source_ids": [], "uncertainty_ids": [],
                   "suggested_refinements": ["shorten it", "what source supports that?"]},
        "followup_mode": mode,
        "timing": {"pipeline": "stub", "context_ms": 1, "provider_ms": 1, "validation_ms": 0, "total_ms": 2},
    }


STUB = """
(() => {
  const sleep = (v, ms) => new Promise(r => setTimeout(() => r(v), ms));
  let asks = 0;
  window.STATE_API = {
    getAttention: () => sleep({open_reviews: [], questions: []}, 10),
    getBootstrap: () => sleep({state: [], evidence: [], open_reviews: [], resolved_reviews: [],
                               history: [], questions: [], rules: [], drafts: []}, 10),
    getState: () => sleep({items: []}, 10),
    getEvidence: () => sleep({items: []}, 10),
    getReviews: () => sleep({items: []}, 10),
    getHistory: () => sleep({items: []}, 10),
    getQuestions: () => sleep({items: []}, 10),
    getRules: () => sleep({items: []}, 10),
    getDrafts: () => sleep({items: []}, 10),
    ask: async () => { asks += 1; await sleep(null, asks === 1 ? 120 : 4000); return asks === 1 ? FIRST : SECOND; },
    createQuestion: async (text) => ({id: 'q', text, status: 'open', blocking: false}),
    resolveReview: async (id, decision) => ({review_id: id, decision, state: [], open_reviews: [], history: []}),
    resetDemo: async () => ({status: 'reset'}),
  };
})();
"""


def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1",
                            "-d", str(REPO)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    global FIRST, SECOND
    FIRST = payload("Human review is still required",
                    "Customer-facing responses stay human-reviewed for the pilot.")
    SECOND = payload("From the leadership update",
                     "The 25% target comes from the Aug 29 leadership update.",
                     "why_or_provenance", "append")
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(headless=True, args=["--no-sandbox"])
            for theme in ("light", "dark"):
                ctx = b.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
                ctx.add_init_script(f"try{{localStorage.setItem('ai-cs-theme','{theme}')}}catch(e){{}}")
                page = ctx.new_page()

                page.goto(f"http://127.0.0.1:{PORT}/implementation-context-prototype/index.html",
                          wait_until="domcontentloaded")
                # context-api.js overwrites window.STATE_API at load, so stub at
                # the fetch layer instead: it calls fetch() per request, not once
                # at load, so wrapping it after load intercepts everything while
                # leaving the real client code in play.
                page.evaluate("""({first, second}) => {
                  let asks = 0;
                  const json = b => new Response(JSON.stringify(b),
                      {status: 200, headers: {'Content-Type': 'application/json'}});
                  const sleep = ms => new Promise(r => setTimeout(r, ms));
                  window.fetch = async (url, opts) => {
                    const u = String(url);
                    if (u.includes('/api/ask')) {
                      asks += 1;
                      await sleep(asks === 1 ? 120 : 5000);   // hold the refinement in flight
                      return json(asks === 1 ? first : second);
                    }
                    if (u.includes('/api/attention')) return json({open_reviews: [], questions: []});
                    if (u.includes('/api/bootstrap')) return json({state: [], evidence: [], open_reviews: [],
                        resolved_reviews: [], history: [], questions: [], rules: [], drafts: []});
                    return json({items: []});
                  };
                }""", {"first": FIRST, "second": SECOND})
                page.evaluate("() => window.dispatchEvent(new Event('load'))")
                page.wait_for_timeout(1200)

                # 1. First Ask -> answer rendered
                page.fill("#askInput", "What is still required for the pilot?")
                page.locator('[data-action="ask-submit"]').first.click()
                page.locator(".ask-live-answer").first.wait_for(timeout=8000)
                page.wait_for_timeout(300)
                page.locator(".answer-stage").first.screenshot(path=str(OUT / f"ask-answer__{theme}.png"))

                # 2. Follow-up in flight -> refinement wait state above the previous answer
                page.fill("#askInput", "what source supports that?")
                page.locator('[data-action="ask-submit"]').first.click()
                page.locator(".ask-followup-working").first.wait_for(timeout=5000)
                page.wait_for_timeout(250)
                page.locator(".answer-stage").first.screenshot(path=str(OUT / f"ask-working__{theme}.png"))

                # order matters: the working node must precede the previous answer
                order = page.evaluate("""() => {
                  const c = document.querySelector('.answer-content');
                  return [...c.children].map(e => e.className.split(' ')[0]);
                }""")
                (OUT / f"order__{theme}.txt").write_text(json.dumps(order))

                # 3. Rotating copy actually rotates
                first = page.locator(".ask-followup-working").first.inner_text()
                page.wait_for_timeout(3300)
                second = page.locator(".ask-followup-working").first.inner_text()
                (OUT / f"rotation__{theme}.txt").write_text(json.dumps(
                    {"first": first, "second": second, "rotated": first != second}))

                # 4. Appended follow-up answer
                page.locator(".ask-followup-answer").first.wait_for(timeout=10000)
                page.wait_for_timeout(400)
                page.locator(".answer-stage").first.screenshot(path=str(OUT / f"ask-appended__{theme}.png"))

                # 5. Button labels as rendered
                labels = page.evaluate("""() => [...document.querySelectorAll(
                    '[data-action="copy-result"],[data-action="new-ask"]')].map(b => b.textContent.trim())""")
                (OUT / f"labels__{theme}.txt").write_text(json.dumps(labels))
                ctx.close()
            b.close()
    finally:
        srv.terminate()
    print("captured Ask states ->", OUT)


if __name__ == "__main__":
    main()
