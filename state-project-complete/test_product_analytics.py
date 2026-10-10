import sqlite3
import unittest
from datetime import datetime, timezone

from pydantic import ValidationError

from database_migration_backed import get_test_db
from product_analytics import ProductEventInput, _aggregate, _insert_event


class ProductAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self._db = get_test_db()
        self.connection = self._db.__enter__()
        self.connection.row_factory = sqlite3.Row
        self.addCleanup(self._db.__exit__, None, None, None)
        self.connection.execute("INSERT OR IGNORE INTO projects(id,name) VALUES ('beta','Beta')")
        self.connection.commit()

    def test_analytics_schema_is_migration_backed_and_quality_evals_share_one_table(self):
        tables = {
            row[0] for row in self.connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        self.assertIn("product_analytics_events", tables)
        self.assertIn("product_eval_runs", tables)
        self.assertIn("model_call_metrics", tables)
        self.assertNotIn("product_quality_eval_runs", tables)
        columns = {
            info[1] for info in self.connection.execute("PRAGMA table_info(product_eval_runs)")
        }
        for column in (
            "interpretation_accuracy",
            "uncertainty_accuracy",
            "open_item_accuracy",
            "authority_accuracy",
            "overall_pass_rate",
            "failure_details_json",
        ):
            self.assertIn(column, columns)

    def test_event_schema_fails_closed_on_content_fields(self):
        with self.assertRaises(ValidationError):
            ProductEventInput(name="state_demo_opened", query="secret project question")
        with self.assertRaises(ValidationError):
            ProductEventInput(name="view_opened", evidence_content="secret evidence")

    def test_safe_event_persists_metadata_only(self):
        payload = ProductEventInput(
            name="view_opened",
            session_id="session-1",
            project_id="northstar",
            environment="staging",
            build="abc123",
            view="history",
        )
        _insert_event(self.connection, payload, datetime(2026, 9, 17, tzinfo=timezone.utc))
        row = self.connection.execute("SELECT * FROM product_analytics_events").fetchone()
        self.assertEqual(row["event_name"], "view_opened")
        self.assertEqual(row["project_id"], "northstar")
        self.assertEqual(row["view_name"], "history")
        columns = {info[1] for info in self.connection.execute("PRAGMA table_info(product_analytics_events)")}
        for forbidden in ("query", "content", "statement", "answer", "prompt"):
            self.assertNotIn(forbidden, columns)

    def test_project_drilldown_is_isolated_and_content_free(self):
        self.connection.execute(
            "INSERT INTO evidence(id,content,source_type,processing_status,project_id) VALUES (?,?,?,?,?)",
            ("e-north", "Northstar secret text", "manual_note", "processed", "northstar"),
        )
        self.connection.execute(
            "INSERT INTO evidence(id,content,source_type,processing_status,project_id) VALUES (?,?,?,?,?)",
            ("e-beta", "Beta secret text", "slack", "processed", "beta"),
        )
        self.connection.execute(
            "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,project_id) VALUES (?,?,?,?,?)",
            ("r-north", "missing_understanding", "Northstar private question?", "Private rationale", "northstar"),
        )
        self.connection.execute(
            "INSERT INTO questions(id,text,status,blocking,project_id) VALUES (?,?,?,?,?)",
            ("q-beta", "Beta private question?", "open", 1, "beta"),
        )
        self.connection.commit()

        data = _aggregate(self.connection, "northstar", datetime.now(timezone.utc))
        serialized = str(data)
        self.assertEqual(data["scope"]["project_id"], "northstar")
        self.assertEqual(data["outcomes_and_friction"]["pending_reviews"], 1)
        self.assertEqual(data["outcomes_and_friction"]["blocking_questions"], 0)
        self.assertNotIn("Northstar secret text", serialized)
        self.assertNotIn("Northstar private question", serialized)
        self.assertNotIn("Beta secret text", serialized)
        self.assertNotIn("Beta private question", serialized)

    def test_product_eval_card_ignores_review_and_ask_quality_suites(self):
        self.connection.execute(
            "INSERT INTO product_eval_runs(id,suite,run_kind,total,recall,precision,created_at) "
            "VALUES ('eval-main','consequentiality','controlled_eval',10,0.9,0.8,'2026-09-17 10:00:00')"
        )
        self.connection.execute(
            "INSERT INTO product_eval_runs(id,suite,run_kind,total,ask_grounding,created_at) "
            "VALUES ('eval-ask','ask_quality','controlled_eval',8,0.95,'2026-09-17 12:00:00')"
        )
        self.connection.commit()

        data = _aggregate(self.connection, None, datetime(2026, 9, 17, 13, 0, tzinfo=timezone.utc))
        self.assertEqual(data["evals"]["latest"]["suite"], "consequentiality")

    def test_resolved_reviews_without_state_change_uses_history_linkage(self):
        now = datetime(2026, 9, 17, 13, 0, tzinfo=timezone.utc)
        self.connection.execute(
            "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolved_at,project_id) "
            "VALUES ('r-change','proposed_update','Private?','Private','resolved','updated','2026-09-17 12:00:00','northstar')"
        )
        self.connection.execute(
            "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolved_at,project_id) "
            "VALUES ('r-no-change','missing_understanding','Private?','Private','resolved','confirmed_current','2026-09-17 12:00:00','northstar')"
        )
        self.connection.execute(
            "INSERT INTO proposed_state_changes(id,review_id,proposed_statement,rationale,status,operation) "
            "VALUES ('p-change','r-change','Private statement','Private','accepted','create')"
        )
        self.connection.execute(
            "INSERT INTO current_state_items(id,topic,statement,project_id) "
            "VALUES ('s-change','private','Private statement','northstar')"
        )
        self.connection.execute(
            "INSERT INTO history_transitions(id,state_item_id,proposed_change_id,transition_type,new_statement,to_version,changed_at) "
            "VALUES ('h-change','s-change','p-change','created','Private statement',1,'2026-09-17 12:00:00')"
        )
        self.connection.commit()

        data = _aggregate(self.connection, "northstar", now)
        self.assertEqual(data["outcomes_and_friction"]["resolved_reviews_without_state_change_30d"], 1)


    def test_model_call_telemetry_is_metadata_only_and_aggregated(self):
        self.connection.execute(
            "INSERT INTO model_call_metrics(id,project_id,operation,provider,model_identifier,duration_ms,input_tokens,output_tokens,occurred_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            ("model-1","northstar","interpretation","anthropic","claude-haiku-4-5-20251001",1500,1000,200,"2026-09-17 12:00:00"),
        )
        self.connection.execute(
            "INSERT INTO model_call_metrics(id,project_id,operation,provider,model_identifier,duration_ms,input_tokens,output_tokens,occurred_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            ("model-2","northstar","interpretation","anthropic","claude-haiku-4-5-20251001",2500,2000,400,"2026-09-17 12:05:00"),
        )
        self.connection.execute(
            "INSERT INTO model_call_metrics(id,project_id,operation,provider,model_identifier,duration_ms,input_tokens,output_tokens,occurred_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            ("model-ask","northstar","ask","anthropic","claude-haiku-4-5-20251001",900,500,100,"2026-09-17 12:10:00"),
        )
        self.connection.commit()

        data = _aggregate(self.connection, "northstar", datetime(2026, 9, 17, 13, 0, tzinfo=timezone.utc))
        reliability = data["reliability"]
        self.assertEqual(reliability["model_latency_ms"]["sample_size"], 3)
        self.assertEqual(reliability["model_latency_ms"]["p50"], 1500.0)
        self.assertEqual(reliability["token_usage"]["input"], 3500)
        self.assertEqual(reliability["token_usage"]["output"], 700)
        self.assertEqual(reliability["model_calls_by_operation"], {"interpretation": 2, "ask": 1})
        self.assertAlmostEqual(reliability["model_cost"]["estimated_usd"], 0.007, places=6)
        self.assertEqual(reliability["model_cost"]["pricing_as_of"], "2026-10-10")
        columns = {info[1] for info in self.connection.execute("PRAGMA table_info(model_call_metrics)")}
        for forbidden in ("prompt", "content", "answer", "evidence", "query"):
            self.assertNotIn(forbidden, columns)

    def test_live_stream_ask_latency_uses_browser_visible_timings_only(self):
        now = datetime(2026, 9, 17, 13, 0, tzinfo=timezone.utc)
        rows = [
            ("old-server","ask_completed",None,12,"success"),
            ("first-1","ask_first_response","live_stream",4200,"visible_answer_started"),
            ("done-1","ask_user_completed","live_stream",7600,"visible_answer_complete"),
            ("first-2","ask_first_response","live_stream",5000,"visible_answer_started"),
            ("done-2","ask_user_completed","live_stream",9000,"visible_answer_complete"),
        ]
        for event_id,name,source_type,duration_ms,outcome in rows:
            self.connection.execute(
                "INSERT INTO product_analytics_events("
                "id,event_name,project_id,environment,source_type,duration_ms,outcome,occurred_at"
                ") VALUES (?,?,?,?,?,?,?,?)",
                (event_id,name,"northstar","production",source_type,duration_ms,outcome,"2026-09-17 12:00:00"),
            )
        self.connection.commit()

        data = _aggregate(self.connection, "northstar", now)
        reliability = data["reliability"]
        self.assertEqual(reliability["ask_first_response_ms"], {"sample_size": 2, "p50": 4600.0, "p95": 4960.0})
        self.assertEqual(reliability["ask_latency_ms"], {"sample_size": 2, "p50": 8300.0, "p95": 8930.0})
        self.assertIn("Browser-measured live streamed Ask requests only", reliability["ask_latency_note"])

    def test_no_composite_health_score(self):
        data = _aggregate(self.connection, None, datetime.now(timezone.utc))
        self.assertNotIn("health_score", str(data).lower())
        self.assertFalse(data["privacy"]["content_included"])


class ModelRatesTests(unittest.TestCase):
    def test_haiku_55_uses_short_and_long_prompt_tiers(self):
        from product_analytics import _estimated_model_cost
        short = _estimated_model_cost({"model_identifier": "claude-haiku-5-5", "input_tokens": 50_000, "output_tokens": 10_000})
        long = _estimated_model_cost({"model_identifier": "claude-haiku-5-5", "input_tokens": 150_000, "output_tokens": 0})
        self.assertAlmostEqual(short, (50_000 * 0.10 + 10_000 * 0.50) / 1_000_000, places=9)
        self.assertAlmostEqual(long, 150_000 * 0.50 / 1_000_000, places=6)

    def test_haiku_45_rows_keep_their_historical_rate(self):
        from product_analytics import _estimated_model_cost
        cost = _estimated_model_cost({"model_identifier": "claude-haiku-4-5-20251001", "input_tokens": 1_000_000, "output_tokens": 0})
        self.assertAlmostEqual(cost, 1.0, places=6)


if __name__ == "__main__":
    unittest.main()
