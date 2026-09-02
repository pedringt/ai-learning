from database_migration_backed import initialize_db
from db import connect_sqlite
from seed_demo import bootstrap_demo_data


def test_demo_seed_is_idempotent_and_stress_sized(tmp_path):
    db = tmp_path / "state.db"
    with connect_sqlite(str(db)) as connection:
        initialize_db(connection)
        first = bootstrap_demo_data(connection)
        second = bootstrap_demo_data(connection)
        assert first == {"state": 25, "questions": 18, "reviews": 4}
        assert second == {"state": 0, "questions": 0, "reviews": 0}
        assert connection.execute("SELECT count(*) AS n FROM current_state_items").fetchone()["n"] == 25
        assert connection.execute("SELECT count(*) AS n FROM questions WHERE status='open'").fetchone()["n"] == 18
        assert connection.execute("SELECT count(*) AS n FROM questions WHERE blocking=1").fetchone()["n"] == 3
        assert connection.execute("SELECT count(*) AS n FROM review_issues WHERE status='open'").fetchone()["n"] == 4


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
    assert health["demo_bootstrap"] is True
    assert len(state) == 25
    assert len([q for q in questions if q["status"] == "open"]) == 18
    assert len(reviews) == 4
