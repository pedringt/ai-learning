"""Targeted recovery when Baseline Setup finds Questions but no Starting State facts.

Dogfooding found a specific semantic failure: a long starting source could be
read successfully and surface its explicit Questions while producing zero routine
Starting State facts, even though the same source plainly contained purpose,
rules, architecture, product structure, and other durable project knowledge.

This module adds one bounded recovery pass only for that failure shape. The
recovery pass still produces ordinary missing_understanding create proposals.
Those proposals remain draft-only until the person confirms Starting State.
"""
from __future__ import annotations

import re
from typing import Any, Mapping

_INSTALLED = False
_MIN_SOURCE_CHARS = 1200
_MIN_DECLARATIVE_CHARS = 500

_RECOVERY_GUIDANCE = r"""
<baseline_fact_recovery>
The first Baseline Setup pass produced no routine Starting State facts from this substantial source. Run a narrow completeness recovery pass for ESTABLISHED FACTS ONLY.

- Extract durable facts that are explicitly stated in the Evidence and useful for understanding the project now.
- Emit those facts as missing_understanding recommendations with create proposals. These are internal Starting State draft facts, not separate approval clicks.
- Do not return no_review merely because the person will confirm the Starting State as a whole.
- Do not repeat unresolved Questions in this recovery pass; the first pass already handled Questions/conflicts.
- If the source mixes settled facts with Questions, recover the settled facts independently.
- Preserve source framing, named lists, counts, exercise/hypothetical labels, and important distinctions.
- Do not invent missing details, infer a lifecycle stage/outcome, or convert setup commentary into project truth.
</baseline_fact_recovery>
""".strip()


def _proposal_count(payload: Mapping[str, Any]) -> int:
    total = 0
    for recommendation in payload.get("review_recommendations") or []:
        total += sum(
            1 for proposal in recommendation.get("proposed_changes") or []
            if str(proposal.get("proposed_statement") or "").strip()
        )
    return total


def _declarative_char_count(text: str) -> int:
    """Approximate how much substantial non-question content the source has.

    This never interprets the text or creates facts. It only decides whether a
    second model pass is worth running after an obviously empty baseline result.
    """
    clean = " ".join((text or "").split()).strip()
    if not clean:
        return 0
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean) if part.strip()]
    declarative = [part for part in sentences if "?" not in part]
    return sum(len(part) for part in declarative)


def should_recover_baseline_facts(text: str, payload: Mapping[str, Any]) -> bool:
    """Return whether the result has the exact dogfood failure shape."""
    clean = (text or "").strip()
    if len(clean) < _MIN_SOURCE_CHARS:
        return False
    if _proposal_count(payload) > 0:
        return False
    if _declarative_char_count(clean) < _MIN_DECLARATIVE_CHARS:
        return False

    recommendations = payload.get("review_recommendations") or []
    has_questions = any(rec.get("review_type") == "open_question" for rec in recommendations)
    return has_questions or payload.get("outcome") == "no_review" or not recommendations


def install_baseline_fact_recovery() -> None:
    """Patch Baseline provider creation before the deployment app is built."""
    global _INSTALLED
    if _INSTALLED:
        return

    import baseline_setup

    original_guidance = baseline_setup.baseline_prompt_guidance

    def recovery_aware_guidance(connection: Any, evidence: Mapping[str, Any]) -> str:
        prompt = original_guidance(connection, evidence)
        if not evidence.get("_state_baseline_fact_recovery"):
            return prompt
        return f"{prompt}\n\n{_RECOVERY_GUIDANCE}" if prompt else _RECOVERY_GUIDANCE

    baseline_setup.baseline_prompt_guidance = recovery_aware_guidance

    original_factory = baseline_setup._baseline_provider_classes

    def provider_factory():
        classes = original_factory()
        for provider_class in classes:
            if getattr(provider_class, "_state_fact_recovery_installed", False):
                continue
            original_interpret = provider_class.interpret

            def interpret_with_recovery(self, *, context, evidence, connection=None, _original=original_interpret):
                result = _original(self, context=context, evidence=evidence, connection=connection)
                if connection is None or not baseline_setup.is_baseline_setup(connection):
                    return result
                if evidence.get("_state_baseline_fact_recovery"):
                    return result
                source_text = str(evidence.get("content") or "")
                if not should_recover_baseline_facts(source_text, result):
                    return result

                recovery_evidence = dict(evidence)
                recovery_evidence["_state_baseline_fact_recovery"] = True
                recovered = _original(
                    self,
                    context=context,
                    evidence=recovery_evidence,
                    connection=connection,
                )
                # The recovery call records the proposal metadata/hints that the
                # persistence hook consumes. Merge its facts with the first
                # pass's Questions/conflicts for the canonical validation path.
                return baseline_setup.merge_interpretation_payloads([result, recovered])

            provider_class.interpret = interpret_with_recovery
            provider_class._state_fact_recovery_installed = True
        return classes

    baseline_setup._baseline_provider_classes = provider_factory
    _INSTALLED = True
