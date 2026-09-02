from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .interpretation_validation import validate_schema


@dataclass(frozen=True)
class StateContextItem:
    id: str
    version: int


@dataclass(frozen=True)
class ReviewContextItem:
    id: str
    review_type: str
    status: str


@dataclass(frozen=True)
class InterpretationContextSnapshot:
    """Exact authority snapshot supplied to one interpretation attempt.

    This object is captured once before provider invocation. Semantic validation
    must use the same snapshot; it must not silently replace it with freshly
    fetched State/Review context after the model returns.
    """

    state_items: Mapping[str, StateContextItem]
    open_reviews: Mapping[str, ReviewContextItem]


@dataclass(frozen=True)
class ApplicationStateSnapshot:
    """Minimal persisted facts used to validate references at return time."""

    state_items: Mapping[str, StateContextItem]
    reviews: Mapping[str, ReviewContextItem]


class StructuredInterpretationSemanticError(ValueError):
    """Raised when structurally valid output violates State application rules."""

    def __init__(self, code: str, message: str, *, path: tuple[Any, ...] = ()) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.path = path


def _fail(code: str, message: str, *path: Any) -> None:
    raise StructuredInterpretationSemanticError(code, message, path=tuple(path))


def validate_semantics(
    payload: Mapping[str, Any],
    *,
    context: InterpretationContextSnapshot,
    application_state: ApplicationStateSnapshot,
) -> None:
    """Validate application semantics atomically after JSON Schema validation.

    No downstream Review or proposal should be persisted until this function
    returns successfully for the entire StructuredInterpretation.

    Passing this validator does not establish interpretation correctness. It
    establishes only that the model's recommendation is legal relative to the
    exact context it received and the persisted application facts needed for
    lifecycle/reference checks.
    """

    # Defensive authority guard. The JSON Schema already rejects these fields,
    # so the normal pipeline reports a schema violation first. This duplicate
    # check protects the semantic boundary if it is ever called independently
    # or the schema evolves without intentionally granting model authority over
    # human Review resolution.
    for recommendation_index, recommendation in enumerate(payload.get("review_recommendations", [])):
        for forbidden_field in ("status", "resolution", "decided_at", "decided_by"):
            if forbidden_field in recommendation:
                _fail(
                    "forbidden_human_resolution_field",
                    f"Model output may not set Review field {forbidden_field!r}",
                    "review_recommendations",
                    recommendation_index,
                    forbidden_field,
                )

    # The semantic boundary assumes a legal shape, but validates defensively so
    # callers cannot accidentally bypass the structural layer.
    validate_schema(payload)

    recommendations = payload["review_recommendations"]
    for recommendation_index, recommendation in enumerate(recommendations):
        base_path = ("review_recommendations", recommendation_index)

        # Affected State means materially implicated: changed, confirmed, or
        # threatened. Every listed item must both exist and have been supplied.
        affected = recommendation["affected_state_item_ids"]
        for state_index, state_id in enumerate(affected):
            path = base_path + ("affected_state_item_ids", state_index)
            if state_id not in application_state.state_items:
                _fail("invalid_state_reference", f"State item {state_id!r} does not exist", *path)
            if state_id not in context.state_items:
                _fail("state_not_in_context", f"State item {state_id!r} was not supplied to the model", *path)

        if recommendation["review_action"] == "update_existing":
            review_id = recommendation["existing_review_id"]
            review_path = base_path + ("existing_review_id",)
            persisted_review = application_state.reviews.get(review_id)
            if persisted_review is None:
                _fail("invalid_review_reference", f"Review {review_id!r} does not exist", *review_path)
            if persisted_review.status != "open":
                _fail("review_not_open", f"Review {review_id!r} is not open", *review_path)
            context_review = context.open_reviews.get(review_id)
            if context_review is None:
                _fail("review_not_in_context", f"Review {review_id!r} was not supplied to the model", *review_path)
            if recommendation["review_type"] != persisted_review.review_type:
                _fail(
                    "review_type_mismatch",
                    f"Recommendation type {recommendation['review_type']!r} does not match Review {review_id!r} type {persisted_review.review_type!r}",
                    *base_path,
                    "review_type",
                )
            # Also ensure the context itself described the same lifecycle/type
            # facts as the persisted Review at capture time.
            if context_review.status != "open":
                _fail("review_not_in_context", f"Review {review_id!r} context snapshot was not open", *review_path)
            if context_review.review_type != recommendation["review_type"]:
                _fail(
                    "review_type_mismatch",
                    f"Recommendation type does not match supplied Review {review_id!r}",
                    *base_path,
                    "review_type",
                )

        proposal_targets: set[str] = set()
        for proposal_index, proposal in enumerate(recommendation["proposed_changes"]):
            proposal_path = base_path + ("proposed_changes", proposal_index)
            operation = proposal["operation"]

            if operation in {"update", "retire"}:
                state_id = proposal["state_item_id"]
                target_path = proposal_path + ("state_item_id",)

                if state_id not in application_state.state_items:
                    _fail("invalid_state_reference", f"State item {state_id!r} does not exist", *target_path)
                context_state = context.state_items.get(state_id)
                if context_state is None:
                    _fail("state_not_in_context", f"State item {state_id!r} was not supplied to the model", *target_path)
                if state_id not in affected:
                    _fail(
                        "proposal_target_not_affected",
                        f"Proposal target {state_id!r} is not listed in affected_state_item_ids",
                        *target_path,
                    )
                if state_id in proposal_targets:
                    _fail(
                        "duplicate_proposal_target",
                        f"State item {state_id!r} is targeted more than once in one recommendation",
                        *target_path,
                    )
                proposal_targets.add(state_id)

                expected_version = proposal["expected_version"]
                if expected_version != context_state.version:
                    _fail(
                        "proposal_version_mismatch",
                        f"Proposal expects State version {expected_version}, but supplied context version was {context_state.version}",
                        *proposal_path,
                        "expected_version",
                    )

        # Schema already restricts Missing Understanding proposals to create.
        # Keep a semantic guard here because this rule is product behavior, not
        # merely a convenient structural encoding.
        if recommendation["review_type"] == "missing_understanding":
            for proposal_index, proposal in enumerate(recommendation["proposed_changes"]):
                if proposal["operation"] != "create":
                    _fail(
                        "illegal_review_proposal_combination",
                        "Missing Understanding may only contain create proposals",
                        *base_path,
                        "proposed_changes",
                        proposal_index,
                        "operation",
                    )
