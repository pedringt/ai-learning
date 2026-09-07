import re
from pathlib import Path


FRONTEND = Path(__file__).parent.parent / "implementation-context-prototype"
JS = (FRONTEND / "context-app.js").read_text()
API_JS = (FRONTEND / "context-api.js").read_text()
NOTES_VIEW_JS = (FRONTEND / "context-notes-view.js").read_text()
OPEN_ITEMS_VIEW_JS = (FRONTEND / "context-open-items-view.js").read_text()
PROJECT_VIEW_JS = (FRONTEND / "context-project-view.js").read_text()


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
    # Project page rendering moved to context-project-view.js 2026-09-06.
    assert "project-document" in PROJECT_VIEW_JS
    assert "project-outline-section" in PROJECT_VIEW_JS
    assert "project-area-cards" not in JS and "project-area-cards" not in PROJECT_VIEW_JS


def test_project_subnav_scrolls_existing_document_without_rerender():
    assert "if(state.view!=='project-overview'){state.view='project-overview';render();" in JS
    assert "else{updateNav();updateProjectSubnavActive(target);scrollProjectTarget(target);}" in JS
    # Scope this to the project-jump handler itself (not the whole file) so an
    # unrelated setTimeout added anywhere else in JS can't produce a false
    # failure here: the handler should scroll via requestAnimationFrame /
    # scrollProjectTarget, not an arbitrary setTimeout delay.
    project_jump_handler = JS.split("const projectJump=e.target.closest('[data-project-jump]');", 1)[1].split("const relatedReview=", 1)[0]
    assert "setTimeout" not in project_jump_handler
    assert "updateProjectSubnavActive" in JS
    assert "aria-current','location'" in JS



def test_navigation_preserves_current_ask_session_until_explicit_new_ask():
    nav = JS.split("function navigateTo(view", 1)[1].split("function projectScrollTop", 1)[0]
    assert "state.result=null" not in nav
    assert "state.resultQuery=''" not in nav
    assert "act==='close-result'||act==='new-ask'" in JS


def test_frontend_api_base_is_runtime_configurable():
    assert "window.STATE_API_BASE" in API_JS
    assert "dataset?.apiBase" in API_JS


def test_workspace_uses_one_bootstrap_request_with_safe_fallback():
    assert "getBootstrap: () => request('/api/bootstrap')" in API_JS
    assert "const payload=await API.getBootstrap()" in JS
    assert "Workspace bootstrap unavailable; retrying individual resources." in JS


def test_open_items_action_count_includes_reviews_and_blockers_only():
    assert "uiPendingReviews().length+openQuestions().filter(q=>q.blocking).length" in JS
    # The Open Items page header's own actionTotal moved to
    # context-open-items-view.js 2026-09-06; the workspace attention-banner
    # total below is a separate computation (workspaceAttentionHtml) and
    # stayed in context-app.js.
    assert "const actionTotal=" in OPEN_ITEMS_VIEW_JS
    assert "View all ${total} →" in JS
    assert "Showing ${items.length} of ${total}" in JS
    assert "more in Open Items" not in JS
    assert "more in Open Items" not in OPEN_ITEMS_VIEW_JS


def test_provider_failure_retry_reuses_saved_evidence():
    assert "retryEvidenceAnalysis" in JS
    assert "/api/evidence/${encodeURIComponent(evidenceId)}/reanalyze" in API_JS
    assert "Retry analysis without submitting it again" in JS


def test_r8_long_project_and_open_items_scaling_contract():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    # The "waiting" question list's 5-item cap and topic-overlap sort moved to
    # context-open-items-view.js 2026-09-06; the click handler that flips
    # state.openQuestionsExpanded and re-renders stayed in context-app.js.
    assert "waiting.slice(0,5)" in OPEN_ITEMS_VIEW_JS
    assert "toggle-open-questions" in app
    assert "const reviewTopics=new Set(reviews.flatMap(r=>r.topics||[]));" in OPEN_ITEMS_VIEW_JS
    # Both gained extra parameters (pendingFor, history, knowledge) when they
    # moved to context-project-view.js 2026-09-06, since they can no longer
    # close over context-app.js's `state`.
    assert "function projectWikiTopic(topic,items,pendingFor,history)" in PROJECT_VIEW_JS
    assert "function projectOutlineSection(id,a,knowledge,pendingFor,history)" in PROJECT_VIEW_JS
    assert "project-section-sticky" in PROJECT_VIEW_JS
    assert ".app-sidebar{position:sticky" in css


def test_r81_notes_filters_share_one_date_status_search_pipeline():
    # Notes filtering (date + status + search) lives in context-notes-view.js;
    # context-app.js only forwards to it via a same-name wrapper (see
    # notesUiState()/filteredNotes() there) so every existing call site is
    # unchanged. Split out 2026-09-06 as part of the context-app.js size
    # reduction -- see README's "Known debt".
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "function filteredNotes(){ return NOTES_VIEW.filteredNotes(" in app
    assert "const notes=filteredNotes();" in app
    assert "function filteredNotes(notes,ui)" in NOTES_VIEW_JS
    assert "noteMatchesFilter(n,activeFilter) &&" in NOTES_VIEW_JS
    assert "noteMatchesDate(n,dateFilter) &&" in NOTES_VIEW_JS


def test_r81_multiple_reviews_default_collapsed_with_single_open_accordion():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    # The expanded/collapsed decision per review card moved to
    # context-open-items-view.js 2026-09-06 -- expandedReviewId arrives there
    # as a plain argument (from context-app.js's state.expandedReviewId)
    # rather than being read off `state` directly, so the literal text lost
    # its "state." prefix. The click handler that mutates state.expandedReviewId
    # and the toggle-review-card action name itself stayed in context-app.js.
    assert "reviews.length===1||expandedReviewId===r.id" in OPEN_ITEMS_VIEW_JS
    assert "toggle-review-card" in app
    assert "state.expandedReviewId=state.expandedReviewId===id?null:id" in app


def test_r81_project_nav_hides_empty_sections_and_orientation_uses_state():
    # updateNav()'s empty-section check (and its own currentKnowledge()/
    # projectMetaIds copy) stayed in context-app.js. projectOrientation() and
    # the header that reads its stage/outcome moved to context-project-view.js
    # 2026-09-06.
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "currentKnowledge(area).length===0" in app
    assert "k-stage" in app and "k-outcome" in app
    assert "k-stage" in PROJECT_VIEW_JS and "k-outcome" in PROJECT_VIEW_JS
    assert "orientation.stage" in PROJECT_VIEW_JS and "orientation.outcome" in PROJECT_VIEW_JS


def test_r83_notes_date_filters_use_calendar_day_distance_not_timestamp_midnights():
    # Relocated to context-notes-view.js 2026-09-06 (see comment on
    # test_r81_notes_filters_share_one_date_status_search_pipeline above).
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "function localCalendarKey(value)" in NOTES_VIEW_JS
    assert "function calendarDayNumber(value)" in NOTES_VIEW_JS
    assert "const age=todayDay-noteDay;" in NOTES_VIEW_JS
    assert "if(filter==='today')return age===0;" in NOTES_VIEW_JS
    assert "if(filter==='7')return age<=6;" in NOTES_VIEW_JS
    assert "if(filter==='30')return age<=29;" in NOTES_VIEW_JS
    assert "new Date().toISOString().slice(0,10)" not in NOTES_VIEW_JS
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
    assert "openItemSections:{reviews:false,blockers:false,drafts:true,questions:null}" in app
    assert "toggle-open-item-section" in app
    # openItemSection()'s own default-collapse rule and the section
    # title/copy strings moved to context-open-items-view.js 2026-09-06.
    assert "key==='questions' && count>5" in OPEN_ITEMS_VIEW_JS
    assert "Needs your review" in OPEN_ITEMS_VIEW_JS and "Blocking questions" in OPEN_ITEMS_VIEW_JS and "Draft notes" in OPEN_ITEMS_VIEW_JS and "Open questions" in OPEN_ITEMS_VIEW_JS
    assert ".open-items-reviews" in css and ".open-items-blockers" in css and ".open-items-drafts" in css and ".open-items-questions" in css


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
    # questionDialogHtml() and reviewCard()'s cleanReviewCopy() both moved to
    # context-open-items-view.js 2026-09-06.
    assert "Blocks: ${esc(q.blocks)}" in OPEN_ITEMS_VIEW_JS
    assert "replace(/\\*\\*/g,'')" in OPEN_ITEMS_VIEW_JS


def test_r85_integrity_and_polish_contracts():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    api_js = (FRONTEND / "context-api.js").read_text(encoding="utf-8")
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    # Renamed Project -> Project State -> Knowledge -> Current State (2026-09-07
    # then again same day: "Project State" made users learn a third term
    # alongside Current State, and "Knowledge" sounded like an AI knowledge base
    # and reintroduced the same two-concept problem under a new name -- Current
    # State is now the single user-facing name for the maintained project
    # understanding). The label lives directly in index.html -- context-quickwins.js
    # used to force-rewrite it at runtime specifically to avoid touching this
    # assertion; removed that indirection along with the rename.
    assert 'data-view="project-overview">Current State</button>' in html
    assert "window.scrollTo({top:0,behavior:'auto'})" in app
    # n.backendManaged?'':`<button ...>Edit</button>` moved to context-notes-view.js
    # 2026-09-06 (see comment on test_r81_notes_filters_share_one_date_status_search_pipeline).
    assert "n.backendManaged?'':`<button" in NOTES_VIEW_JS
    assert "getDrafts" in api_js and "createDraft" in api_js and "updateDraft" in api_js and "deleteDraft" in api_js
    assert "setQuestionBlocking" in api_js and "What does this block?" in app
    # notesFilterSummary() moved to context-notes-view.js 2026-09-06.
    assert "Showing <strong>${notes.length}</strong> of ${totalCount} notes" in NOTES_VIEW_JS
    assert "Search history" in app and "historyResultCount" in app
    assert "Rules apply to future analysis. Existing Reviews are not reinterpreted automatically." in app
    # Both moved to context-project-view.js 2026-09-06.
    assert "current facts" in PROJECT_VIEW_JS
    assert "project-maintained-facts" in PROJECT_VIEW_JS
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


def test_r861_grounded_ask_module_and_release_assets_are_self_contained():
    ask = (FRONTEND / "context-ask.js").read_text(encoding="utf-8")
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    assert "window.STATE_ASK" in ask

    # All State-owned JS/CSS assets use one release token so a deployment cannot
    # accidentally serve a mix of old and new frontend files from cache.
    versioned = re.findall(r"([\w./-]+\.(?:js|css))\?v=([\w.-]+)", html)
    assert versioned, "index.html no longer cache-busts its assets"

    referenced = {Path(src).name for src, _ in versioned}
    assert {"context-ask.js", "context-app.js", "context-history.js", "context-quickwins.js"} <= referenced

    versions = {token for _, token in versioned}
    assert len(versions) == 1, f"assets carry mismatched cache-bust versions: {sorted(versions)}"

    for src, _ in versioned:
        assert (FRONTEND / Path(src).name).exists(), f"{src} is referenced but does not exist"


def test_r95_workspace_attention_has_a_fast_independent_load_path():
    api_client = (FRONTEND / "context-api.js").read_text(encoding="utf-8")
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    api_server = (Path(__file__).parent / "api.py").read_text(encoding="utf-8")
    assert "getAttention: () => request('/api/attention')" in api_client
    assert "API.getAttention().then" in app
    assert '@app.get("/api/attention")' in api_server


def test_r19_project_summary_and_modal_actions_stay_compact():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    # Both moved to context-project-view.js 2026-09-06.
    assert 'class="project-fact-count"' in PROJECT_VIEW_JS
    assert 'class="current-direction-list"' in PROJECT_VIEW_JS
    assert 'data-action="close-dialog">Done' not in app
    assert 'data-action="close-dialog">Done' not in PROJECT_VIEW_JS


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
    assert "Meeting brief" in ask_js
    assert "Related open items" in ask_js
    assert "View open items →" in ask_js
    assert "Review →" in ask_js
    assert "Blocks: " in ask_js
    assert "data-action=\"new-ask\"" in ask_js


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


def test_r16_release_hardening_removes_control_chars_and_keeps_word_boundary_routing():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    assert "\x08" not in app
    # The old approved/confirmed/decided/... heuristic (any past-tense word
    # plus a topic word) was replaced 2026-09-07 after live QA found it
    # misrouted plain questions like "Did Security confirm retention terms?"
    # into the update-Evidence dialog. The successor only routes to that
    # dialog on explicit update intent, and only when the input doesn't
    # already look like a question -- this asserts the new regex's word
    # boundaries are still intact rather than pinning the retired one.
    assert "\\b(add (this|that|it)|please add|update (the )?(current )?state|record (this|that)|please record|note that|for the record|log (this|that))\\b" in app
    assert "\\b(changed|change|history|historical|originally" in app


def test_r16_mobile_workspace_nav_has_horizontal_overflow_affordance():
    css = (FRONTEND / "context-tool.css").read_text(encoding="utf-8")
    assert "R16 release hardening" in css
    assert '.sidebar-nav::after{content:"→"' in css
    assert "scrollbar-width:thin" in css


def test_followup_rendering_obeys_payload_mode_and_preserves_previous_answer_state():
    ask = (FRONTEND / "context-ask.js").read_text()
    app = (FRONTEND / "context-app.js").read_text()
    assert "followup_mode:'new'" in ask
    assert "payload?.followup_mode" in app
    # A fresh/topic-shift question must not carry the stale answer into the
    # loading/streaming state either -- not just the final rendered state.
    # (Regression: 2026-09-06 live QA found the old answer stayed fully
    # visible for the entire loading wait on a topic shift.)
    assert "const visiblePrevious=followupMode==='new'?null:previousLive;" in app
    assert "raw.resolution==='updated' && source.startsWith('question_response:')" not in app
