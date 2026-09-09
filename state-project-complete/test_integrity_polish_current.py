from pathlib import Path


FRONTEND = Path(__file__).parent.parent / "implementation-context-prototype"


def test_current_integrity_and_polish_contracts():
    app = (FRONTEND / "context-app.js").read_text(encoding="utf-8")
    api_js = (FRONTEND / "context-api.js").read_text(encoding="utf-8")
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    notes = (FRONTEND / "context-notes-view.js").read_text(encoding="utf-8")
    project = (FRONTEND / "context-project-view.js").read_text(encoding="utf-8")

    assert 'data-view="project-overview">Current State</button>' in html
    assert "window.scrollTo({top:0,behavior:'auto'})" in app

    # Notes lifecycle is now centralized in isEditableDraft(). Submitted,
    # reviewed, accepted, no-review-needed, unknown, and backend-managed notes
    # must not surface Edit.
    assert "function isEditableDraft(n)" in notes
    assert "if(n.backendManaged) return false;" in notes
    assert "!['pending','accepted','reviewed','no_review_needed','unknown'].includes(n.status)" in notes
    assert "${editable?`<button class=\"text-button\" data-action=\"edit-note\"" in notes

    assert "getDrafts" in api_js and "createDraft" in api_js and "updateDraft" in api_js and "deleteDraft" in api_js
    assert "setQuestionBlocking" in api_js and "What does this block?" in app
    assert "Showing <strong>${notes.length}</strong> of ${totalCount} notes" in notes
    assert "Search history" in app and "historyResultCount" in app
    assert "Rules apply to future analysis. Existing Reviews are not reinterpreted automatically." in app
    assert "project-maintained-facts" in project
    assert "current facts" not in project
    assert "backendStatus" in app and "temporarily unavailable" in app
