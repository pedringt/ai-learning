"""Small runtime fixes from the 2026-09-15 Baseline Setup dogfood pass.

The fixes here are deliberately scoped to Baseline Setup and project lifecycle
edges. They do not change State's authority model: Evidence is immutable, AI
interpretation remains proposed understanding, and only a person can authorize
Current State.
"""
from __future__ import annotations

import re
from typing import Any

_INSTALLED = False


def _heading_sections(text: str) -> list[tuple[str, str]]:
    """Return meaningful source sections when the source exposes clear headings.

    PDF text extraction often drops Markdown markers but keeps numbered headings
    such as ``1. Product overview``. Treat those and Markdown headings as strong
    structure signals. We only switch to section-aware chunking when at least two
    headings are present, so ordinary prose keeps the existing splitter.
    """
    lines = (text or "").splitlines()
    sections: list[tuple[str, list[str]]] = []
    preamble: list[str] = []
    current_heading = ""
    current_lines: list[str] = []

    def is_heading(line: str) -> bool:
        clean = line.strip()
        if not clean or len(clean) > 120:
            return False
        if re.match(r"^#{1,6}\s+\S", clean):
            return True
        if re.match(r"^\d{1,2}[.)]\s+\S", clean):
            return True
        return False

    def flush() -> None:
        nonlocal current_lines
        if current_heading:
            body = "\n".join(current_lines).strip()
            sections.append((current_heading, [body] if body else []))
        current_lines = []

    for raw in lines:
        clean = raw.strip()
        if is_heading(clean):
            flush()
            current_heading = clean
            continue
        if current_heading:
            current_lines.append(raw)
        else:
            preamble.append(raw)
    flush()

    if len(sections) < 2:
        return []

    result: list[tuple[str, str]] = []
    preamble_text = "\n".join(preamble).strip()
    if preamble_text:
        result.append(("", preamble_text))
    for heading, body_parts in sections:
        body = "\n".join(body_parts).strip()
        result.append((heading, f"{heading}\n{body}".strip()))
    return result


def section_aware_split(text: str, original_split, max_chars: int = 2600) -> list[str]:
    """Prefer source sections over arbitrary size chunks when structure exists."""
    sections = _heading_sections(text)
    if not sections:
        return original_split(text, max_chars=max_chars)

    chunks: list[str] = []
    for heading, section_text in sections:
        pieces = original_split(section_text, max_chars=max_chars)
        for piece in pieces:
            clean = (piece or "").strip()
            if not clean:
                continue
            # The existing question-dense splitter carries Markdown headings but
            # cannot know that a numbered PDF line was a heading. Reattach it to
            # every child chunk so the model never loses the source's category.
            if heading and heading not in clean[: max(len(heading) + 8, 80)]:
                clean = f"{heading}\n{clean}"
            chunks.append(clean)
    return chunks or original_split(text, max_chars=max_chars)


def _install_project_delete_dependency() -> None:
    """Delete Baseline coverage rows before their Evidence parent rows.

    Migration 015 added baseline_evidence_coverage with a foreign key to
    evidence. The older project cleanup list predates that table; once a source
    had been processed, deleting the project could therefore fail with a foreign
    key error. Prepending the dependent table repairs both Reset and Delete while
    keeping the existing transaction/order logic intact.
    """
    import seed_demo

    entry = (
        "baseline_evidence_coverage",
        "evidence_id IN (SELECT id FROM evidence WHERE project_id=?)",
    )
    if entry not in seed_demo._PROJECT_DEPENDENT_TABLES:
        seed_demo._PROJECT_DEPENDENT_TABLES = (entry, *seed_demo._PROJECT_DEPENDENT_TABLES)


def _install_section_aware_chunking() -> None:
    import baseline_setup

    if getattr(baseline_setup.split_evidence_text, "_state_section_aware", False):
        return
    original = baseline_setup.split_evidence_text

    def split_with_source_structure(text: str, max_chars: int = 2600) -> list[str]:
        return section_aware_split(text, original, max_chars=max_chars)

    split_with_source_structure._state_section_aware = True
    baseline_setup.split_evidence_text = split_with_source_structure


def _install_delete_safe_background_analysis(async_module: Any) -> None:
    """Make a deleted project a benign terminal state for queued analysis.

    A Baseline upload returns before interpretation finishes. If the person
    deletes that test project while the task is running, the task must not later
    try to persist Reviews/proposals into rows that no longer exist.
    """
    if getattr(async_module._analyze_in_background, "_state_delete_safe", False):
        return

    def analyze_delete_safe(settings: Any, provider: Any, project_id: str, evidence_id: str) -> None:
        connection = async_module.connect(settings.connection_url())
        try:
            connection.project_id = project_id
            project = connection.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone()
            evidence = connection.execute(
                "SELECT id FROM evidence WHERE id=? AND project_id=?", (evidence_id, project_id)
            ).fetchone()
            if project is None or evidence is None:
                async_module.logger.info(
                    "Skipping Baseline analysis for deleted project/evidence %s", evidence_id
                )
                return

            try:
                async_module.process_evidence(
                    connection, evidence_id=evidence_id, provider=provider
                )
            except Exception:
                try:
                    connection.rollback()
                except Exception:
                    pass

                # Deletion can race the provider call itself. Re-check after the
                # failure; if the project/Evidence disappeared, there is nothing
                # left to mark failed and no product error to surface.
                try:
                    project = connection.execute(
                        "SELECT id FROM projects WHERE id=?", (project_id,)
                    ).fetchone()
                    evidence = connection.execute(
                        "SELECT id FROM evidence WHERE id=? AND project_id=?",
                        (evidence_id, project_id),
                    ).fetchone()
                except Exception:
                    project = evidence = None
                if project is None or evidence is None:
                    async_module.logger.info(
                        "Baseline analysis stopped because project/evidence was deleted: %s",
                        evidence_id,
                    )
                    return

                async_module.logger.exception(
                    "Background Baseline analysis failed for %s", evidence_id
                )
                try:
                    connection.execute(
                        "UPDATE evidence SET processing_status='failed' "
                        "WHERE id=? AND project_id=? AND processing_status='pending'",
                        (evidence_id, project_id),
                    )
                    connection.commit()
                except Exception:
                    async_module.logger.exception(
                        "Could not mark failed Baseline Evidence %s", evidence_id
                    )
        finally:
            connection.close()

    analyze_delete_safe._state_delete_safe = True
    async_module._analyze_in_background = analyze_delete_safe


def install_baseline_dogfood_fixes(core_module: Any, async_module: Any) -> None:
    global _INSTALLED
    if _INSTALLED:
        return
    _install_project_delete_dependency()
    _install_section_aware_chunking()
    _install_delete_safe_background_analysis(async_module)
    _INSTALLED = True
