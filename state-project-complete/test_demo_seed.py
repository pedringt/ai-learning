from database_migration_backed import initialize_db
from db import connect_sqlite
from seed_demo import bootstrap_demo_data


def test_demo_seed_is_idempotent_and_stress_sized(tmp_path):
    db = tmp_path / "state.db"
    with connect_sqlite(str(db)) as connection:
        initialize_db(connection)
        first = bootstrap_demo_data(connection)
        second = bootstrap_demo_data(connection)
        assert first == {"state": 25, "questions": 18, "reviews": 4, "history": 10}
        assert second == {"state": 0, "questions": 0, "reviews": 0, "history": 0}
        assert connection.execute("SELECT count(*) AS n FROM current_state_items").fetchone()["n"] == 25
        assert connection.execute("SELECT count(*) AS n FROM questions WHERE status='open'").fetchone()["n"] == 18
        assert connection.execute("SELECT count(*) AS n FROM questions WHERE blocking=1").fetchone()["n"] == 3
        assert connection.execute("SELECT count(*) AS n FROM review_issues WHERE status='open'").fetchone()["n"] == 4
        assert connection.execute("SELECT count(*) AS n FROM history_transitions").fetchone()["n"] == 10
        assert connection.execute("SELECT count(*) AS n FROM review_issues WHERE status='resolved'").fetchone()["n"] == 10
        assert connection.execute("SELECT count(*) AS n FROM proposed_state_changes WHERE status='accepted'").fetchone()["n"] == 10


def test_demo_seed_never_overwrites_existing_state(tmp_path):
    db = tmp_path / "state.db"
    with connect_sqlite(str(db)) as connection:
        initialize_db(connection)
        connection.execute("INSERT INTO current_state_items(id,topic,statement,version) VALUES ('k-pilot','Pilot direction','User-reviewed pilot truth.',7)")
        connection.commit()
        bootstrap_demo_data(connection)
        row = connection.execute("SELECT statement,version FROM current_state_items WHERE id='k-pilot'").fetchone()
        assert row["statement"] == "User-reviewed pilot truth."
        assert row["version"] == 7


def test_environment_loaded_demo_bootstrap_defaults_on(monkeypatch):
    from api import Settings
    monkeypatch.setenv("DATABASE_URL", "sqlite://demo.db")
    monkeypatch.delenv("STATE_DEMO_BOOTSTRAP", raising=False)
    assert Settings.from_env().demo_bootstrap is True
    monkeypatch.setenv("STATE_DEMO_BOOTSTRAP", "0")
    assert Settings.from_env().demo_bootstrap is False


def test_environment_loaded_app_bootstraps_real_demo_dataset(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from api import Settings, create_app

    db = tmp_path / "env-demo.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite://{db}")
    monkeypatch.delenv("STATE_DEMO_BOOTSTRAP", raising=False)
    settings = Settings.from_env()
    with TestClient(create_app(settings=settings, provider=object())) as client:
        health = client.get("/health").json()
        state = client.get("/api/state").json()["items"]
        questions = client.get("/api/questions").json()["items"]
        reviews = client.get("/api/reviews").json()["items"]
        history = client.get("/api/history").json()["items"]
    assert health["demo_bootstrap"] is True
    assert len(state) == 25
    assert len([q for q in questions if q["status"] == "open"]) == 18
    assert len(reviews) == 4
    assert len(history) == 10


def test_r86_history_backfill_does_not_stale_existing_demo_open_reviews(tmp_path):
    db = tmp_path / "upgrade.db"
    with connect_sqlite(str(db)) as connection:
        initialize_db(connection)
        # Simulate the R8.5 deployed shape: baseline State + Questions + open demo Reviews,
        # but no synthetic accepted History yet.
        from seed_demo import ITEMS, QUESTIONS, REVIEWS, DEMO_EVIDENCE_DATES
        for item in ITEMS:
            connection.execute("INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, 1)", item)
        for qid, text, blocking, blocks, origin in QUESTIONS:
            connection.execute("INSERT INTO questions(id,text,status,blocking,blocks,origin) VALUES (?,?,'open',?,?,?)", (qid,text,blocking,blocks,origin))
        for rid, rtype, question, why, state_id, proposed, evidence_text in REVIEWS:
            eid=f"{rid}-evidence"
            connection.execute("INSERT INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES (?,?,'demo_seed','processed',?)", (eid,evidence_text,DEMO_EVIDENCE_DATES[rid]))
            connection.execute("INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES (?,?,?,?,'open')", (rid,rtype,question,why))
            connection.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES (?,?)", (rid,eid))
            if state_id and proposed:
                connection.execute("INSERT INTO review_state_items(review_id,state_item_id) VALUES (?,?)", (rid,state_id))
                connection.execute("INSERT INTO proposed_state_changes(id,review_id,state_item_id,proposed_statement,rationale,expected_state_version,status,operation) VALUES (?,?,?,?,?,1,'pending','update')", (f"{rid}-proposal",rid,state_id,proposed,why))
        connection.commit()
        result=bootstrap_demo_data(connection)
        assert result["history"] == 10
        mismatches=connection.execute(
            "SELECT count(*) AS n FROM proposed_state_changes p JOIN current_state_items s ON s.id=p.state_item_id "
            "WHERE p.status='pending' AND p.expected_state_version<>s.version"
        ).fetchone()["n"]
        assert mismatches == 0
