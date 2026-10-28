from ask_provider import _filter_candidate_payload, _harden_prompt_for_relevance


def _prompt(query: str, previous: str = '{"headline":"Billing is out of scope"}') -> str:
    candidates = {
        "state": [
            {"id": "billing-scope", "statement": "Billing adjustments remain outside the pilot.", "authority": "governing_current_fact"},
            {"id": "security-contact", "statement": "The security contact is Morgan Lee.", "authority": "governing_current_fact"},
        ],
        "reviews": [],
        "questions": [],
        "history": [],
        "evidence": [
            {"id": "billing-evidence", "content": "Billing plan inquiries were discussed during pilot planning.", "authority": "supporting_or_event_evidence"},
        ],
        "rules": [{"id": "rule-1", "text": "Unknown remains unknown.", "authority": "interpretation_guardrail"}],
    }
    import json
    return f"""You are State Ask.\n\nUser request: {query}\nPrevious answer (for refinement only): {previous}\n\nAuthority-tagged candidate records:\n{json.dumps(candidates)}\n\nReturn JSON only."""


def test_specific_lookup_drops_adjacent_topic_records():
    payload = {
        "state": [
            {"id": "billing-scope", "statement": "Billing adjustments remain outside the pilot."},
            {"id": "actual-contact", "statement": "Billing contact: Morgan Lee."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("Who is the billing contact?", payload)
    assert [x["id"] for x in filtered["state"]] == ["actual-contact"]


def test_unknown_lookup_does_not_keep_zero_relevance_records():
    payload = {
        "state": [{"id": "pilot-scope", "statement": "The pilot covers Tier 1 support."}],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("What is the pilot budget?", payload)
    assert filtered["state"] == []


def test_topic_shift_removes_previous_answer_framing():
    hardened = _harden_prompt_for_relevance(_prompt("Who is the security contact?"))
    assert "Previous answer (for refinement only): null" in hardened
    assert "Billing is out of scope" not in hardened
    assert "The security contact is Morgan Lee." in hardened
    assert "Billing adjustments remain outside the pilot." not in hardened


def test_billing_contact_does_not_get_billing_scope_as_answer_context():
    hardened = _harden_prompt_for_relevance(_prompt("Who is the billing contact?"))
    assert "Billing adjustments remain outside the pilot." not in hardened
    assert "Billing plan inquiries were discussed" not in hardened
    assert "does not establish a billing contact" in hardened


def test_other_contacts_followup_is_treated_as_fresh_question():
    hardened = _harden_prompt_for_relevance(_prompt("What other contacts do I have?"))
    assert "Previous answer (for refinement only): null" in hardened
    assert "Billing is out of scope" not in hardened


def test_source_followup_keeps_previous_answer_context():
    hardened = _harden_prompt_for_relevance(_prompt("What source supports that?"))
    assert "Billing is out of scope" in hardened


def test_short_why_followup_keeps_previous_answer_context():
    hardened = _harden_prompt_for_relevance(_prompt("Why?"))
    assert "Billing is out of scope" in hardened


def test_how_do_you_know_followup_keeps_previous_answer_context():
    hardened = _harden_prompt_for_relevance(_prompt("How do you know?"))
    assert "Billing is out of scope" in hardened


def test_where_did_you_get_that_followup_keeps_previous_answer_context():
    hardened = _harden_prompt_for_relevance(_prompt("Where did you get that?"))
    assert "Billing is out of scope" in hardened


def test_pronoun_followup_keeps_previous_answer_context():
    hardened = _harden_prompt_for_relevance(_prompt("Can you explain that?"))
    assert "Billing is out of scope" in hardened


def test_broad_brief_keeps_bounded_context():
    payload = {
        "state": [
            {"id": "a", "statement": "Pilot covers Tier 1 support."},
            {"id": "b", "statement": "Retention is unresolved."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("Catch me up", payload)
    assert filtered["state"] == payload["state"]


def test_semantic_owner_paraphrase_does_not_get_pre_filtered():
    payload = {
        "state": [
            {"id": "owner", "statement": "Project owner: Morgan Lee."},
            {"id": "scope", "statement": "The pilot covers Tier 1 support."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("Who leads the pilot?", payload)
    assert filtered["state"] == payload["state"]


def test_semantic_launch_date_paraphrase_does_not_get_pre_filtered():
    payload = {
        "state": [
            {"id": "launch", "statement": "Launch date: October 5."},
            {"id": "scope", "statement": "The pilot covers Tier 1 support."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("When are we going live?", payload)
    assert filtered["state"] == payload["state"]


def test_semantic_budget_paraphrase_does_not_get_pre_filtered():
    payload = {
        "state": [
            {"id": "budget", "statement": "Pilot budget: $25,000."},
            {"id": "scope", "statement": "The pilot covers Tier 1 support."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("What does the pilot cost?", payload)
    assert filtered["state"] == payload["state"]


def test_explicit_attribute_lookup_still_filters_adjacent_records():
    payload = {
        "state": [
            {"id": "scope", "statement": "Billing work is outside the pilot."},
            {"id": "contact", "statement": "Billing contact: Morgan Lee."},
            {"id": "security", "statement": "Security contact: Jamie Chen."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("Who is the billing contact?", payload)
    assert [x["id"] for x in filtered["state"]] == ["contact"]


def test_guard_explicitly_distinguishes_grounding_from_relevance():
    hardened = _harden_prompt_for_relevance(_prompt("What is the pilot budget?"))
    assert "Grounded is not the same as relevant" in hardened
    assert "State does not have enough confirmed information" in hardened


# --- #223: an entity noun ("vendor") used as the subject is not a lookup anchor ---
# "Does the vendor train on customer content?" asks about a topic; it is not a
# lookup for "the vendor" attribute. The strict anchor guard used to drop the
# governing Current State fact AND the pending Review that qualifies it,
# because neither literally contained the word "vendor".

_VENDOR_TRAINING_PAYLOAD = {
    "state": [{
        "id": "terms",
        "statement": "The approved enterprise terms state customer content is not used for model training.",
        "authority": "governing_current_fact",
    }],
    "reviews": [{
        "id": "legal-review",
        "decision_question": "New legal evidence may contradict the approved enterprise-terms interpretation.",
        "authority": "qualifies_current_state",
    }],
    "questions": [], "history": [], "evidence": [], "rules": [],
}


def test_entity_noun_as_subject_keeps_governing_fact_and_pending_review():
    filtered = _filter_candidate_payload("Does the vendor train on customer content?", _VENDOR_TRAINING_PAYLOAD)
    assert [x["id"] for x in filtered["state"]] == ["terms"]
    assert [x["id"] for x in filtered["reviews"]] == ["legal-review"]


def test_entity_noun_as_subject_survives_full_prompt_hardening():
    import json
    prompt = (
        "You are State Ask.\n\nUser request: Does the vendor train on customer content?\n"
        "Previous answer (for refinement only): null\n\n"
        f"Authority-tagged candidate records:\n{json.dumps(_VENDOR_TRAINING_PAYLOAD)}\n\nReturn JSON only."
    )
    hardened = _harden_prompt_for_relevance(prompt)
    assert "not used for model training" in hardened
    assert "may contradict the approved enterprise-terms" in hardened


def test_bare_entity_lookup_is_still_strict():
    payload = {
        "state": [
            {"id": "scope", "statement": "Billing adjustments remain outside the pilot."},
            {"id": "vendor", "statement": "The vendor is Acme Support Co."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("Who is the vendor?", payload)
    assert [x["id"] for x in filtered["state"]] == ["vendor"]


def test_entity_noun_with_a_real_attribute_anchor_is_still_strict():
    payload = {
        "state": [
            {"id": "bystander", "statement": "Billing adjustments remain outside the pilot."},
            {"id": "contact", "statement": "Vendor contact: Morgan Lee."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("Who is the vendor contact?", payload)
    assert [x["id"] for x in filtered["state"]] == ["contact"]


def test_office_as_subject_keeps_records_that_do_not_say_office():
    payload = {
        "state": [{"id": "move", "statement": "The move is scheduled for October 3."}],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    filtered = _filter_candidate_payload("Is the office move on schedule?", payload)
    assert [x["id"] for x in filtered["state"]] == ["move"]


def test_drafting_request_keeps_records_despite_an_attribute_word():
    # #536: "email" named the deliverable, and the lookup filter dropped every record.
    from ask_provider import _filter_candidate_payload
    payload = {"state": [{"id": "s", "topic": "pricing", "statement": "Pricing is unchanged at $49/month."},
                         {"id": "c", "topic": "billing", "statement": "Billing contact email is ap@example.com."}],
               "reviews": [{"id": "r", "decision_question": "Proposal: raise the price 25% to $61.25/month."}],
               "questions": [], "history": [], "evidence": [], "rules": []}
    drafted = _filter_candidate_payload(
        "Assume the 25% price increase goes through. Draft the customer email announcing the new price.", payload)
    assert len(drafted["state"]) == 2 and len(drafted["reviews"]) == 1
    looked_up = _filter_candidate_payload("What is the billing contact email?", payload)
    assert [r["id"] for r in looked_up["state"]] == ["c"]


# #569 (Oct 27): a two-part question with one lookup part was filtered as a pure lookup, so the
# Current State record answering the other part never reached the model.
NORTHSTAR = {
    "state": [
        {"id": "k-launch", "statement": "Implementation planning can proceed with the bounded use case, but pilot launch still requires agreed thresholds."},
        {"id": "k-pilot", "statement": "The core pilot use case is Tier 1 troubleshooting assistance."},
    ],
    "reviews": [{"id": "demo-review-create-budget", "decision_question": "Is the approved pilot budget ready to be recorded?"}],
    "questions": [], "history": [],
    "evidence": [{"id": "q3", "content": "Q3 planning session: the pilot budget is approved at $40,000."}],
    "rules": [],
}

PRODUCTION_TWO_PART_QUESTIONS = (
    "What's our pilot budget, and can we start implementation planning?",
    "What is our pilot budget and can we start implementation planning?",
    "What's the pilot budget, and can implementation planning start?",
    "Do we have a pilot budget yet, and can we begin implementation planning?",
    "What is the budget for the pilot, and are we able to start implementation planning now?",
    "Pilot budget? And can we start planning implementation?",
    "What's our budget for the pilot, and is implementation planning allowed to start?",
    "Can we start implementation planning, and what is the pilot budget?",
    "What is the approved pilot budget, and may we start implementation planning?",
)


def test_a_two_part_question_keeps_the_current_state_for_its_other_part():
    for query in PRODUCTION_TWO_PART_QUESTIONS:
        filtered = _filter_candidate_payload(query, NORTHSTAR)
        assert "k-launch" in [x["id"] for x in filtered["state"]], query
        assert [x["id"] for x in filtered["reviews"]] == ["demo-review-create-budget"], query


def test_a_single_lookup_is_still_filtered():
    filtered = _filter_candidate_payload("What's the pilot budget?", NORTHSTAR)
    assert filtered["state"] == []
    assert [x["id"] for x in filtered["reviews"]] == ["demo-review-create-budget"]


def test_two_lookups_are_still_filtered():
    payload = {
        "state": [
            {"id": "billing", "statement": "Billing contact: Morgan Lee."},
            {"id": "security", "statement": "Security contact: Priya Shah."},
            {"id": "scope", "statement": "Billing adjustments remain outside the pilot."},
        ],
        "reviews": [], "questions": [], "history": [], "evidence": [], "rules": [],
    }
    for query in ("Who is the billing contact, and who is the security contact?",
                  "What's the billing contact and the security contact?"):
        kept = [x["id"] for x in _filter_candidate_payload(query, payload)["state"]]
        assert kept == ["billing", "security"], query


def test_the_whole_production_prompt_keeps_current_state():
    prompt = _prompt(PRODUCTION_TWO_PART_QUESTIONS[0])
    hardened = _harden_prompt_for_relevance(prompt)
    assert "billing-scope" in hardened and "security-contact" in hardened
