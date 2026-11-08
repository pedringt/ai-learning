"""#640 Option B (draft, not wired into Ask): scope, record identity, answer checks and record-built answers.
Deterministic; no model calls (Paige, Nov 7)."""
import json
from pathlib import Path

import pytest

from eval.ask_quality_scenarios import SCENARIOS
from question_status import (
    STATUS_WORDS, apply, check_answer, clarification_answer, identity_terms, match_question, normalize,
    record_built_answer, request_scope,
)

VENDOR = {"id": "vend", "text": "Does the vendor retain customer content after the contract ends?", "status": "resolved",
          "answer": "Legal confirmed the vendor deletes customer content within 30 days of contract end."}
PRIV = {"id": "priv", "text": "Which privileged password resets qualify for automation?", "status": "open"}
STD = {"id": "std", "text": "When will standard password-reset automation launch?", "status": "open"}
BUDGET = {"id": "budget", "text": "What is the approved pilot budget?", "status": "open"}
QUESTIONS = [VENDOR, PRIV, STD, BUDGET]


# ------------------------------------------------------------------ normalization

@pytest.mark.parametrize("word", ["retention", "retain", "retains", "retained", "retaining", "retentions"])
def test_retention_and_retain_normalize_to_the_same_word(word):
    assert normalize(word) == "retain"


def test_scope_words_stay_distinct_and_status_words_never_name_a_question():
    assert normalize("privileged") != normalize("standard")
    assert identity_terms("Was the privileged reset question answered or still open?") == {"privileg", "reset"}
    assert not identity_terms(" ".join(sorted(STATUS_WORDS)))


# ------------------------------------------------------------------ request scope

@pytest.mark.parametrize("request_text,asks", [
    ("Was the vendor-retention question answered?", "answered"),
    ("Is the vendor-retention question still unanswered?", "open"),
    ("Has Legal answered how long the vendor retains customer content?", "answered"),
    ("Is the question about vendor data retention resolved?", "answered"),
    ("Is the standard password-reset automation question still open?", "open"),
])
def test_explicit_question_status_requests_are_in_scope(request_text, asks):
    scope = request_scope(request_text)
    assert scope.in_scope and scope.asks == asks


@pytest.mark.parametrize("request_text", [
    "Is the budget settled?",                                   # no Question reference: normal Ask
    "Is the pilot budget approved?",
    "Is the recorded answer on vendor retention still accurate?",  # content/validity, not resolution status
    "What did Legal say about vendor retention?",
    "What was the answer to the vendor-retention question?",
    "Why was the vendor-retention question closed?",
    "What changed about Slack?",
])
def test_other_requests_are_not_in_scope(request_text):
    assert not request_scope(request_text).in_scope


# ------------------------------------------------------------------ record identity

@pytest.mark.parametrize("request_text", [
    "Was the vendor-retention question answered?",               # the #640 scenario's own wording, unchanged
    "Has Legal answered how long the vendor retains customer content?",
    "Is the question about whether the vendor retains customer content resolved?",
    "Was the vendor's content retention question answered?",
    "Is the question about the vendor keeping customer data answered?",
])
def test_paraphrases_of_the_vendor_question_match_it(request_text):
    match = match_question(request_text, QUESTIONS)
    assert match.kind == "matched" and match.question["id"] == "vend", match.reason


def test_scope_words_pick_the_right_password_question():
    assert match_question("Is the privileged password reset question answered?", QUESTIONS).question["id"] == "priv"
    assert match_question("Is the standard password-reset automation question still open?", QUESTIONS).question["id"] == "std"


def test_a_tie_between_scopes_asks_which_question():
    match = match_question("Is the password reset question answered?", QUESTIONS)
    assert match.kind == "clarify" and {q["id"] for q in match.candidates} >= {"priv", "std"}


def test_a_conflicting_scope_word_asks_even_when_one_candidate_scores_higher():
    a = {"id": "a", "text": "Which privileged password resets qualify for automation?"}
    b = {"id": "b", "text": "Will standard resets launch?"}
    match = match_question("Is the question on which standard password resets qualify for automation answered?", [a, b])
    assert match.kind == "clarify" and "standard" in match.reason


@pytest.mark.parametrize("request_text", [
    "Is the vendor question answered?",                # a single shared word is a weak match
    "Is the budget question answered?",
    "Was the customer question resolved?",
])
def test_weak_and_misleading_near_matches_ask_instead_of_guessing(request_text):
    assert match_question(request_text, QUESTIONS).kind == "clarify"


def test_no_shared_word_means_no_match():
    assert match_question("Was the question about the moon landing answered?", QUESTIONS).kind == "none"


def test_the_640_scenario_wording_and_expectation_are_unchanged():
    scenario = next(s for s in SCENARIOS if s.id == "ask_question_answer_no_state_mutation")
    assert scenario.question == "Was the vendor-retention question answered?"
    assert scenario.required_facts == (("answered", "resolved"), "30 days", "under review")
    q = {"id": "ask-closed-question-0", "text": scenario.closed_questions[0][0], "status": "resolved",
         "answer": scenario.closed_questions[0][1]}
    assert match_question(scenario.question, [q]).kind == "matched"


# ------------------------------------------------------------------ answer checks and fallbacks

def _answer(headline, summary, record_id="vend", record_type="answered_question"):
    return {"headline": headline, "summary": summary,
            "sections": [{"kind": "questions", "title": "Q", "items": [{"text": "t", "record_type": record_type, "record_id": record_id, "detail": None}]}]}


GOOD_BODY = "The Question is closed. Legal confirmed the vendor deletes customer content within 30 days of contract end."
ANSWERED, OPEN = request_scope("Was the vendor-retention question answered?"), request_scope("Is the vendor-retention question still unanswered?")


def test_a_correct_yes_is_correct_but_not_the_preferred_format():
    check = check_answer(ANSWERED, VENDOR, _answer("Yes, Legal answered the retention question.", GOOD_BODY))
    assert check.raw_headline_correct and not check.preferred_format and check.fallback == "none"


def test_a_factual_headline_is_correct_and_preferred():
    check = check_answer(ANSWERED, VENDOR, _answer("Legal answered the retention question: deleted within 30 days.", GOOD_BODY))
    assert check.raw_headline_correct and check.preferred_format


def test_negative_polarity_no_is_correct_and_yes_is_wrong():
    assert check_answer(OPEN, VENDOR, _answer("No, Legal answered it.", GOOD_BODY)).raw_headline_correct
    assert not check_answer(OPEN, VENDOR, _answer("Yes, it is still unanswered.", GOOD_BODY)).raw_headline_correct


@pytest.mark.parametrize("headline,correct", [
    # Real Nov 7 Step 1 headlines for "Is the vendor-retention question still unanswered?" (resolved record).
    ("Not fully: the vendor-retention question is answered, but the vendor contract itself remains under review.", False),
    ("Not yet fully answered: vendor retention has a Legal answer on record, but the vendor contract remains under review.", False),
    ("Yes — the vendor-retention question is closed, but its answer is not yet a Current State change.", False),
    ("Not in the sense of an unanswered question: the vendor retention question was answered (recorded answer below).", True),
])
def test_negative_polarity_headlines_from_the_saved_runs(headline, correct):
    assert check_answer(OPEN, VENDOR, _answer(headline, GOOD_BODY)).raw_headline_correct is correct


def test_an_open_question_reports_open_and_rejects_answered():
    open_q = dict(PRIV)
    scope = request_scope("Is the privileged password reset question answered?")
    good = _answer("Not yet: the privileged password-reset Question is still open.", "No answer is recorded; it is still open.", "priv", "question")
    bad = _answer("Yes, the privileged password-reset Question was answered.", "No answer is recorded; it is still open.", "priv", "question")
    assert check_answer(scope, open_q, good).raw_headline_correct
    assert not check_answer(scope, open_q, bad).raw_headline_correct


def test_a_contradicting_headline_with_a_good_body_replaces_only_the_headline():
    shown, check = apply(ANSWERED, VENDOR, _answer("No, the vendor-retention question is answered: 30 days.", GOOD_BODY))
    assert check.fallback == "headline" and not check.raw_headline_correct
    assert shown["headline"] == "Recorded answer available: " + VENDOR["text"]
    assert shown["summary"] == GOOD_BODY


def test_a_body_that_states_the_opposite_is_replaced_by_the_record():
    shown, check = apply(ANSWERED, VENDOR, _answer("Legal answered the retention question.", "The Question is still open; no answer is recorded."))
    assert check.fallback == "full" and not check.body_ok
    assert shown == record_built_answer(VENDOR)


@pytest.mark.parametrize("record,sentence", [
    # Real Nov 7 bodies (saved Step 1 and diagnostic answers) that an earlier version flagged by mistake.
    ("open", "The question 'Does the vendor retain customer content after the contract ends?' is an open, non-blocking Question with no recorded answer."),
    ("resolved", "The Question is closed. Legal confirmed the vendor deletes customer content within 30 days of contract end. No open Question or open Review on retention remains."),
    ("resolved", "The Question is closed. Legal confirmed the vendor deletes customer content within 30 days of contract end. No open Review or open Question covers this topic."),
    ("resolved", "The Question is closed. Legal confirmed the vendor deletes customer content within 30 days of contract end. Current State says the vendor contract remains under review, so that is still open."),
])
def test_negated_or_off_subject_status_words_do_not_fail_the_body(record, sentence):
    q, text = (VENDOR, "Was the vendor-retention question answered?") if record == "resolved" else (PRIV, "Is the privileged password reset question answered?")
    check = check_answer(request_scope(text), q, _answer("Legal answered the retention question." if record == "resolved" else "The privileged reset Question is still open.",
                                                          sentence, q["id"], "answered_question" if record == "resolved" else "question"))
    assert check.body_ok, check.problems


def test_a_body_without_the_recorded_answer_is_replaced():
    shown, check = apply(ANSWERED, VENDOR, _answer("Legal answered the retention question.", "It was answered."))
    assert check.fallback == "full" and "recorded answer" in " ".join(check.problems)


def test_a_wrong_record_is_reported_as_wrong_record_not_hidden_as_a_fallback():
    shown, check = apply(ANSWERED, VENDOR, _answer("Legal answered it.", GOOD_BODY, record_id="priv", record_type="question"))
    assert check.wrong_record and check.fallback == "full"
    assert any("different Question" in p for p in check.problems)
    assert shown["sections"][0]["items"][0]["record_id"] == "vend"


def test_record_built_answers_are_neutral_and_carry_no_model_text():
    built = record_built_answer(VENDOR)
    assert built["headline"] == "Recorded answer available: Does the vendor retain customer content after the contract ends?"
    assert built["sections"][0]["items"][0]["detail"] == "Answered: " + VENDOR["answer"]
    assert record_built_answer(PRIV)["headline"] == "Open question: " + PRIV["text"]
    # A record-built answer passes the same checks as a model answer.
    for q, text in ((VENDOR, "Was the vendor-retention question answered?"), (PRIV, "Is the privileged password reset question answered?")):
        scope = request_scope(text)
        check = check_answer(scope, q, record_built_answer(q))
        assert check.raw_headline_correct and check.body_ok and not check.wrong_record, check.problems
    clarify = clarification_answer([PRIV, STD])
    assert clarify["headline"] == "Which Question do you mean?" and len(clarify["sections"][0]["items"]) == 2


# ------------------------------------------------------------------ offline replay of the captured failure

def test_the_captured_raw_output_fails_the_headline_check_and_keeps_its_body():
    fixture = json.loads((Path(__file__).parent / "eval" / "fixtures" / "640_captured_raw_42445998717.json").read_text())
    raw = fixture["raw"]["answer"]
    scenario = next(s for s in SCENARIOS if s.id == "ask_question_answer_no_state_mutation")
    q = {"id": "ask-closed-question-0", "text": scenario.closed_questions[0][0], "status": "resolved", "answer": scenario.closed_questions[0][1]}
    scope = request_scope(scenario.question)
    assert scope.in_scope and match_question(scenario.question, [q]).kind == "matched"
    shown, check = apply(scope, q, raw)
    assert raw["headline"].startswith("Not yet:")
    assert not check.raw_headline_correct and check.body_ok and not check.wrong_record
    assert check.fallback == "headline"
    assert shown["headline"] == "Recorded answer available: Does the vendor retain customer content after the contract ends?"
    assert shown["summary"] == raw["summary"]


# ------------------------------------------------------------------ reviewer counterexamples (Paige, Nov 7)

@pytest.mark.parametrize("family", [
    ("delete", "deleted", "deletes", "deleting", "deletion"),
    ("approve", "approved", "approves", "approving", "approval", "approvals"),
    ("qualify", "qualifies", "qualified", "qualifying"),
    ("privilege", "privileged", "privileges"),
    ("retain", "retains", "retained", "retaining", "retention"),
])
def test_each_word_family_normalizes_to_one_form(family):
    assert len({normalize(w) for w in family}) == 1, {w: normalize(w) for w in family}


@pytest.mark.parametrize("request_text", [
    "Was the vendor question answered correctly?",
    "Was the vendor retention question answered properly?",
    "Was the vendor retention question fully answered?",
    "How well was the vendor retention question answered?",
])
def test_questions_about_answer_quality_are_not_status_requests(request_text):
    assert not request_scope(request_text).in_scope


def test_explicit_open_status_wins_over_answer_text():
    draft = {"id": "d", "text": "Does the vendor retain customer content after the contract ends?", "status": "open",
             "answer": "Draft: the vendor may delete content within 30 days."}
    built = record_built_answer(draft)
    assert built["headline"] == "Open question: " + draft["text"]
    assert built["sections"][0]["items"][0]["record_type"] == "question"
    assert "Draft" not in str(built)  # an open Question's answer text is never shown as its answer
    scope = request_scope("Was the vendor-retention question answered?")
    assert not check_answer(scope, draft, _answer("Legal answered the retention question.", "It was answered.", "d")).raw_headline_correct


# Known gaps, kept on purpose (Paige, Nov 7: do not expand the body heuristics yet). Word overlap does not establish
# that the body reproduces the recorded answer, and the contradiction check only reads sentences that say "question".
# A direct record-built response for unambiguous status requests (#640 proposal) would not have these gaps. strict:
# if a later change starts catching them, the test fails so the record is updated.
@pytest.mark.xfail(strict=True, reason="known gap: a changed number in the body passes the 60% word-overlap check")
def test_known_gap_a_changed_number_in_the_body_is_caught():
    body = "The Question is closed. Legal confirmed the vendor deletes customer content within 90 days of contract end."
    assert not check_answer(ANSWERED, VENDOR, _answer("Legal answered the retention question.", body)).body_ok


@pytest.mark.xfail(strict=True, reason="known gap: a contradiction stated with a pronoun ('it') is not read")
def test_known_gap_a_pronoun_contradiction_in_the_body_is_caught():
    body = "It remains unanswered. Legal confirmed the vendor deletes customer content within 30 days of contract end."
    assert not check_answer(ANSWERED, VENDOR, _answer("Legal answered the retention question.", body)).body_ok


def test_the_held_out_set_is_well_formed_but_is_not_scored_here():
    """The held-out set is only loaded and checked for shape: scoring it here would turn it into development data."""
    data = json.loads((Path(__file__).parent / "eval" / "fixtures" / "640_heldout_v1.json").read_text())
    ids = {q["id"] for q in data["questions"]}
    assert len(ids) == len(data["questions"]) and all(q["status"] in {"open", "resolved"} for q in data["questions"])
    assert all(r["match"] in ids | {"clarify", "none"} for r in data["requests"] if r["in_scope"])
    assert all(a["question"] in ids and a["answer"]["cited"] in ids for a in data["answers"])
    assert {"correct"} < {a["label"].split(":")[0] for a in data["answers"]} | {"correct"}
