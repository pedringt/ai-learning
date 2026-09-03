from __future__ import annotations

from fastapi.testclient import TestClient

from api import Settings, create_app


class UserScenarioProvider:
    name = "fake"
    model_identifier = "user-workflow-matrix"

    def interpret(self, *, context, evidence):
        text = evidence["content"]
        if text == "My billing contact is Jane Smith":
            return {
                "summary": "A billing contact was explicitly named.",
                "topics": ["stakeholders"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create", "review_type": "missing_understanding",
                    "decision_question": "Should Jane Smith be added as the billing contact?",
                    "why_consequential": "This establishes a project contact.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{
                        "operation": "create", "proposed_statement": "Jane Smith is the billing contact.",
                        "rationale": "The Evidence explicitly names Jane Smith as the billing contact."
                    }],
                }],
            }
        if text.startswith("REPEAT:"):
            statement = text.removeprefix("REPEAT:")
            return {
                "summary": "The note repeats maintained understanding.", "topics": ["pilot"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create", "review_type": "missing_understanding",
                    "decision_question": "Should State add this pilot fact?",
                    "why_consequential": "The provider believes it is missing.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{"operation": "create", "proposed_statement": statement, "rationale": "Repeated evidence."}],
                }],
            }
        if text == "Pilot lead: The first pilot will run for two weeks with 8 support reps from the Billing and Account Access teams. The team will review results at the end of the two-week period before deciding whether to expand.":
            return {
                "summary": "A concrete first-pilot cohort and duration were established.",
                "topics": ["rollout", "pilot"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create", "review_type": "missing_understanding",
                    "decision_question": "Should State add the first-pilot cohort and duration?",
                    "why_consequential": "This establishes how the pilot will be run.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{
                        "operation": "create",
                        "proposed_statement": "The first pilot will run for two weeks with 8 support reps from Billing and Account Access, followed by a review before expansion.",
                        "rationale": "The Evidence explicitly establishes the cohort, duration, and expansion checkpoint."
                    }],
                }],
            }
        if text == "The pilot direction should now be internal-only.":
            version = context.state_items["k-pilot"].version
            return {
                "summary": "The pilot direction may have changed.", "topics": ["pilot"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create", "review_type": "proposed_update",
                    "decision_question": "Should the pilot direction become internal-only?",
                    "why_consequential": "This would change maintained pilot scope.",
                    "affected_state_item_ids": ["k-pilot"],
                    "proposed_changes": [{
                        "operation": "update", "state_item_id": "k-pilot", "expected_version": version,
                        "proposed_statement": "The pilot direction is internal-only.", "rationale": "The Evidence explicitly changes the direction."
                    }],
                }],
            }
        raise AssertionError(f"Unexpected workflow evidence: {text}")


def client_for(tmp_path):
    settings = Settings(database_path=str(tmp_path / "user-flow.db"), cors_origins=[], demo_bootstrap=True)
    return TestClient(create_app(settings, provider=UserScenarioProvider(), ask_provider=None))


def test_real_user_add_review_accept_updates_project_and_history(tmp_path):
    with client_for(tmp_path) as client:
        added = client.post("/api/evidence", json={"content": "My billing contact is Jane Smith", "source_type": "manual_note"})
        assert added.status_code == 201
        review = added.json()["reviews"][0]
        assert "Jane Smith" in review["decision_question"]
        resolved = client.post(f"/api/reviews/{review['id']}/resolve", json={"decision": "accept"})
        assert resolved.status_code == 200
        state = client.get("/api/state").json()["items"]
        assert sum("Jane Smith is the billing contact" in x["statement"] for x in state) == 1
        history = client.get("/api/history").json()["items"]
        assert any("Jane Smith is the billing contact" in (x.get("new_statement") or "") for x in history)


def test_real_user_rejects_change_and_current_state_stays_put(tmp_path):
    with client_for(tmp_path) as client:
        before = next(x for x in client.get("/api/state").json()["items"] if x["id"] == "k-pilot")["statement"]
        added = client.post("/api/evidence", json={"content": "The pilot direction should now be internal-only.", "source_type": "manual_note"})
        review = added.json()["reviews"][0]
        resolved = client.post(f"/api/reviews/{review['id']}/resolve", json={"decision": "keep"})
        assert resolved.status_code == 200
        after = next(x for x in client.get("/api/state").json()["items"] if x["id"] == "k-pilot")["statement"]
        assert after == before


def test_real_user_repeats_current_fact_and_is_not_sent_to_review(tmp_path):
    with client_for(tmp_path) as client:
        statement = next(x for x in client.get("/api/state").json()["items"] if x["id"] == "k-pilot")["statement"]
        added = client.post("/api/evidence", json={"content": f"REPEAT:{statement}", "source_type": "manual_note"})
        assert added.status_code == 201
        assert added.json()["reviews"] == []
        assert len([x for x in client.get("/api/state").json()["items"] if x["statement"] == statement]) == 1


def test_real_user_can_reset_back_to_interactive_northstar(tmp_path):
    with client_for(tmp_path) as client:
        added = client.post("/api/evidence", json={"content": "My billing contact is Jane Smith", "source_type": "manual_note"})
        review = added.json()["reviews"][0]
        client.post(f"/api/reviews/{review['id']}/resolve", json={"decision": "accept"})
        reset = client.post("/api/demo/reset")
        assert reset.status_code == 200
        state = client.get("/api/state").json()["items"]
        assert not any("Jane Smith" in x["statement"] for x in state)
        assert len(client.get("/api/reviews?status=open").json()["items"]) >= 4
        questions = client.get("/api/questions?status=open").json()["items"]
        assert any(x["blocking"] for x in questions)


def test_builtin_sample_update_creates_clear_rollout_review_and_state_change(tmp_path):
    sample = "Pilot lead: The first pilot will run for two weeks with 8 support reps from the Billing and Account Access teams. The team will review results at the end of the two-week period before deciding whether to expand."
    with client_for(tmp_path) as client:
        added = client.post('/api/evidence', json={'content': sample, 'source_type': 'manual_note'})
        assert added.status_code == 201
        reviews = added.json()['reviews']
        assert len(reviews) == 1
        assert 'cohort and duration' in reviews[0]['decision_question']
        resolved = client.post(f"/api/reviews/{reviews[0]['id']}/resolve", json={'decision':'accept'})
        assert resolved.status_code == 200
        statements = [x['statement'] for x in client.get('/api/state').json()['items']]
        assert sum('8 support reps from Billing and Account Access' in x for x in statements) == 1
