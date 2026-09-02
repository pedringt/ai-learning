from __future__ import annotations

import copy
import re
from datetime import date
from typing import Any, Mapping

from .semantic_validation import InterpretationContextSnapshot

# Values models commonly emit when a date is semantically unknown/relative. The
# canonical contract intentionally requires a real ISO date, so these are
# treated as omission rather than a fatal structural error.
_DATE_SENTINELS = {
    "upon_decision", "upon decision", "immediately", "immediate", "now",
    "tbd", "unknown", "n/a", "na", "none", "null", "after_approval",
    "after approval", "upon_approval", "upon approval",
}
_PARTIAL_DATE_RE = re.compile(r"^\d{4}-\d{2}$")


def _dedupe_strings(value: Any) -> Any:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return value
    seen: set[str] = set()
    result: list[str] = []
    for item in value:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result



def _normalize_enum(value: Any, allowed: set[str]) -> Any:
    """Normalize harmless enum casing/whitespace without guessing semantics."""
    if not isinstance(value, str):
        return value
    normalized = value.strip().lower()
    return normalized if normalized in allowed else value

def _is_valid_iso_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
        return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value))
    except ValueError:
        return False


def _should_omit_date(value: Any) -> bool:
    if value is None or value == "":
        return True
    if not isinstance(value, str):
        return False
    normalized = value.strip().lower()
    if normalized in _DATE_SENTINELS:
        return True
    if _PARTIAL_DATE_RE.fullmatch(normalized):
        return True
    return False


def normalize_provider_payload(
    payload: Mapping[str, Any],
    *,
    context: InterpretationContextSnapshot,
) -> dict[str, Any]:
    """Normalize only deterministic/mechanical provider-output details.

    The model remains responsible for semantic claims: statements, review
    decisions, affected concepts, rationale, and concrete dates. Software owns
    concurrency/version fields and can safely repair redundant structural
    inconsistencies that otherwise cause a long provider call to fail after the
    fact.

    This function deliberately does *not* repair unknown State/Review IDs,
    missing proposal statements/rationales, human-resolution fields, or
    contradictory review_action/existing_review_id combinations. Those remain
    validation failures because repairing them would require guessing intent.
    """
    result = copy.deepcopy(dict(payload))

    if "outcome" in result:
        result["outcome"] = _normalize_enum(result.get("outcome"), {"no_review", "review_recommended"})

    if "topics" in result:
        result["topics"] = _dedupe_strings(result["topics"])

    recommendations = result.get("review_recommendations")
    if not isinstance(recommendations, list):
        return result

    # Anthropic's provider-facing schema intentionally omits the redundant
    # top-level outcome. Derive it from whether concrete recommendations exist.
    # For legacy providers that still emit outcome, a non-empty recommendation
    # list wins over an accidental no_review label; review_recommended + an
    # empty list remains invalid because software cannot invent a missing Review.
    if "outcome" not in result:
        result["outcome"] = "review_recommended" if recommendations else "no_review"
    elif recommendations and result.get("outcome") == "no_review":
        result["outcome"] = "review_recommended"
        result.pop("no_review_explanation", None)

    # no_review_explanation is meaningful only on no_review. A model sometimes
    # repeats an explanation even when it also emits actionable recommendations.
    if result.get("outcome") == "review_recommended":
        result.pop("no_review_explanation", None)
    elif result.get("outcome") == "no_review":
        explanation = result.get("no_review_explanation")
        if (explanation is None or explanation == "") and isinstance(result.get("summary"), str) and result["summary"].strip():
            result["no_review_explanation"] = result["summary"].strip()

    for recommendation in recommendations:
        if not isinstance(recommendation, dict):
            continue

        if "review_action" in recommendation:
            recommendation["review_action"] = _normalize_enum(
                recommendation.get("review_action"), {"create", "update_existing"}
            )
        else:
            recommendation["review_action"] = (
                "update_existing" if recommendation.get("existing_review_id") else "create"
            )
        recommendation["review_type"] = _normalize_enum(
            recommendation.get("review_type"), {"proposed_update", "state_at_risk", "missing_understanding"}
        )

        affected = _dedupe_strings(recommendation.get("affected_state_item_ids"))
        if isinstance(affected, list):
            recommendation["affected_state_item_ids"] = affected
        else:
            affected = recommendation.get("affected_state_item_ids")

        proposals = recommendation.get("proposed_changes")
        if not isinstance(proposals, list):
            continue

        has_existing_state_change = False
        for proposal in proposals:
            if not isinstance(proposal, dict):
                continue
            proposal["operation"] = _normalize_enum(
                proposal.get("operation"), {"create", "update", "retire"}
            )
            operation = proposal.get("operation")

            # Optional values should be omitted rather than emitted as null.
            for optional_key in ("effective_date",):
                if proposal.get(optional_key) is None:
                    proposal.pop(optional_key, None)

            if "effective_date" in proposal and _should_omit_date(proposal["effective_date"]):
                proposal.pop("effective_date", None)

            if operation == "create":
                # These are backend-owned/non-applicable for creates. Stripping
                # them is deterministic and prevents the known create+version
                # schema failure.
                proposal.pop("state_item_id", None)
                proposal.pop("expected_version", None)

            elif operation in {"update", "retire"}:
                has_existing_state_change = True
                state_id = proposal.get("state_item_id")
                if isinstance(state_id, str):
                    # affected_state_item_ids is redundant with an explicit
                    # target. A targeted State item is necessarily affected.
                    if isinstance(affected, list) and state_id not in affected:
                        affected.append(state_id)

                    # Concurrency versions are application facts, not model
                    # judgments. Always inject the exact captured version.
                    context_state = context.state_items.get(state_id)
                    if context_state is not None:
                        proposal["expected_version"] = context_state.version

                if operation == "retire":
                    # Retire intentionally carries no replacement statement.
                    proposal.pop("proposed_statement", None)

        # missing_understanding + update/retire is mechanically incompatible.
        # When the model explicitly targets existing State, the canonical
        # review type is proposed_update.
        if recommendation.get("review_type") == "missing_understanding" and has_existing_state_change:
            recommendation["review_type"] = "proposed_update"

        # grouping_reason is presentation metadata, not authority. It is legal
        # only when there is actual grouping; remove accidental singleton use.
        grouping_needed = (
            isinstance(affected, list) and len(affected) >= 2
        ) or len(proposals) >= 2
        if not grouping_needed:
            recommendation.pop("grouping_reason", None)
        elif recommendation.get("grouping_reason") in (None, ""):
            # Missing grouping rationale is not synthesized; the canonical
            # schema permits omission for grouped recommendations.
            recommendation.pop("grouping_reason", None)

        if recommendation.get("review_action") == "create":
            recommendation.pop("existing_review_id", None)
        elif recommendation.get("existing_review_id") is None:
            recommendation.pop("existing_review_id", None)

    return result
