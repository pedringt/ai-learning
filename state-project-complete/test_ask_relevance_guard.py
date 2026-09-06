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
