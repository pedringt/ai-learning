from pathlib import Path


JS = (Path(__file__).parent.parent / "implementation-context-prototype" / "context-app.js").read_text()


def test_live_reviews_use_backend_payload_not_placeholder_values():
    assert "proposed:'Review'" not in JS
    assert "unresolved:'?'" not in JS
    assert "mapApiReview" in JS
    assert "affected_state_items" in JS
    assert "proposed_changes" not in JS or "proposals" in JS


def test_live_review_resolution_calls_backend_and_refreshes_state():
    assert "/api/reviews/${encodeURIComponent(r.backendReviewId)}/resolve" in JS
    assert "syncApiState(result.state||[])" in JS


def test_question_answers_are_linked_to_backend_review_authority():
    assert "question_response:${q.id}" in JS
    assert "r.resolvesQuestionId && (r.proposals||[]).length" in JS


def test_analysis_modal_is_not_dismissible():
    assert "closeButton.disabled=!!state.isAnalyzing" in JS
    assert "e.target===overlay && !state.isAnalyzing" in JS
    assert "e.key==='Escape'&&!overlay.hidden && !state.isAnalyzing" in JS


def test_backend_state_and_reviews_rehydrate_after_refresh():
    assert "function hydrateBackend" in JS
    assert "/api/reviews?status=open" in JS
    assert "/api/reviews?status=resolved" in JS


def test_retire_review_does_not_render_undefined_statement():
    assert "Retire: ${p.proposed_statement}" not in JS
    assert 'Retire current understanding' in JS


def test_backend_state_sync_reconciles_retired_items():
    assert 'const activeIds=new Set' in JS
    assert "k.backendManaged && !activeIds.has(k.id)" in JS
    assert 'k.backendManaged=true' in JS


def test_backend_review_results_are_upserted_not_blindly_appended():
    assert "function upsertBackendReview" in JS
    assert "apiReviews.forEach(r=>{r.evidenceId=noteId; upsertBackendReview(r);});" in JS
    assert "hydrateBounceFromApi" not in JS


def test_hydration_reconciles_stale_backend_reviews():
    assert "function replaceBackendOpenReviews" in JS
    assert "replaceBackendOpenReviews(payload.items||[])" in JS


def test_frontend_hides_superseded_proposals_from_open_review_card():
    assert "const proposals=(r.proposals||[]).filter(p=>!p.status || p.status==='pending');" in JS
