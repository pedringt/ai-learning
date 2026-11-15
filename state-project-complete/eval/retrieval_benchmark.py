"""#653: does the record a question needs reach the Ask model? A deterministic retrieval benchmark (no model calls).

Ask narrows a project's records twice before the model sees them: `_compact_candidates` (recency windows) and
`_trim_candidates_for_query` (word matching). This module builds a synthetic project larger than every window, plus a
near-copy "twin" project for isolation, runs fixed cases through today's two functions unchanged (A0), and measures
the same cases under deterministic alternatives that exist only here (A1-A5). Nothing in the product changes.

Each case names the record ids it needs (`gold`), ids that must not appear (`forbidden`) and its family. The records
and queries are written for this benchmark, so a case's gold ids are true by construction, not a relevance judgment.

Results are measurements to inform Paige's decisions listed in #653; this module proposes nothing as product behavior.
"""
from __future__ import annotations

import json
import math
import re
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable, Iterable, Mapping
from unittest import mock

import ask_service
from ask_service import _compact_candidates, _trim_candidates_for_query

PROJECT = "bench_harbor"
TWIN = "bench_harbor_twin"
BUCKETS = ("state", "reviews", "questions", "answered_questions", "history", "evidence", "rules")
AUTHORITY = {
    "state": "governing_current_fact", "reviews": "qualifies_current_state", "questions": "known_unknown",
    "answered_questions": "answered_question", "history": "accepted_past_transition",
    "evidence": "supporting_or_event_evidence", "rules": "interpretation_guardrail",
}
# Today's per-type limits in _trim_candidates_for_query (state 12, plus Review-linked items up to 14).
TRIM_LIMITS = {"state": 12, "reviews": 6, "questions": 12, "answered_questions": 6, "history": 10, "evidence": 12}

_T0 = datetime(2026, 1, 5, 9, 0, 0)


def _at(hours: float) -> str:
    return (_T0 + timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")


# --------------------------------------------------------------------------------------------------------------------
# Fixture
# --------------------------------------------------------------------------------------------------------------------

# Current State. Filler topics sort before the key ones that must lose a zero-score tie (list_state orders by topic).
STATE = [
    ("s-agent-cohorts", "Agent training", "Agent training runs in two cohorts of twenty."),
    ("s-analytics", "Analytics", "Weekly portal analytics go to the operations channel."),
    ("s-billing", "Billing export", "Billing exports run nightly at 02:00 UTC."),
    ("s-browser", "Browser support", "The portal supports the two latest versions of each major browser."),
    ("s-budget", "Budget", "Budget approval rests with the finance director."),
    ("s-chat", "Chat widget", "The chat widget is limited to signed-in users."),
    ("s-content", "Content owner", "Help articles are maintained by the knowledge team."),
    ("s-dashboards", "Dashboards", "Supervisors see queue dashboards refreshed every five minutes."),
    ("s-escalation", "Escalation path", "Tier 2 handles anything Tier 1 cannot resolve in fifteen minutes."),
    ("s-feedback", "Feedback", "Customers rate each article with a thumbs up or down."),
    ("s-glossary", "Glossary", "Product names follow the published glossary."),
    ("s-identity", "Identity", "Single sign-on is mandatory for all external staff."),
    ("s-integrations", "Integrations", "Integrations are managed by the platform team."),
    ("s-languages", "Languages", "English and German ship first; French follows in the second wave."),
    ("s-mobile", "Mobile", "The mobile app is out of scope for phase one."),
    ("s-notifications", "Notifications", "Email notifications are batched hourly."),
    ("s-pilot-budget", "Pilot funding", "The pilot budget is $120,000."),
    ("s-pricing", "Pricing", "The starter tier costs $49 per month."),
    ("s-public-launch", "Public launch", "Public launch date is March 3."),
    ("s-residency", "Residency", "Customer records are stored in Frankfurt."),
    ("s-retention", "Support logs", "The vendor keeps support logs for 30 days."),
    ("s-search", "Search", "Portal search covers help articles and community threads."),
    ("s-staffing", "Staffing", "Two contractors cover weekend queues."),
    ("s-templates", "Templates", "Reply templates are reviewed quarterly."),
    ("s-uptime", "Uptime", "Uptime is reported monthly to the steering group."),
    ("s-volume", "Volume", "Expected contact volume is 4,000 tickets a month."),
    ("s-web-access", "Web accessibility", "Accessibility target is WCAG 2.1 AA."),
    ("s-workflow", "Workflow", "Agents triage in the shared queue before claiming tickets."),
    ("s-zones", "Zones", "Support hours follow the customer's local business day."),
    ("s-zz-archive", "Zz archive", "Closed tickets are archived after twelve months."),
]

# Open Reviews: (id, type, decision_question, why, created_hours, affected_state_ids, evidence_ids).
OPEN_REVIEWS = [
    ("r-retention", "proposed_update", "Should the vendor's support-log retention change from 30 to 90 days?",
     "A new vendor notice says logs are kept longer.", 2000, ["s-retention"], ["e-retention-notice"]),
    ("r-control", "proposed_update", "Should the conformance level move from 2.1 AA to 2.2 AA?",
     "The regulator's guidance was updated.", 2010, ["s-web-access"], []),
    ("r-glossary", "proposed_update", "Should the glossary add the new plan names?", "Sales renamed two plans.", 2020, ["s-glossary"], []),
    # No State links on r-notify or r-volume, so the control's linked State item always fits in the 2 slots the trim
    # adds after the 12 best matches (before #664 those were picked in hash order).
    ("r-notify", "state_at_risk", "Is hourly batching still accurate for notifications?", "An engineer mentioned real-time sends.", 2030, [], []),
    ("r-cohorts", "proposed_update", "Should training add a third cohort?", "Hiring grew.", 2040, ["s-agent-cohorts"], []),
    ("r-templates", "missing_understanding", "Who signs off reply templates each quarter?", "No owner is recorded.", 2050, [], []),
    ("r-volume", "proposed_update", "Should expected volume rise to 5,000 tickets?", "Forecast revised.", 2060, [], []),
    # Newest Review: loses today's zero-score tie for the 6 Review slots (oldest first).
    ("r-contract-sign", "proposed_update", "Should Current State record that the Corvo order form is signed?",
     "Signature closes procurement.", 2070, [], ["e-approved"]),
]

OPEN_QUESTIONS = [
    ("q-open-01", "Do we need a third training cohort?", True), ("q-open-02", "Which queue owns billing disputes?", False),
    ("q-open-03", "Should articles show an author?", False), ("q-open-04", "Is a status page in scope?", False),
    ("q-open-05", "How are refunds tracked in the portal?", False), ("q-open-06", "Will supervisors need exports?", False),
    ("q-open-07", "Who curates community threads?", False), ("q-open-08", "Are macros shared across teams?", False),
    ("q-open-09", "What is the fallback if chat is down?", False), ("q-open-10", "Do partners get portal accounts?", False),
    ("q-open-11", "How are duplicate tickets merged?", False), ("q-open-12", "Should ratings be anonymous?", False),
]

# Evidence: (id, content, submitted_hours, supersedes). Hours count up from Jan 5; newest first in list_evidence.
KEY_EVIDENCE = [
    # Old: beyond today's newest-24 window once the later notes exist.
    ("e-retention-terms", "Corvo's contract: support transcripts are deleted after 30 days.", 10, None),
    ("e-saml-cert", "The SAML signing certificate expires on June 30; IT owns the renewal.", 20, None),
    ("e-penalty", "Contract penalty clause: 5% service credit per hour of downtime beyond the SLA.", 30, None),
    ("e-sla-old", "Uptime commitment in the draft contract is 99.5%.", 40, None),
    ("e-trainer-old", "Vendor trainers deliver the onboarding sessions.", 50, None),
    ("e-mobile-answer", "Mobile stays out of scope for phase one; revisit after launch.", 60, None),
    # Recent: inside the window.
    ("e-launch-steering", "Steering group confirmed the public launch date of March 3.", 1500, None),
    ("e-sla-new", "Revised uptime commitment: 99.9%, replacing the earlier figure.", 1900, "e-sla-old"),
    ("e-trainer-new", "Change: our own team leads now deliver onboarding, not the vendor.", 1910, "e-trainer-old"),
    ("e-counsel", "Counsel signed off on the DPA on Oct 2.", 1920, None),
    ("e-design-review", "Design review of the dashboard mockups is on Thursday at 10.", 1930, None),
    ("e-retention-notice", "Corvo notice: support logs will be kept for 90 days from April.", 1940, None),
    ("e-approved", "Approved, go ahead.", 1950, None),
    ("e-marketing-budget", "Marketing budget for the campaign is $40,000.", 1960, None),
]

# Unrelated notes from other workstreams, spread between the old key notes and the recent ones.
_FILLER_TOPICS = [
    "Office move: the third-floor desks are reassigned to the finance team",
    "Newsletter draft circulated to the communications group",
    "Parking passes renewed for the contact-centre staff",
    "Coffee machine on level two is out of order again",
    "Hiring panel shortlisted four candidates for the Tier 2 role",
    "Brand team shared new icon sets for the help centre",
    "Printer queue reset after the firmware update",
    "Wellbeing sessions booked for the quarter",
    "Holiday rota posted for the December period",
    "Badge readers replaced at the north entrance",
    "Seating plan for the operations floor updated",
    "Expense tool migration finished for the support managers",
    "Team photo rescheduled because of rain",
    "Laptop refresh scheduled for the night shift",
    "Recycling bins added to the kitchen",
]
# A recent flood of keyword-heavy, irrelevant notes: they share "launch" and "date" with the launch question.
_FLOOD = [f"Launch party date poll #{n}: Friday or Saturday works for the social committee." for n in range(1, 16)]
_PARAPHRASE_DISTRACTOR = ("e-access-badges", "Access badges for visitors are printed at reception.", 1700, None)


def _evidence_rows() -> list[tuple[str, str, float, str | None]]:
    rows = list(KEY_EVIDENCE) + [_PARAPHRASE_DISTRACTOR]
    for n in range(45):                                   # 45 older filler notes between the old and recent keys
        topic = _FILLER_TOPICS[n % len(_FILLER_TOPICS)]
        rows.append((f"e-filler-{n:02d}", f"{topic} (note {n + 1}).", 100 + n * 30, None))
    for n, text in enumerate(_FLOOD):                     # the newest notes of all
        rows.append((f"e-flood-{n + 1:02d}", text, 2100 + n, None))
    return rows


# History: (id, state_item_id, old, new, decision_question, changed_hours). Newest first in list_history.
KEY_HISTORY = [
    ("h-launch", "s-public-launch", "Public launch date is February 10.", "Public launch date is March 3.",
     "Should the launch move to March 3 after the load-test delay?", 5),
    ("h-pricing", "s-pricing", "The starter tier costs $39 per month.", "The starter tier costs $49 per month.",
     "Should the starter tier price rise to $49?", 15),
    ("h-hosting", "s-residency", "Customer records are stored in Dublin.", "Customer records are stored in Frankfurt.",
     "Should hosting move to the Frankfurt region?", 1800),
]
_HISTORY_FILLER_STATE = ["s-agent-cohorts", "s-analytics", "s-billing", "s-browser", "s-chat", "s-content",
                         "s-dashboards", "s-feedback", "s-languages", "s-search", "s-templates", "s-workflow"]


def _history_rows() -> list[tuple[str, str, str, str, str, float]]:
    rows = list(KEY_HISTORY)
    for n in range(37):
        sid = _HISTORY_FILLER_STATE[n % len(_HISTORY_FILLER_STATE)]
        rows.append((f"h-filler-{n:02d}", sid, f"Earlier wording {n}.", f"Clarified wording {n}.",
                     f"Should the {sid[2:]} wording be clarified (pass {n})?", 100 + n * 40))
    return rows


# Answered Questions: (id, text, answer_evidence_id, created_hours); answered 2 hours after creation. Ask keeps the 30
# most recently answered (#664).
KEY_ANSWERED = [
    ("qa-trainer", "Who runs the onboarding sessions for agents?", "e-trainer-old", 1800),
    ("qa-mobile", "Is the mobile app in scope?", "e-mobile-answer", 1810),
    ("qa-control", "Is the knowledge base in English first?", None, 1820),
    ("qa-escalation-owner", "Who owns vendor escalations?", None, 1830),
    # Answered first of all 40, so outside the newest-30 window.
    ("qa-sandbox", "Will agents get a sandbox environment?", None, 1),
    ("qa-holiday-cover", "Is there holiday cover for the weekend queues?", None, 2),
    ("qa-refund-limit", "What refund amount can Tier 1 approve alone?", None, 3),
]
_ANSWER_TEXT = {
    "qa-control": "Yes, English ships first and German follows.",
    "qa-escalation-owner": "Escalations go to the account manager.",
    "qa-sandbox": "Yes, a sandbox is provisioned for each agent team.",
    "qa-holiday-cover": "Yes, two contractors rotate over the holidays.",
    "qa-refund-limit": "Tier 1 can refund up to $200 without a supervisor.",
}


def _answered_rows() -> list[tuple[str, str, str | None, float]]:
    rows = list(KEY_ANSWERED)
    for n in range(33):
        rows.append((f"qa-filler-{n:02d}", f"Was the {_FILLER_TOPICS[n % len(_FILLER_TOPICS)].split(':')[0].lower()} item closed (round {n})?", None, 100 + n * 50))
    return rows


TWIN_COPIES = {   # the twin project holds records worded exactly like the benchmark project's key records
    "state": ["s-public-launch", "s-identity", "s-pilot-budget"],
    "evidence": ["e-retention-terms", "e-saml-cert", "e-counsel", "e-launch-steering"],
}


def _insert_project(connection: Any, project_id: str, name: str) -> None:
    connection.execute("INSERT INTO projects(id, name) VALUES (?, ?)", (project_id, name))


def build_fixture(connection: Any) -> None:
    """Insert the benchmark project and its twin into an initialized database. Touches no other project."""
    _insert_project(connection, PROJECT, "Harbor portal rollout (retrieval benchmark)")
    _insert_project(connection, TWIN, "Harbor portal rollout twin (retrieval benchmark)")
    for sid, topic, statement in STATE:
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version, project_id, created_at) VALUES (?, ?, ?, 1, ?, ?)",
            (sid, topic, statement, PROJECT, _at(0)))

    evidence = _evidence_rows()
    extra_answers = {}
    for qid, text, eid, created in _answered_rows():
        if eid is None:                                      # every answered Question gets its own answer Evidence
            eid = f"e-answer-{qid}"
            extra_answers[qid] = eid
            evidence.append((eid, _ANSWER_TEXT.get(qid, f"Closed: {text}"), created + 1, None))
    for eid, content, hours, supersedes in sorted(evidence, key=lambda r: r[2]):
        connection.execute(
            "INSERT INTO evidence(id, content, source_type, processing_status, submitted_at, supersedes_evidence_id, project_id) "
            "VALUES (?, ?, 'manual_note', 'processed', ?, ?, ?)", (eid, content, _at(hours), supersedes, PROJECT))

    for rid, rtype, question, why, hours, state_ids, evidence_ids in OPEN_REVIEWS:
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status, created_at, project_id) "
            "VALUES (?, ?, ?, ?, 'open', ?, ?)", (rid, rtype, question, why, _at(hours), PROJECT))
        for sid in state_ids:
            connection.execute("INSERT INTO review_state_items(review_id, state_item_id) VALUES (?, ?)", (rid, sid))
        for eid in evidence_ids:
            connection.execute("INSERT INTO review_evidence(review_id, evidence_id) VALUES (?, ?)", (rid, eid))

    for qid, text, blocking in OPEN_QUESTIONS:
        connection.execute("INSERT INTO questions(id, text, status, blocking, created_at, project_id) VALUES (?, ?, 'open', ?, ?, ?)",
                           (qid, text, 1 if blocking else 0, _at(500), PROJECT))

    for hid, sid, old, new, question, hours in _history_rows():
        rid, pid = f"rv-{hid}", f"pc-{hid}"
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status, resolution, created_at, resolved_at, project_id) "
            "VALUES (?, 'proposed_update', ?, 'Accepted change.', 'resolved', 'updated', ?, ?, ?)", (rid, question, _at(hours - 1), _at(hours), PROJECT))
        connection.execute(
            "INSERT INTO proposed_state_changes(id, review_id, state_item_id, proposed_statement, rationale, expected_state_version, status, created_at, decided_at) "
            "VALUES (?, ?, ?, ?, 'Benchmark history.', 1, 'accepted', ?, ?)", (pid, rid, sid, new, _at(hours - 1), _at(hours)))
        connection.execute(
            "INSERT INTO history_transitions(id, state_item_id, proposed_change_id, transition_type, old_statement, new_statement, from_version, to_version, changed_at) "
            "VALUES (?, ?, ?, 'updated', ?, ?, 1, 2, ?)", (hid, sid, pid, old, new, _at(hours)))

    for qid, text, eid, created in _answered_rows():
        eid = eid or extra_answers[qid]
        rid = f"rv-{qid}"
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status, resolution, created_at, resolved_at, project_id) "
            "VALUES (?, 'open_question', ?, 'Answers a Question.', 'resolved', 'confirmed_current', ?, ?, ?)",
            (rid, f"Does this answer: {text}", _at(created + 1), _at(created + 2), PROJECT))
        connection.execute("INSERT INTO review_evidence(review_id, evidence_id) VALUES (?, ?)", (rid, eid))
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking, created_at, resolved_at, resolution, source_evidence_id, project_id) "
            "VALUES (?, ?, 'resolved', 0, ?, ?, 'answered', ?, ?)", (qid, text, _at(created), _at(created + 2), eid, PROJECT))
        connection.execute("INSERT INTO review_questions(review_id, question_id, evidence_id) VALUES (?, ?, ?)", (rid, qid, eid))

    for n, text in enumerate(["Never treat a pending Review as Current State.", "Name the vendor when citing contract terms."]):
        connection.execute("INSERT INTO project_rules(id, statement, rationale, status, created_at, project_id) VALUES (?, ?, 'Interpretation', 'active', ?, ?)",
                           (f"rule-{n}", text, _at(0), PROJECT))

    state_by_id = {sid: (topic, statement) for sid, topic, statement in STATE}
    evidence_by_id = {r[0]: r for r in KEY_EVIDENCE}
    for sid in TWIN_COPIES["state"]:
        topic, statement = state_by_id[sid]
        connection.execute("INSERT INTO current_state_items(id, topic, statement, version, project_id) VALUES (?, ?, ?, 1, ?)",
                           (f"twin-{sid}", topic, statement, TWIN))
    for eid in TWIN_COPIES["evidence"]:
        _, content, hours, _ = evidence_by_id[eid]
        connection.execute("INSERT INTO evidence(id, content, source_type, processing_status, submitted_at, project_id) VALUES (?, ?, 'manual_note', 'processed', ?, ?)",
                           (f"twin-{eid}", content, _at(hours + 5000), TWIN))       # newest anywhere, if isolation failed
    connection.commit()


# --------------------------------------------------------------------------------------------------------------------
# Cases
# --------------------------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Case:
    id: str
    family: str
    query: str
    gold: tuple[str, ...] = ()
    forbidden: tuple[str, ...] = ()
    variant: str = ""
    # (record id, bucket it must stay in): a pending or answered record must keep its own type and authority.
    authority_expectation: tuple[tuple[str, str], ...] = ()
    expected_hit_today: bool = False     # a control: today's code should already succeed


FAMILIES = {
    "windows": "1. Older relevant record excluded by the windows",
    "paraphrase": "2. Paraphrase missed by word matching",
    "links": "3. Linked context needed to read a record",
    "answered": "4. Relevant answered Question beyond its window",
    "no_answer": "Negative: no record covers the question",
    "same_word": "Negative: same word, different topic",
    "superseded": "Negative: superseded record",
    "authority": "Negative: pending vs accepted on one topic",
    "flood": "Negative: a recent keyword flood",
}

CASES: tuple[Case, ...] = (
    Case("w1", "windows", "What are Corvo's deletion terms for transcripts?", ("e-retention-terms",), variant="old evidence"),
    Case("w2", "windows", "When does the SAML signing certificate expire?", ("e-saml-cert",), variant="old evidence"),
    Case("w3", "windows", "What penalty applies for downtime beyond the SLA?", ("e-penalty",), variant="old evidence"),
    Case("w4", "windows", "Why did the launch move to March 3?", ("h-launch",), variant="old history"),
    Case("w5", "windows", "Why did the starter tier price rise?", ("h-pricing",), variant="old history"),

    Case("p1", "paraphrase", "When do customers get access?", ("s-public-launch",), variant="synonym"),
    Case("p2", "paraphrase", "What's the go-live?", ("s-public-launch",), variant="synonym"),
    Case("p3", "paraphrase", "Who has to approve spending?", ("s-budget",), variant="word form (approve/approval)"),
    Case("p4", "paraphrase", "Who manages integration work?", ("s-integrations",), variant="word form caught by substring",
         expected_hit_today=True),
    Case("p5", "paraphrase", "Is SSO required for contractors?", ("s-identity",), variant="acronym"),
    Case("p6", "paraphrase", "What did Legal say about the data processing agreement?", ("e-counsel",), variant="person or role"),

    Case("l1", "links", "What was approved?", ("e-approved", "r-contract-sign"), variant="Evidence needs its Review"),
    Case("l2", "links", "Why did hosting move to another region?", ("h-hosting", "s-residency"), variant="History needs its State item"),
    Case("l3", "links", "What uptime commitment did we agree?", ("e-sla-new", "e-sla-old"), variant="superseding Evidence needs the older note"),
    Case("l4", "links", "Who runs the onboarding sessions for agents?", ("qa-trainer", "e-trainer-new"),
         variant="answered Question whose answer was superseded"),
    Case("l5", "links", "Is the conformance level changing?", ("r-control", "s-web-access"), variant="control: Review pulls in its State item",
         expected_hit_today=True),

    Case("a1", "answered", "Will agents get a sandbox environment?", ("qa-sandbox",), variant="newest answered Question"),
    Case("a2", "answered", "Is there holiday cover for the weekend queues?", ("qa-holiday-cover",), variant="newest answered Question"),
    Case("a3", "answered", "What refund amount can Tier 1 approve alone?", ("qa-refund-limit",), variant="newest answered Question"),
    Case("a4", "answered", "Who handles problems with the supplier?", ("qa-escalation-owner",), variant="no shared word"),
    Case("a5", "answered", "Is the knowledge base in English first?", ("qa-control",), variant="control: in window, shared words",
         expected_hit_today=True),

    Case("n1", "no_answer", "What is the cafeteria policy for pets?"),
    Case("n2", "no_answer", "Which satellite provider covers the ships?"),
    Case("n3", "no_answer", "How many parking spaces does the lab have reserved?"),

    Case("sw1", "same_word", "What is the pilot budget?", ("s-pilot-budget",), ("e-marketing-budget",)),
    Case("sw2", "same_word", "What is the marketing budget?", ("e-marketing-budget",), ("s-pilot-budget",)),
    Case("sw3", "same_word", "When is the design review?", ("e-design-review",)),

    Case("sp1", "superseded", "Is the uptime commitment 99.5%?", ("e-sla-old", "e-sla-new"), variant="old wording asked"),

    Case("au1", "authority", "How long does the vendor keep support logs?", ("s-retention", "r-retention"),
         authority_expectation=(("s-retention", "state"), ("r-retention", "reviews"))),
    Case("au2", "authority", "Is the mobile app in scope?", ("qa-mobile", "s-mobile"),
         authority_expectation=(("qa-mobile", "answered_questions"), ("s-mobile", "state"))),

    Case("f1", "flood", "What is the launch date?", ("e-launch-steering", "s-public-launch"), variant="15 newer notes share 'launch' and 'date'"),
)


# --------------------------------------------------------------------------------------------------------------------
# Retrieval variants (benchmark-only; today's functions are called unchanged for A0)
# --------------------------------------------------------------------------------------------------------------------

class _Window(list):
    """A list whose slices are widened by `factor` (None = never cut), so _compact_candidates keeps its exact record
    shapes while the benchmark varies only its recency windows."""

    def __init__(self, items: Iterable, factor: float | None):
        super().__init__(items)
        self.factor = factor

    def __getitem__(self, index):
        if isinstance(index, slice) and index.stop is not None and index.start is None:
            stop = None if self.factor is None else int(index.stop * self.factor)
            return list.__getitem__(self, slice(None, stop, index.step))
        return list.__getitem__(self, index)


@contextmanager
def _widened_windows(factor: float | None):
    originals = {name: getattr(ask_service, name) for name in ("list_history", "list_evidence", "list_questions")}

    def wrap(fn):
        def windowed(*args, **kwargs):
            # A window given as a SQL limit (answered Questions, #664) is scaled the same way as a slice.
            if kwargs.get("limit") is not None:
                kwargs["limit"] = 10 ** 9 if factor is None else int(kwargs["limit"] * factor)
            return _Window(fn(*args, **kwargs), factor)
        return windowed
    with mock.patch.multiple(ask_service, **{name: wrap(fn) for name, fn in originals.items()}):
        yield


def pool(connection: Any, window_factor: float | None = 1) -> dict[str, list[dict]]:
    """The candidates before trimming: today's `_compact_candidates`, with its windows scaled (1 = today)."""
    if window_factor == 1:
        return _compact_candidates(connection)
    with _widened_windows(window_factor):
        return _compact_candidates(connection)


_STOP = {"the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "me", "my", "we", "our", "this", "that", "what",
         "is", "are", "be", "with", "about", "prep", "prepare", "meeting",
         # added for A3/A4 only: question words that carry no topic
         "who", "why", "when", "how", "does", "did", "was", "were", "has", "have", "get", "can", "will", "which", "there",
         "any", "its", "it", "do", "say", "all", "out", "not", "by", "at", "from", "after", "before"}
_MEANING_FIELDS = ("topic", "statement", "decision_question", "why_consequential", "text", "content", "new_statement",
                   "old_statement", "answer", "blocks")


def _stem(word: str) -> str:
    for suffix in ("ations", "ation", "ings", "ing", "ers", "er", "ies", "ied", "es", "ed", "al", "s", "e"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def _tokens(text: str) -> list[str]:
    return [_stem(t) for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 1 and t not in _STOP]


def _record_tokens(record: Mapping[str, Any]) -> list[str]:
    return _tokens(" ".join(str(record.get(k) or "") for k in _MEANING_FIELDS))


def _rank_and_limit(query: str, candidates: Mapping[str, list[dict]], score: Callable[[set[str], Mapping], float],
                    limits: Mapping[str, int], terms: set[str] | None = None) -> dict[str, list[dict]]:
    """Same structure as today's trim (per-type limits, a Review's State items pulled in, answered Questions only when
    they score), with a different scoring function."""
    terms = set(_tokens(query)) if terms is None else terms

    def ranked(bucket: str, limit: int) -> list[dict]:
        scored = [(score(terms, r) + (1e-3 if bucket == "questions" and r.get("blocking") else 0), -i, r)
                  for i, r in enumerate(candidates[bucket])]
        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return [x[2] for x in scored[:limit]], {id(x[2]): x[0] for x in scored}

    reviews, _ = ranked("reviews", limits["reviews"])
    state, _ = ranked("state", limits["state"])
    state_by_id = {x["id"]: x for x in candidates["state"]}
    for sid in {sid for r in reviews for sid in r.get("affected_state_ids", [])}:
        if sid in state_by_id and sid not in {x["id"] for x in state}:
            state.append(state_by_id[sid])
    answered, scores = ranked("answered_questions", limits["answered_questions"])
    return {
        "state": state[: limits["state"] + 2], "reviews": reviews, "questions": ranked("questions", limits["questions"])[0],
        "answered_questions": [x for x in answered if scores[id(x)] > 0],
        "history": ranked("history", limits["history"])[0], "evidence": ranked("evidence", limits["evidence"])[0],
        "rules": list(candidates["rules"]),
    }


def stemmed_trim(query: str, candidates: Mapping[str, list[dict]], limits: Mapping[str, int] = TRIM_LIMITS) -> dict:
    """A3: lowercase + simple stemming, matched on whole tokens of the fields that carry meaning."""
    return _rank_and_limit(query, candidates, lambda terms, r: 3.0 * len(terms & set(_record_tokens(r))), limits)


def bm25_trim(query: str, candidates: Mapping[str, list[dict]], limits: Mapping[str, int] = TRIM_LIMITS,
              k1: float = 1.2, b: float = 0.75) -> dict:
    """A4: BM25 over every candidate record (pure Python), with today's per-type limits."""
    docs = [_record_tokens(r) for bucket in BUCKETS if bucket != "rules" for r in candidates[bucket]]
    n = len(docs) or 1
    avg = sum(len(d) for d in docs) / n or 1
    df: dict[str, int] = {}
    for d in docs:
        for t in set(d):
            df[t] = df.get(t, 0) + 1

    def score(terms: set[str], record: Mapping) -> float:
        toks = _record_tokens(record)
        total = 0.0
        for t in terms:
            tf = toks.count(t)
            if tf:
                idf = math.log(1 + (n - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
                total += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len(toks) / avg))
        return total
    return _rank_and_limit(query, candidates, score, limits)


_TODAY_STOP = {"the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "me", "my", "we", "our", "this", "that",
               "what", "is", "are", "be", "with", "about", "prep", "prepare", "meeting"}


def _today_terms(query: str) -> set[str]:
    terms = {t for t in re.findall(r"[a-z0-9]+", query.lower()) if len(t) > 2 and t not in _TODAY_STOP}
    if "security" in terms:
        terms |= {"retention", "access", "pilot", "risk", "launch", "data", "vendor", "approval"}
    return terms


def _today_body(record: Mapping) -> str:
    return " ".join(str(v) for k, v in record.items() if k != "authority" and not isinstance(v, (list, dict))).lower()


def _today_score(terms: set[str], record: Mapping) -> float:
    """Today's scoring (substring match on every scalar field, 3 per term), mirrored for the limit sweep and the
    diagnostics only; A0 calls the real function."""
    body = _today_body(record)
    return float(sum(3 for t in terms if t in body))


def link_graph(connection: Any) -> dict[str, list[str]]:
    """The links #653 lists, one direction each (a record -> what is needed to read it):
    Review -> its Evidence, State items and Questions; Evidence -> the Reviews citing it and its superseded/superseding
    Evidence; History -> its State item and its Review; answered Question -> its answer Evidence and resolving Review.
    Current State links to nothing: a State item does not need its whole History to be read."""
    edges: dict[str, list[str]] = {}

    def link(a: str, b: str) -> None:
        edges.setdefault(a, [])
        if b not in edges[a]:
            edges[a].append(b)
    def q(sql: str, params: tuple) -> list[tuple]:      # db.Row iterates over column names, so read by index
        return [tuple(row[i] for i in range(len(row.keys()))) for row in connection.execute(sql, params).fetchall()]
    for rid, eid in q("SELECT re.review_id, re.evidence_id FROM review_evidence re JOIN review_issues r ON r.id=re.review_id "
                      "WHERE r.project_id=? ORDER BY 1, 2", (PROJECT,)):
        link(rid, eid)
        link(eid, rid)
    for rid, sid in q("SELECT rs.review_id, rs.state_item_id FROM review_state_items rs JOIN review_issues r ON r.id=rs.review_id "
                      "WHERE r.project_id=? ORDER BY 1, 2", (PROJECT,)):
        link(rid, sid)
    for rid, qid in q("SELECT rq.review_id, rq.question_id FROM review_questions rq JOIN review_issues r ON r.id=rq.review_id "
                      "WHERE r.project_id=? ORDER BY 1, 2", (PROJECT,)):
        link(rid, qid)
        link(qid, rid)
    for hid, sid, rid in q("SELECT h.id, h.state_item_id, p.review_id FROM history_transitions h JOIN proposed_state_changes p "
                           "ON p.id=h.proposed_change_id JOIN review_issues r ON r.id=p.review_id WHERE r.project_id=? ORDER BY 1",
                           (PROJECT,)):
        link(hid, sid)
        link(hid, rid)
    for eid, old in q("SELECT id, supersedes_evidence_id FROM evidence WHERE project_id=? AND supersedes_evidence_id IS NOT NULL "
                      "ORDER BY 1", (PROJECT,)):
        link(eid, old)
        link(old, eid)
    for qid, eid in q("SELECT id, source_evidence_id FROM questions WHERE project_id=? AND source_evidence_id IS NOT NULL ORDER BY 1",
                      (PROJECT,)):
        link(qid, eid)
    return edges


_EXPAND_ORDER = ("evidence", "answered_questions", "history", "reviews", "questions")


def expand_links(selected: Mapping[str, list[dict]], full: Mapping[str, list[dict]], edges: Mapping[str, list[str]],
                 cap: int = 10) -> tuple[dict[str, list[dict]], list[str]]:
    """A5: add the records the selected ones link to (see link_graph), drawn from the whole project's candidates, then
    the supersession chain of any Evidence added. A link through a record Ask never receives (a resolved Review) is
    followed one hop further to that record's Evidence. Capped; returns the added ids too."""
    where = {r["id"]: (bucket, r) for bucket in BUCKETS for r in full[bucket]}
    out = {k: list(v) for k, v in selected.items()}
    have = {r["id"] for v in out.values() for r in v}
    added: list[str] = []

    def add(rid: str) -> None:
        if rid in have or rid not in where or len(added) >= cap:
            return
        bucket, record = where[rid]
        out[bucket].append(record)
        have.add(rid)
        added.append(rid)

    def targets(rid: str) -> list[str]:
        found = []
        for neighbour in edges.get(rid, ()):
            if neighbour in where:
                found.append(neighbour)
            else:                                   # e.g. a resolved Review: not a candidate, but its Evidence is
                found += [e for e in edges.get(neighbour, ()) if e != rid and where.get(e, ("",))[0] == "evidence"]
        return found
    for rid in [r["id"] for bucket in _EXPAND_ORDER for r in selected[bucket]]:
        for target in targets(rid):
            add(target)
            if where.get(target, ("",))[0] == "evidence":
                for other in edges.get(target, ()):
                    if where.get(other, ("",))[0] == "evidence":
                        add(other)
    return out, added


@dataclass(frozen=True)
class Variant:
    id: str
    label: str
    window_factor: float | None = 1
    trim: Callable[[str, Mapping], dict] = _trim_candidates_for_query
    links: bool = False


VARIANTS: tuple[Variant, ...] = (
    Variant("A0", "Today: windows + word matching"),
    Variant("A1", "No windows + today's word matching", window_factor=None),
    Variant("A2x2", "Windows x2 + today's word matching", window_factor=2),
    Variant("A2x4", "Windows x4 + today's word matching", window_factor=4),
    Variant("A3", "Today's windows + stemmed token matching", trim=stemmed_trim),
    Variant("A1+A3", "No windows + stemmed token matching", window_factor=None, trim=stemmed_trim),
    Variant("A4", "No windows + BM25", window_factor=None, trim=bm25_trim),
    Variant("A0+A5", "Today + link expansion", links=True),
    Variant("A4+A5", "No windows + BM25 + link expansion", window_factor=None, trim=bm25_trim, links=True),
)
SKIPPED_VARIANTS = {
    "A6": "Date-aware filtering: no case's query names a date range, so there is nothing to measure yet.",
    "A7": "Project alias list: not run; it would be hand-written to fit these same cases, so its recall says little.",
}


# --------------------------------------------------------------------------------------------------------------------
# Metrics
# --------------------------------------------------------------------------------------------------------------------

def _ids(candidates: Mapping[str, list[dict]]) -> set[str]:
    return {r["id"] for bucket in BUCKETS for r in candidates.get(bucket, [])}


def _chars(candidates: Mapping[str, list[dict]]) -> int:
    return len(json.dumps(candidates, ensure_ascii=False, default=str))


def _record_chars(candidates: Mapping[str, list[dict]], ids: set[str]) -> int:
    return sum(len(json.dumps(r, ensure_ascii=False, default=str)) for b in BUCKETS for r in candidates.get(b, []) if r["id"] in ids)


def _authority_ok(candidates: Mapping[str, list[dict]]) -> bool:
    return all(r.get("authority") == AUTHORITY[b] for b in BUCKETS for r in candidates.get(b, []))


def run_case(connection: Any, case: Case, variant: Variant, edges: Mapping[str, list[str]], full: Mapping[str, list[dict]]) -> dict:
    connection.project_id = PROJECT
    stage_pool = pool(connection, variant.window_factor)
    trimmed = variant.trim(case.query, stage_pool)
    stages = {"windows": stage_pool, "trim": trimmed}
    added: list[str] = []
    if variant.links:
        stages["links"], added = expand_links(trimmed, full, edges)
    final = stages["links" if variant.links else "trim"]
    final_ids = _ids(final)

    gold = set(case.gold)
    lost_at = {}
    for gid in case.gold:
        for name, cands in stages.items():
            if gid not in _ids(cands):
                lost_at[gid] = name
                break
    twin_ids = sorted(i for i in final_ids | _ids(stage_pool) if i.startswith("twin-"))
    authority_buckets_ok = all(rid in {r["id"] for r in final.get(bucket, [])} or rid not in final_ids
                               for rid, bucket in case.authority_expectation)
    gold_present = gold & final_ids
    forbidden_present = sorted(set(case.forbidden) & final_ids)
    # Diagnostic: the query words (today's rule: substring match on any scalar field) each found gold record shares.
    # A found record with none was kept only by a tie (Current State ties keep the alphabetically first topics).
    terms = _today_terms(case.query)
    full_by_id = {r["id"]: r for b in BUCKETS for r in full[b]}
    matched_terms = {gid: sorted(t for t in terms if t in _today_body(full_by_id[gid])) for gid in sorted(gold_present) if gid in full_by_id}
    return {
        "case": case.id, "family": case.family, "variant": variant.id,
        "recall": {name: (len(gold & _ids(c)) / len(gold) if gold else None) for name, c in stages.items()},
        "gold_found": sorted(gold_present), "lost_at": lost_at, "gold_matched_terms_today": matched_terms,
        "candidate_counts": {b: len(final.get(b, [])) for b in BUCKETS},
        "candidates_total": sum(len(final.get(b, [])) for b in BUCKETS),
        "context_chars": _chars(final),
        "context_tokens_estimate": round(_chars(final) / 4),
        "link_added": added, "link_added_chars": _record_chars(final, set(added)),
        "forbidden_present": forbidden_present,
        "distractor_share": (_record_chars(final, set(forbidden_present)) / _chars(final)) if forbidden_present else 0.0,
        "isolation_violations": twin_ids,
        "authority_preserved": _authority_ok(final) and authority_buckets_ok,
        "superseding_present": ("e-sla-new" in final_ids) if case.family == "superseded" else None,
    }


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None


def summarize(rows: list[dict]) -> dict:
    by_variant: dict[str, dict] = {}
    for vid in dict.fromkeys(r["variant"] for r in rows):
        vrows = [r for r in rows if r["variant"] == vid]
        scored = [r for r in vrows if r["recall"]["windows"] is not None]
        families = {}
        for fam in FAMILIES:
            frows = [r for r in scored if r["family"] == fam]
            if not frows:
                continue
            families[fam] = {stage: _mean([r["recall"][stage] for r in frows if stage in r["recall"]])
                             for stage in ("windows", "trim", "links") if stage in frows[0]["recall"]}
        lost = {}
        for r in scored:
            for stage in r["lost_at"].values():
                lost[stage] = lost.get(stage, 0) + 1
        final_stage = "links" if "links" in vrows[0]["recall"] else "trim"
        by_variant[vid] = {
            "recall_final": _mean([r["recall"][final_stage] for r in scored]),
            "recall_by_family": families,
            "gold_lost_at": lost,
            "mean_candidates": _mean([r["candidates_total"] for r in vrows]),
            "mean_context_chars": _mean([r["context_chars"] for r in vrows]),
            "mean_context_tokens_estimate": _mean([r["context_tokens_estimate"] for r in vrows]),
            "no_answer_mean_chars": _mean([r["context_chars"] for r in vrows if r["family"] == "no_answer"]),
            "forbidden_surviving": sum(len(r["forbidden_present"]) for r in vrows),
            "isolation_violations": sum(len(r["isolation_violations"]) for r in vrows),
            "authority_preserved_share": _mean([1.0 if r["authority_preserved"] else 0.0 for r in vrows]),
            "mean_link_added": _mean([len(r["link_added"]) for r in vrows]),
            "mean_link_added_chars": _mean([r["link_added_chars"] for r in vrows]),
        }
    return by_variant


def budget_sweep(connection: Any, scales: Iterable[float] = (0.5, 1, 1.5, 2, 3)) -> list[dict]:
    """Recall vs context size as the per-type limits grow, with no recency windows (today's scoring, mirrored)."""
    connection.project_id = PROJECT
    full = pool(connection, None)
    out = []
    for scale in scales:
        limits = {k: max(1, round(v * scale)) for k, v in TRIM_LIMITS.items()}
        recalls, sizes = [], []
        for case in CASES:
            trimmed = _rank_and_limit(case.query, full, _today_score, limits, _today_terms(case.query))
            sizes.append(_chars(trimmed))
            if case.gold:
                recalls.append(len(set(case.gold) & _ids(trimmed)) / len(case.gold))
        out.append({"limit_scale": scale, "recall": _mean(recalls), "mean_context_chars": _mean(sizes)})
    return out


def run(connection: Any, variants: Iterable[Variant] = VARIANTS) -> dict:
    """Run every case under every variant against a database that already holds `build_fixture`'s records."""
    connection.project_id = PROJECT
    edges = link_graph(connection)
    full = pool(connection, None)
    rows = [run_case(connection, case, variant, edges, full) for variant in variants for case in CASES]
    return {
        "issue": 653,
        "cases": len(CASES),
        "cases_per_family": {f: sum(1 for c in CASES if c.family == f) for f in FAMILIES},
        "record_counts": {b: len(full[b]) for b in BUCKETS},
        "today_windows": {"history": 18, "evidence": 24, "answered_questions": 30},
        "summary": summarize(rows),
        "budget_sweep_no_windows": budget_sweep(connection),
        "skipped_variants": SKIPPED_VARIANTS,
        "rows": rows,
        "notes": [
            "Fixed in #664: Review-linked State items were appended from a set (hash-seed dependent), and the answered-"
            "Question window kept the 30 oldest. The answered-Question cases were re-dated for the newest-30 window, so "
            "family 4 results from before #664 are not comparable.",
            "Context size is the serialized candidate JSON; tokens are chars/4, an estimate (no tokenizer, no model).",
            "ask_cache_key hashes the windowed candidates and relies on list_history/list_evidence being newest-first; "
            "any retrieval change must reassess cache invalidation, including edits to older records that become retrievable.",
        ],
    }


def format_table(result: Mapping[str, Any]) -> str:
    fams = [f for f in FAMILIES if f not in ("no_answer",)]
    head = ["variant", "recall"] + [f[:9] for f in fams] + ["cands", "chars", "~tok", "forbid", "isol", "auth"]
    lines = ["  ".join(f"{h:>9}" for h in head)]
    for vid, s in result["summary"].items():
        final = "links" if vid.endswith("A5") else "trim"
        cells = [vid, s["recall_final"]] + [s["recall_by_family"].get(f, {}).get(final) for f in fams] + [
            s["mean_candidates"], s["mean_context_chars"], s["mean_context_tokens_estimate"], s["forbidden_surviving"],
            s["isolation_violations"], s["authority_preserved_share"]]
        lines.append("  ".join(f"{'' if c is None else c:>9}" for c in cells))
    return "\n".join(lines)
