from pathlib import Path


FRONTEND = Path(__file__).parent.parent / "implementation-context-prototype"
JS = (FRONTEND / "context-app.js").read_text()
API_JS = (FRONTEND / "context-api.js").read_text()


def test_live_reviews_use_backend_payload_not_placeholder_values():
    assert "proposed:'Review'" not in JS
    assert "unresolved:'?'" not in JS
    assert "mapApiReview" in JS
    assert "affected_state_items" in JS
    assert "proposed_changes" not in JS or "proposals" in JS


def test_live_review_resolution_calls_backend_and_refreshes_state():
    assert "/api/reviews/${encodeURIComponent(reviewId)}/resolve" in API_JS
    assert "syncApiState(result.state||[])" in JS


def test_question_answers_are_linked_to_backend_review_authority():
    assert "question_response:${q.id}" in JS
    assert "resolvesQuestionIds" in JS and "review_questions" in (Path(__file__).parent / "review_service.py").read_text()


def test_analysis_modal_is_not_dismissible():
    assert "closeButton.disabled=!!state.isAnalyzing" in JS
    assert "e.target===overlay && !state.isAnalyzing" in JS
    assert "e.key==='Escape'&&!overlay.hidden && !state.isAnalyzing" in JS


def test_backend_state_and_reviews_rehydrate_after_refresh():
    assert "function hydrateBackend" in JS
    assert "/api/reviews?status=${encodeURIComponent(status)}" in API_JS


def test_retire_review_does_not_render_undefined_statement():
    assert "Retire: ${p.proposed_statement}" not in JS
    assert 'Retire current understanding' in JS


def test_backend_state_sync_reconciles_retired_items():
    assert 'const activeIds=new Set' in JS
    assert "if(!activeIds.has(k.id)) k.state='retired'" in JS
    assert 'k.backendManaged=true' in JS


def test_backend_review_results_are_upserted_not_blindly_appended():
    assert "function upsertBackendReview" in JS
    assert "apiReviews.forEach(r=>{r.evidenceId=noteId; upsertBackendReview(r);});" in JS
    assert "hydrateBounceFromApi" not in JS


def test_hydration_reconciles_stale_backend_reviews():
    assert "function replaceBackendOpenReviews" in JS
    assert "replaceBackendOpenReviews(openPayload.items||[])" in JS


def test_frontend_hides_superseded_proposals_from_open_review_card():
    assert "const proposals=(r.proposals||[]).filter(p=>!p.status || p.status==='pending');" in JS


def test_notes_rehydrate_complete_evidence_archive_with_date_filters():
    assert "/api/evidence" in API_JS
    assert "function syncApiEvidence" in JS
    assert "notesDateFilter" in JS
    assert "data-date-filter" in JS


def test_history_rehydrates_backend_transitions_with_source_notes():
    assert "/api/history" in API_JS
    assert "function syncApiHistory" in JS
    assert "Source notes ·" in JS


def test_project_is_rendered_as_document_outline_not_area_card_dashboard():
    assert "project-document" in JS
    assert "project-outline-section" in JS
    assert "project-area-cards" not in JS


def test_project_subnav_scrolls_existing_document_without_rerender():
    assert "if(state.view!=='project-overview'){state.view='project-overview';render();" in JS
    assert "else{updateNav();updateProjectSubnavActive(target);document.getElementById(target)?.scrollIntoView" in JS
    assert "setTimeout" not in JS or "data-project-jump" not in JS.split("setTimeout",1)[-1]
    assert "updateProjectSubnavActive" in JS
    assert "aria-current','location'" in JS


def test_frontend_api_base_is_runtime_configurable():
    assert "window.STATE_API_BASE" in API_JS
    assert "dataset?.apiBase" in API_JS


def test_provider_failure_retry_reuses_saved_evidence():
    assert "retryEvidenceAnalysis" in JS
    assert "/api/evidence/${encodeURIComponent(evidenceId)}/reanalyze" in API_JS
    assert "Retry analysis without submitting it again" in JS
