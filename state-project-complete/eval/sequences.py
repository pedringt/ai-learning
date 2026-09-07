"""Sequence-based evaluations (Phase 3 of the "Next Marching Orders" doc).

Every scenario in eval/scenarios.py is a single Evidence event judged in
isolation. Real projects unfold over time -- a proposal firms up into a
decision, a decision gets reversed, a Question gets answered and then
un-answered. This file defines a handful of realistic multi-step project
evolutions and, for each step, records what State's Current State / open
Reviews / open Questions look like immediately afterward -- so a human can
inspect whether State tracked the story correctly at every point, not just
at the end.

Each Step is one Evidence event plus what a human reviewer would actually
decide about the Review(s) it produces (if any) -- "accept" applies the
proposed change to Current State via review_service.resolve_review(),
"keep" explicitly leaves Current State unchanged, and None means "don't
resolve anything yet" (used to model a Review sitting open across steps,
e.g. while the story is still unfolding).

Run with `python3 -m eval.run_sequences` (real-provider gated, same as the
rest of eval/ -- see eval/harness.py for the .env-loading convention).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass(frozen=True)
class Step:
    id: str
    content: str
    human_decision: Optional[str] = None  # "accept" | "keep" | None (leave pending)
    new_questions: Tuple[Tuple[str, str, bool], ...] = field(default_factory=tuple)
    expect_review: Optional[bool] = None  # None = no expectation asserted for this step
    narration: str = ""


@dataclass(frozen=True)
class Sequence:
    id: str
    title: str
    initial_state: Dict[str, Tuple[str, str]]
    steps: List[Step]
    initial_questions: Tuple[Tuple[str, str, bool], ...] = field(default_factory=tuple)


# --- Sequence 1: the doc's own example -----------------------------------
# Team proposes Okta -> client leans toward it -> formally approves it ->
# security finds a problem -> client pauses the decision -> team discusses
# Auth0 as an alternative.
OKTA_SEQUENCE = Sequence(
    id="okta_evolution",
    title="Okta proposal -> approval -> security problem -> pause -> alternative",
    initial_state={
        "k-sso": (
            "authentication",
            "No single sign-on provider has been selected yet; this remains an open "
            "implementation decision for the client integration.",
        ),
    },
    steps=[
        Step(
            id="1_team_proposes_okta",
            content="The team proposed Okta as the SSO provider in today's architecture review, as one option among a few.",
            human_decision=None,
            narration="A proposal, not a decision -- may or may not warrant a review, and if it does, should stay pending.",
        ),
        Step(
            id="2_client_leans_toward_okta",
            content="The client said in the kickoff call they're leaning toward Okta, but haven't formally signed off.",
            human_decision=None,
            narration="Still non-committal. Current State should not read as 'Okta approved' yet.",
        ),
        Step(
            id="3_client_formally_approves_okta",
            content="The client formally approved Okta as the SSO provider on today's call; it's confirmed.",
            human_decision="accept",
            expect_review=True,
            narration="A real decision. Should produce a review; accepting it should move Current State to 'Okta approved'.",
        ),
        Step(
            id="4_security_finds_a_problem",
            content="Security found that Okta's proposed integration path doesn't meet our SSO session-timeout requirements as configured.",
            human_decision="accept",
            expect_review=True,
            narration="This should put the just-accepted Okta decision at risk -- State needs to reflect the problem, not silently keep 'Okta approved' as if nothing happened.",
        ),
        Step(
            id="5_client_pauses_the_decision",
            content="The client paused the Okta decision pending a resolution to the session-timeout issue Security raised.",
            human_decision="accept",
            expect_review=True,
            narration="Explicit reversal of momentum. Current State should read as paused/unresolved again, not still 'approved'.",
        ),
        Step(
            id="6_team_discusses_auth0_alternative",
            content="The team started discussing Auth0 as a fallback SSO provider in case the Okta timeout issue can't be resolved quickly.",
            human_decision=None,
            narration="Another proposal-stage signal, mirroring step 1 -- should not silently become the new accepted answer.",
        ),
    ],
)


# --- Sequence 2: unresolved -> answered -> reversed -----------------------
QUESTION_REVERSAL_SEQUENCE = Sequence(
    id="question_unresolved_answered_reversed",
    title="Open Question -> answered by evidence -> reversed by later evidence",
    initial_state={
        "k-automation-scope": (
            "automation",
            "The pilot covers password-reset tickets only; other ticket types are out "
            "of scope for the first implementation.",
        ),
    },
    initial_questions=(
        ("q-refund-automation", "Will refund tickets ever be added to the automation pilot?", False),
    ),
    steps=[
        Step(
            id="1_leadership_answers_yes",
            content="Leadership confirmed refund tickets will be added to the automation pilot next quarter, answering the open question about pilot scope.",
            human_decision="accept",
            expect_review=True,
            narration="A direct, attributed answer to the open Question -- should produce a review and, once accepted, resolve the Question and update scope.",
        ),
        Step(
            id="2_finance_reverses_it",
            content="Finance flagged compliance concerns with automating refunds; leadership reversed course and refund tickets will NOT be added to the pilot after all.",
            human_decision="accept",
            expect_review=True,
            narration="A full reversal of the just-accepted scope expansion. This is the hardest case: does State catch a reversal of its own recently-accepted understanding, or treat the topic as already 'settled' and miss it?",
        ),
    ],
)


SEQUENCES = [OKTA_SEQUENCE, QUESTION_REVERSAL_SEQUENCE]
