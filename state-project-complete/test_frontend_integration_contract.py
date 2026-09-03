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
    assert "replaceBackendOpenReviews(openItems);" in JS


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
    assert "if(state.view!=='project-overview'){state.view='project-overview';state.result=null;render();" in JS
    assert "else{updateNav();updateProjectSubnavActive(target);scrollProjectTarget(target);}" in JS
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


def test_r8_long_project_and_open_items_scaling_contract():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    assert "waiting.slice(0,5)" in app
    assert "toggle-open-questions" in app
    assert "const reviewTopics=new Set(reviews.flatMap(r=>r.topics||[]));" in app
    assert "projectGroup(item,id)" in app
    assert "project-section-sticky" in app
    assert ".app-sidebar{position:sticky" in css


def test_r81_notes_filters_share_one_date_status_search_pipeline():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "function filteredNotes()" in app
    assert "noteMatchesFilter(n,activeFilter) &&" in app
    assert "noteMatchesDate(n,dateFilter) &&" in app
    assert "const notes=filteredNotes();" in app

def test_r81_multiple_reviews_default_collapsed_with_single_open_accordion():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "reviews.length===1||state.expandedReviewId===r.id" in app
    assert "toggle-review-card" in app
    assert "state.expandedReviewId=state.expandedReviewId===id?null:id" in app

def test_r81_project_nav_hides_empty_sections_and_orientation_uses_state():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "currentKnowledge(area).length===0" in app
    assert "k-stage" in app and "k-outcome" in app
    assert "orientation.stage" in app and "orientation.outcome" in app

def test_r83_notes_date_filters_use_calendar_day_distance_not_timestamp_midnights():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "function localCalendarKey(value)" in app
    assert "function calendarDayNumber(value)" in app
    assert "const age=todayDay-noteDay;" in app
    assert "if(filter==='today')return age===0;" in app
    assert "if(filter==='7')return age<=6;" in app
    assert "if(filter==='30')return age<=29;" in app
    assert "new Date().toISOString().slice(0,10)" not in app
    assert "notes-result-count" in app


def test_r82_authoritative_review_counts_do_not_flash_fixture_values_before_hydration():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "reviewsBackendAvailable" not in app
    assert "questionsBackendAvailable" not in app
    assert "reviewsHydrated" not in app
    assert "state.backendStatus.reviews==='loaded'" in app
    assert "state.backendStatus.questions==='loaded'" in app

def test_r82_open_item_sections_are_collapsible_and_keep_attention_hierarchy():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    assert "openItemSections:{reviews:false,blockers:false,questions:null}" in app
    assert "toggle-open-item-section" in app
    assert "key==='questions' && count>5" in app
    assert "Needs your review" in app and "Blocking questions" in app and "Open questions" in app
    assert ".open-items-reviews" in css and ".open-items-blockers" in css and ".open-items-questions" in css

def test_r83_project_navigation_uses_stable_absolute_targets_without_sticky_section_motion():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    assert "function projectScrollTop(target)" in app
    assert "window.scrollY+el.getBoundingClientRect().top-offset" in app
    assert "window.scrollTo({top,behavior:'smooth'})" in app
    assert "function navigateTo(view" in app
    assert "scrollProjectTarget('project-top')" not in app
    assert "scrollIntoView({behavior:'smooth',block:'start'})" not in app
    assert ".project-section-sticky{position:relative" in css

def test_r84_navigation_rules_and_review_polish_contract():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    assert 'class="product-name product-home" data-view="overview"' in html
    assert "function navigateTo(view" in app
    assert "data-action=\"project-settings\"" in app
    assert "API.createRule" in app and "API.deleteRule" in app
    assert "Blocks: ${esc(q.blocks)}" in app
    assert "replace(/\\*\\*/g,'')" in app


def test_r85_integrity_and_polish_contracts():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    api_js = (FRONTEND / "context-api.js").read_text(encoding="utf-8")
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    assert 'data-view="project-overview">Project</button>' in html
    assert "window.scrollTo({top:0,behavior:'auto'})" in app
    assert "n.backendManaged?'':`<button" in app
    assert "getDrafts" in api_js and "createDraft" in api_js and "updateDraft" in api_js and "deleteDraft" in api_js
    assert "setQuestionBlocking" in api_js and "What does this block?" in app
    assert "Showing <strong>${notes.length}</strong> of ${total} notes" in app
    assert "Search history" in app and "historyResultCount" in app
    assert "Rules apply to future analysis. Existing Reviews are not reinterpreted automatically." in app
    assert "Current State items" in app
    assert "backendStatus" in app and "temporarily unavailable" in app


def test_r86_notes_link_into_review_and_history_workflow():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "data-action=\"open-note-reviews\"" in app
    assert "reviewIds:open.map(r=>r.id)" in app
    assert "state.expandedReviewId=ids[0]" in app
    assert "data-action=\"open-note-history\"" in app
    assert "historyEvidenceId" in app
    assert "From note:" in app

def test_r86_demo_history_is_real_provenance_not_frontend_fixture_rows():
    seed = (Path(__file__).parent / "seed_demo.py").read_text(encoding="utf-8")
    assert "HISTORY_SCENARIOS" in seed
    assert "INSERT INTO review_issues" in seed
    assert "INSERT INTO proposed_state_changes" in seed
    assert "INSERT INTO history_transitions" in seed
    assert "demo_history" in seed


def test_r861_client_hydration_never_recreates_missing_fixture_questions():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    seed = (Path(__file__).parent / "seed_demo.py").read_text(encoding="utf-8")
    assert "bootstrapFixtureQuestions" not in app
    assert "syncApiQuestions(payloadOf(byKey.questions).items||[])" in app
    assert "INSERT INTO questions" in seed


def test_r861_ask_harness_disables_backend_hydration_instead_of_emitting_fetch_errors():
    harness = (FRONTEND / "state-ask-behavior-tests.js").read_text(encoding="utf-8")
    assert "context.window.STATE_API=null" in harness
    assert "context-api.js'),'utf8'),context" not in harness


def test_r861_repository_has_one_obvious_deploy_backend():
    repo = Path(__file__).parent.parent
    render = (repo / "render.yaml").read_text(encoding="utf-8")
    assert "rootDir: state-project-complete" in render
    assert not (repo / "api.py").exists()
    assert (repo / "state-project-complete" / "api.py").exists()


def test_r9_ask_vertical_slice_has_dedicated_module_and_backend_endpoint():
    frontend = Path(__file__).parent.parent / "implementation-context-prototype"
    app = (frontend / "context-app.js").read_text(encoding="utf-8")
    api_js = (frontend / "context-api.js").read_text(encoding="utf-8")
    ask_js = (frontend / "context-ask.js").read_text(encoding="utf-8")
    html = (frontend / "index.html").read_text(encoding="utf-8")
    backend = (Path(__file__).parent / "api.py").read_text(encoding="utf-8")
    assert "context-ask.js" in html
    assert "ask: (query, previousAnswer = null)" in api_js
    assert "@app.post(\"/api/ask\")" in backend
    assert "ASK?.canHandle(raw,previousLive)" in app
    assert "Meeting prep" in ask_js
    assert "Before you move on" in ask_js
    assert "Review open items" in ask_js
    assert "Review now" in ask_js
    assert "Blocks: " in ask_js
    assert "data-action=\"new-ask\"" in app


def test_dialog_visibility_has_one_source_of_truth():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    assert 'id="overlay" hidden' in html
    assert "overlay.hidden=false" in app
    assert "overlay.hidden=true" in app
    assert "is-open" not in app
    assert ".overlay.is-open" not in css
    assert ".overlay[hidden]{display:none!important}" in css



def test_informational_dialog_focus_does_not_scroll_to_bottom_action():
    app = (FRONTEND / "context-app.js").read_text()
    assert "button:not(.dialog-close)" not in app
    assert "[autofocus], input:not([type=\"hidden\"]), textarea, select" in app
    assert "focus({preventScroll:true})" in app
    assert "function showDemoHelp()" in app


def test_ask_fixed_followup_reserves_answer_clearance_on_desktop_and_mobile():
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert ".ask-followup{position:fixed" in css
    assert ".unboxed-ask:has(.ask-session-row) .answer-stage{background:#fff" in css
    assert "padding:26px 30px 100px" in css
    assert ".unboxed-ask:has(.ask-session-row) .answer-stage{padding:20px 18px 96px}" in css
    assert 'class="ask-followup"' in app


def test_project_finishing_pass_avoids_repeating_current_direction_in_header():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    assert 'class="project-document-summary">Reviewed project understanding' in app
    assert '<strong>Current direction</strong>' in app
    assert '${esc(orientation.description)}</p><dl class="project-document-meta">' not in app
    assert 'grid-template-columns:minmax(0,.9fr) minmax(0,1.35fr) minmax(150px,.75fr)!important' in css
    assert '.project-outline-actions .project-pending,.project-outline-actions .project-history-link{opacity:.72' in css


def test_r95_ask_progress_preview_runs_in_parallel_without_blocking_final_request():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    api_js = (FRONTEND / "context-api.js").read_text(encoding="utf-8")
    ask_js = (FRONTEND / "context-ask.js").read_text(encoding="utf-8")
    backend = (Path(__file__).parent / "api.py").read_text(encoding="utf-8")
    assert "askPreview: query => jsonPost('/api/ask/preview'" in api_js
    assert "async function preview(query)" in ask_js
    assert "previewPromise=ASK.preview?.(raw)" in app
    assert "const payload=await ASK.submit(raw,previousLive)" in app
    assert "await ASK.preview" not in app
    assert "Grounded context ready" in app
    assert '@app.post("/api/ask/preview")' in backend


def test_r96_true_streaming_contract_is_wired_end_to_end():
    api_js = (FRONTEND / "context-api.js").read_text()
    ask_js = (FRONTEND / "context-ask.js").read_text()
    app_js = (FRONTEND / "context-app.js").read_text()
    backend = (Path(__file__).parent / "api.py").read_text()
    provider = (Path(__file__).parent / "ask_provider.py").read_text()

    assert "askStream" in api_js
    assert "getReader()" in api_js
    assert "text/event-stream" in api_js
    assert "renderStream" in ask_js
    assert "ask-stream-cursor" in ask_js
    assert "liveAskStreaming" in app_js
    assert "paintStreamingAsk" in app_js
    assert '@app.post("/api/ask/stream")' in backend
    assert "StreamingResponse" in backend
    assert "stream_synthesize_selected" in provider
    assert "messages.stream(" in provider


def test_r97_workspace_attention_replaces_late_review_banner_with_stable_action_layer():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    assert "function workspaceAttentionHtml()" in app
    assert "Needs your attention" in app
    assert "Checking what needs you" in app
    assert "uiPendingReviews()" in app
    assert "openQuestions().filter(q=>q.blocking)" in app
    assert "workspaceAttentionHtml()" in app
    assert "const reviewBanner =" not in app
    assert "${reviewBanner}" not in app
    assert ".workspace-attention{" in css
    assert "min-height:126px" in css
    assert ".attention-item.blocker .attention-kind" in css


def test_r10_all_fresh_questions_use_grounded_backend_when_available():
    ask_js = (FRONTEND / "context-ask.js").read_text(encoding="utf-8")
    assert "return !!API?.ask && !!String(query || '').trim();" in ask_js


def test_r10_modal_overlay_sits_above_portfolio_header_and_resets_scroll():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    assert ".overlay{z-index:200!important" in css
    assert "overlay.scrollTop=0; if(dialog) dialog.scrollTop=0;" in app
    assert "focus({preventScroll:true})" in app


def test_r10_ask_draft_is_captured_before_overview_rerender():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "if(liveAskInput) state.askInputDraft=liveAskInput.value;" in app
    assert 'value="${esc(state.askInputDraft||\'\')}"' in app


def test_r10_followups_keep_previous_artifact_and_use_compact_working_state():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    assert "ask-followup-working" in app
    assert "ask-followup-answer" in app
    assert "state.result={liveAsk:payload,previousLive};" in app
    assert ".ask-followup-working" in css


def test_r10_demo_reset_is_available_from_project_settings():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    api_js = (FRONTEND / "context-api.js").read_text(encoding="utf-8")
    backend = (Path(__file__).parent / "api.py").read_text(encoding="utf-8")
    assert "Reset demo data" in app
    assert "data-action=\"reset-demo\"" in app
    assert "resetDemo: () => request('/api/demo/reset'" in api_js
    assert '@app.post("/api/demo/reset")' in backend


def test_r11_frontend_assets_use_current_cache_bust_revision():
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    assert "?v=r11-user-e2e" in html
    assert "?v=r9.3.1b" not in html


def test_workspace_hydration_does_not_replace_active_ask_input():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "function renderWorkspaceAttentionOnly()" in app
    assert "current.replaceWith(next);" in app
    assert "if(state.view==='overview')" in app
    assert "if(!state.result)" in app
    assert "renderWorkspaceAttentionOnly();" in app
    assert "return;" in app
    assert "if(liveAskInput) state.askInputDraft=liveAskInput.value;" in app
