"""FastAPI wrapper for State's interpretation and human-review workflows."""

from __future__ import annotations

import asyncio
import json
import os
from collections import OrderedDict
from contextlib import asynccontextmanager, contextmanager
from copy import deepcopy
from threading import Lock
from typing import Literal
import logging
import secrets
import uuid
import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from anthropic_provider import AnthropicProvider
from database_migration_backed import initialize_db
from db import connect
from interpretation_pipeline_integrated import InterpretationProvider, new_id, process_evidence
from openai_provider import OpenAIProvider
from seed_demo import bootstrap_demo_data, reset_demo_data
from ask_contract import AskRequest
from ask_provider import LiveAskProvider
from ask_service import ask_cache_key, run_ask, stream_ask_events
from slack_intake_service import (
    DEFAULT_QUIET_WINDOW_SECONDS,
    ensure_channel_approved,
    handle_slack_event,
    run_checkpoint_poll_loop,
)
from slack_oauth_service import SlackOAuthError, build_authorize_url, exchange_code_for_token, save_connection
from slack_relevance_service import ProviderRelevanceClassifier, run_relevance_poll_loop
from slack_signing import SlackSignatureError, verify_slack_request
def _build_rev() -> str:
    """Identify the running build.

    Render injects RENDER_GIT_COMMIT with the deployed commit SHA, so /health
    reports what is actually running rather than a string someone remembered to
    edit. The previous hand-maintained literal could -- and did -- outlive the
    commit it named. The fallback keeps local runs and non-Render hosts honest
    about being exactly that.
    """
    sha = (os.getenv("RENDER_GIT_COMMIT") or "").strip()
    if sha:
        return sha[:12]
    return os.getenv("STATE_BUILD_REV", "local-dev").strip() or "local-dev"


STATE_BUILD_REV = _build_rev()
logger = logging.getLogger("state.api")


from review_service import (
    ReviewConflictError,
    ReviewNotFoundError,
    list_evidence,
    list_history,
    list_reviews,
    list_state,
    list_questions,
    create_question,
    stop_question,
    list_project_rules,
    create_project_rule,
    delete_project_rule,
    list_draft_notes,
    create_draft_note,
    update_draft_note,
    delete_draft_note,
    update_question_blocking,
    resolve_review,
)


class AskResponseCache:
    """Small process-local cache for repeated, unchanged grounded questions."""

    def __init__(self, max_entries: int = 32):
        self.max_entries = max_entries
        self._items: OrderedDict[str, dict] = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> dict | None:
        with self._lock:
            value = self._items.get(key)
            if value is None:
                return None
            self._items.move_to_end(key)
            result = deepcopy(value)
            timing = result.setdefault("timing", {})
            timing["cache_hit"] = True
            # Report this response's own cost, not the original call's. Carrying
            # the first request's provider_ms forward made a sub-millisecond
            # cache hit read as a 68-second model call in the logs.
            timing["provider_ms"] = 0
            timing["context_ms"] = 0
            timing["validation_ms"] = 0
            timing["total_ms"] = 0
            return result

    def put(self, key: str, value: dict) -> None:
        with self._lock:
            self._items[key] = deepcopy(value)
            self._items.move_to_end(key)
            while len(self._items) > self.max_entries:
                self._items.popitem(last=False)


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    database_url: str | None = None
    # Backward-compatible local/test path. Production should use DATABASE_URL.
    database_path: str | None = None
    provider: Literal["anthropic", "openai"] = "anthropic"
    cors_origins: list[str] = Field(default_factory=list)
    demo_bootstrap: bool = False
    slack_signing_secret: str | None = None
    # Single-workspace validation guard for Phase 1: when set, events from any
    # other team_id are rejected before any processing, so a staging Slack
    # app cannot feed a production deployment (or vice versa).
    slack_team_id: str | None = None
    # Opt-in: unset means the checkpoint quiet-window poll loop does not run
    # at all (used for local dev and tests). Set SLACK_CHECKPOINT_POLL_SECONDS
    # to enable it in a deployed environment.
    slack_checkpoint_poll_seconds: int | None = None
    # There is no admin UI for channel approval in Phase 1, and staging's
    # database is ephemeral (SQLite on the container, reset on every
    # redeploy). Approving the test channel at startup -- the same way demo
    # data already re-seeds on startup -- means it survives every redeploy
    # without a manual DB step.
    slack_test_channel_id: str | None = None
    slack_test_channel_name: str | None = None
    # Opt-in like slack_checkpoint_poll_seconds: unset means the Phase 2
    # relevance-evaluation loop does not run (local dev and tests, and any
    # deployment that hasn't explicitly turned it on). Set
    # SLACK_RELEVANCE_POLL_SECONDS to enable it.
    slack_relevance_poll_seconds: int | None = None
    # The self-serve "Connect Slack" OAuth flow. All four must be set for
    # the Connect button to work; public_base_url/frontend_base_url are
    # required (not derived from the incoming request) because this service
    # runs behind Render's proxy without --proxy-headers, so request.base_url
    # would report plain http and silently mismatch the https redirect_uri
    # registered in the Slack app.
    slack_client_id: str | None = None
    slack_client_secret: str | None = None
    public_base_url: str | None = None
    frontend_base_url: str | None = None
    environment: str = "staging"

    def connection_url(self) -> str:
        if self.database_url:
            return self.database_url
        if self.database_path:
            return f"sqlite://{self.database_path}"
        raise RuntimeError("No database configured")

    @classmethod
    def from_env(cls) -> "Settings":
        origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:8000").split(",") if x.strip()]
        database_url = os.getenv("DATABASE_URL")
        return cls(
            database_url=database_url,
            provider=os.getenv("STATE_PROVIDER", "anthropic").lower(),
            cors_origins=origins,
            # This repository is the Northstar demo. Default the realistic demo
            # bootstrap on for environment-loaded deployments so an existing
            # Render service does not depend on Blueprint env-var resync. Set
            # STATE_DEMO_BOOTSTRAP=0 to disable it explicitly.
            demo_bootstrap=os.getenv("STATE_DEMO_BOOTSTRAP", "1").strip().lower() in {"1", "true", "yes"},
            slack_signing_secret=os.getenv("SLACK_SIGNING_SECRET"),
            slack_team_id=os.getenv("SLACK_TEAM_ID"),
            slack_checkpoint_poll_seconds=(
                int(raw) if (raw := os.getenv("SLACK_CHECKPOINT_POLL_SECONDS", "").strip()).isdigit() else None
            ),
            slack_test_channel_id=os.getenv("SLACK_TEST_CHANNEL_ID"),
            slack_test_channel_name=os.getenv("SLACK_TEST_CHANNEL_NAME", "state-test"),
            slack_relevance_poll_seconds=(
                int(raw) if (raw := os.getenv("SLACK_RELEVANCE_POLL_SECONDS", "").strip()).isdigit() else None
            ),
            slack_client_id=os.getenv("SLACK_CLIENT_ID"),
            slack_client_secret=os.getenv("SLACK_CLIENT_SECRET"),
            public_base_url=(os.getenv("STATE_PUBLIC_BASE_URL", "").strip().rstrip("/") or None),
            frontend_base_url=(os.getenv("STATE_FRONTEND_BASE_URL", "").strip().rstrip("/") or None),
            environment=os.getenv("STATE_ENVIRONMENT", "staging").strip().lower(),
        )


class EvidenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=100_000)
    source_type: str = Field(default="manual_note", min_length=1, max_length=80)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class ResolutionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["accept", "keep", "reject"]
    note: str | None = Field(default=None, max_length=2_000)


class ProjectRuleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=2_000)
    category: Literal["Authority", "Review", "Sources", "Interpretation"] = "Interpretation"

    @field_validator("text")
    @classmethod
    def rule_text_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be blank")
        return value


class DraftNoteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="Untitled note", max_length=300)
    content: str = Field(min_length=1, max_length=100_000)

    @field_validator("content")
    @classmethod
    def draft_content_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class DraftNoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="Untitled note", max_length=300)
    content: str = Field(min_length=1, max_length=100_000)

    @field_validator("content")
    @classmethod
    def draft_update_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class SlackChannelUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    include_threads: bool | None = None
    include_bots: bool | None = None


class QuestionBlockingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    blocking: bool
    blocks: str | None = Field(default=None, max_length=500)

    @field_validator("blocks")
    @classmethod
    def normalize_blocks(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class QuestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=2_000)
    origin: str = Field(default="Added from Workspace", min_length=1, max_length=200)
    blocking: bool = False
    blocks: str | None = Field(default=None, max_length=500)

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be blank")
        return value

    @field_validator("blocks")
    @classmethod
    def blocker_requires_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


def _provider_from_env(settings: Settings) -> InterpretationProvider:
    if settings.provider == "anthropic":
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY is required when STATE_PROVIDER=anthropic")
        model = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
        return AnthropicProvider(
            model_identifier=model,
            api_key=os.environ["ANTHROPIC_API_KEY"]
        )
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required when STATE_PROVIDER=openai")
    return OpenAIProvider(api_key=os.environ["OPENAI_API_KEY"])


def create_app(settings: Settings | None = None, provider: InterpretationProvider | None = None, ask_provider=None) -> FastAPI:
    settings = settings or Settings.from_env()

    @contextmanager
    def get_connection():
        """Get a database connection using the unified abstraction."""
        connection = connect(settings.connection_url())
        try:
            yield connection
        finally:
            connection.close()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        """Initialize database on startup."""
        logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
        logger.info("Starting build %s", STATE_BUILD_REV)
        with get_connection() as connection:
            initialize_db(connection)
            if settings.demo_bootstrap:
                seeded = bootstrap_demo_data(connection)
                logger.info("Demo bootstrap: %s", seeded)
            if settings.slack_team_id and settings.slack_test_channel_id:
                ensure_channel_approved(
                    connection,
                    team_id=settings.slack_team_id,
                    channel_id=settings.slack_test_channel_id,
                    channel_name=settings.slack_test_channel_name,
                )
                connection.commit()
        if app.state.provider is None:
            try:
                app.state.provider = _provider_from_env(settings)
            except RuntimeError as exc:
                logger.warning("Provider not initialized at startup: %s", exc)
        if app.state.ask_provider is None and app.state.provider is not None:
            app.state.ask_provider = LiveAskProvider(app.state.provider)
        checkpoint_task = None
        if settings.slack_checkpoint_poll_seconds:
            checkpoint_task = asyncio.create_task(
                run_checkpoint_poll_loop(get_connection, settings.slack_checkpoint_poll_seconds, logger)
            )
        relevance_task = None
        if settings.slack_relevance_poll_seconds:
            if app.state.provider is None:
                logger.warning(
                    "SLACK_RELEVANCE_POLL_SECONDS is set but no provider is configured; "
                    "relevance evaluation will not run."
                )
            else:
                relevance_task = asyncio.create_task(
                    run_relevance_poll_loop(
                        get_connection,
                        ProviderRelevanceClassifier(app.state.provider),
                        app.state.provider,
                        settings.slack_relevance_poll_seconds,
                        logger,
                    )
                )
        yield
        for task in (checkpoint_task, relevance_task):
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    app = FastAPI(title="State API", version="0.1.0", lifespan=lifespan)
    app.state.provider = provider
    app.state.ask_provider = ask_provider
    app.state.ask_cache = AskResponseCache()
    app.state.settings = settings
    # CSRF guard for the OAuth redirect round trip: a short-lived, single-use
    # token minted at /oauth/start and consumed at /oauth/callback. In-memory
    # is fine for a single-instance service (WEB_CONCURRENCY=1); a lost token
    # on restart just means an in-flight OAuth attempt has to be retried.
    app.state.slack_oauth_states = {}
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request id=%s method=%s path=%s status=%s elapsed_ms=%.0f",
            request_id, request.method, request.url.path, response.status_code, elapsed_ms,
        )
        return response

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "build": STATE_BUILD_REV, "demo_bootstrap": settings.demo_bootstrap}

    @app.get("/api/bootstrap")
    def get_bootstrap() -> dict:
        """Load the project workspace in one round trip."""
        with get_connection() as connection:
            return {
                "state": list_state(connection),
                "evidence": list_evidence(connection),
                "open_reviews": list_reviews(connection, "open"),
                "resolved_reviews": list_reviews(connection, "resolved"),
                "history": list_history(connection),
                "questions": list_questions(connection, "open"),
                "rules": list_project_rules(connection),
                "drafts": list_draft_notes(connection),
            }

    @app.get("/api/attention")
    def get_attention() -> dict:
        """Load only the action items needed for the first Workspace view."""
        with get_connection() as connection:
            return {
                "open_reviews": list_reviews(connection, "open"),
                "questions": list_questions(connection, "open"),
            }

    @app.post("/api/demo/reset")
    def post_demo_reset() -> dict:
        if not settings.demo_bootstrap:
            raise HTTPException(status_code=404, detail="Demo reset is unavailable")
        with get_connection() as connection:
            counts = reset_demo_data(connection)
            return {"status": "reset", "counts": counts, "seeded": counts}

    @app.get("/api/drafts")
    def get_drafts() -> dict:
        with get_connection() as connection:
            return {"items": list_draft_notes(connection)}

    @app.post("/api/drafts", status_code=201)
    def post_draft(payload: DraftNoteInput) -> dict:
        with get_connection() as connection:
            return create_draft_note(connection, new_id("draft"), payload.title, payload.content)

    @app.patch("/api/drafts/{draft_id}")
    def patch_draft(draft_id: str, payload: DraftNoteUpdate) -> dict:
        with get_connection() as connection:
            try:
                return update_draft_note(connection, draft_id, payload.title, payload.content)
            except ReviewNotFoundError as exc:
                raise HTTPException(status_code=404, detail="Draft note not found") from exc

    @app.delete("/api/drafts/{draft_id}")
    def delete_draft(draft_id: str) -> dict:
        with get_connection() as connection:
            try:
                delete_draft_note(connection, draft_id)
            except ReviewNotFoundError as exc:
                raise HTTPException(status_code=404, detail="Draft note not found") from exc
            return {"draft_id": draft_id, "status": "deleted"}

    @app.post("/api/evidence", status_code=201)
    def interpret_evidence(payload: EvidenceInput, request: Request) -> dict:
        evidence_id = new_id("evidence")
        selected_provider = request.app.state.provider
        if selected_provider is None:
            try:
                selected_provider = _provider_from_env(settings)
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
        with get_connection() as connection:
            connection.execute(
                "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
                (evidence_id, payload.content.strip(), payload.source_type),
            )
            connection.commit()
            result = process_evidence(connection, evidence_id=evidence_id, provider=selected_provider)
            reviews = list_reviews(connection, "open")
            created_reviews = [item for item in reviews if item["id"] in result.review_ids]
            if result.processing_status == "failed":
                record = connection.execute(
                    "SELECT error_code, structured_result FROM interpretation_records WHERE id=?", (result.interpretation_record_id,)
                ).fetchone()
                error_code = record["error_code"]
                error_details = None
                try:
                    error_details = json.loads(record["structured_result"]) if record["structured_result"] else None
                except (json.JSONDecodeError, TypeError):
                    pass
                # Contract/semantic failures are client-visible 422s; provider
                # transport/timeouts/refusals are service failures and should
                # not masquerade as invalid Evidence.
                status_code = 503 if error_code == "provider_error" else 422
                public_error_details = error_details
                if error_code == "provider_error":
                    public_error_details = {
                        "error_message": "The analysis service could not complete this request. Please try again."
                    }
                raise HTTPException(status_code=status_code, detail={
                    "code": error_code,
                    "evidence_id": evidence_id,
                    "interpretation_record_id": result.interpretation_record_id,
                    "error_details": public_error_details,
                })
            return {
                "evidence_id": evidence_id,
                "interpretation_record_id": result.interpretation_record_id,
                "processing_status": result.processing_status,
                "reviews": created_reviews,
            }

    @app.post("/api/evidence/{evidence_id}/reanalyze")
    def reanalyze_evidence(evidence_id: str, request: Request) -> dict:
        selected_provider = request.app.state.provider
        if selected_provider is None:
            try:
                selected_provider = _provider_from_env(settings)
                request.app.state.provider = selected_provider
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
        with get_connection() as connection:
            exists = connection.execute("SELECT id FROM evidence WHERE id=?", (evidence_id,)).fetchone()
            if exists is None:
                raise HTTPException(status_code=404, detail="Evidence not found")
            result = process_evidence(connection, evidence_id=evidence_id, provider=selected_provider)
            reviews = list_reviews(connection, "open")
            created_reviews = [item for item in reviews if item["id"] in result.review_ids]
            if result.processing_status == "failed":
                record = connection.execute(
                    "SELECT error_code, structured_result FROM interpretation_records WHERE id=?",
                    (result.interpretation_record_id,),
                ).fetchone()
                error_code = record["error_code"]
                status_code = 503 if error_code == "provider_error" else 422
                raise HTTPException(status_code=status_code, detail={
                    "code": error_code,
                    "evidence_id": evidence_id,
                    "interpretation_record_id": result.interpretation_record_id,
                    "error_details": {"error_message": "The analysis service could not complete this request. Please retry analysis."},
                })
            return {
                "evidence_id": evidence_id,
                "interpretation_record_id": result.interpretation_record_id,
                "processing_status": result.processing_status,
                "reviews": created_reviews,
            }

    @app.get("/api/evidence")
    def get_evidence() -> dict:
        with get_connection() as connection:
            return {"items": list_evidence(connection)}

    @app.get("/api/state")
    def get_state() -> dict:
        with get_connection() as connection:
            return {"items": list_state(connection)}

    @app.get("/api/reviews")
    def get_reviews(status: Literal["open", "resolved"] = Query(default="open")) -> dict:
        with get_connection() as connection:
            return {"items": list_reviews(connection, status)}

    @app.post("/api/reviews/{review_id}/resolve")
    def post_resolution(review_id: str, payload: ResolutionInput) -> dict:
        with get_connection() as connection:
            try:
                resolve_review(connection, review_id, payload.decision, payload.note)
            except ReviewNotFoundError as exc:
                raise HTTPException(status_code=404, detail="Review not found") from exc
            except ReviewConflictError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            return {
                "review_id": review_id,
                "decision": payload.decision,
                "state": list_state(connection),
                "open_reviews": list_reviews(connection, "open"),
                "history": list_history(connection),
            }

    @app.get("/api/questions")
    def get_questions(status: Literal["open", "resolved", "stopped"] = Query(default="open")) -> dict:
        with get_connection() as connection:
            return {"items": list_questions(connection, status)}

    @app.post("/api/questions", status_code=201)
    def post_question(payload: QuestionInput) -> dict:
        if payload.blocking and not payload.blocks:
            raise HTTPException(status_code=422, detail="Blocking questions must name the concrete dependency they block")
        with get_connection() as connection:
            item = create_question(connection, new_id("question"), payload.text, origin=payload.origin, blocking=payload.blocking, blocks=payload.blocks)
            return item

    @app.patch("/api/questions/{question_id}/blocking")
    def patch_question_blocking(question_id: str, payload: QuestionBlockingInput) -> dict:
        if payload.blocking and not payload.blocks:
            raise HTTPException(status_code=422, detail="Blocking questions must name the concrete dependency they block")
        with get_connection() as connection:
            try:
                return update_question_blocking(connection, question_id, payload.blocking, payload.blocks)
            except ReviewNotFoundError as exc:
                raise HTTPException(status_code=404, detail="Open question not found") from exc

    @app.post("/api/questions/{question_id}/stop")
    def post_stop_question(question_id: str) -> dict:
        with get_connection() as connection:
            try:
                stop_question(connection, question_id)
            except ReviewNotFoundError as exc:
                raise HTTPException(status_code=404, detail="Open question not found") from exc
            return {"question_id": question_id, "status": "stopped"}

    @app.get("/api/rules")
    def get_project_rules() -> dict:
        with get_connection() as connection:
            return {"items": list_project_rules(connection)}

    @app.post("/api/rules", status_code=201)
    def post_project_rule(payload: ProjectRuleInput) -> dict:
        with get_connection() as connection:
            return create_project_rule(connection, new_id("rule"), payload.text, payload.category)

    @app.delete("/api/rules/{rule_id}")
    def delete_rule(rule_id: str) -> dict:
        with get_connection() as connection:
            try:
                delete_project_rule(connection, rule_id)
            except ReviewNotFoundError as exc:
                raise HTTPException(status_code=404, detail="Project rule not found") from exc
            return {"rule_id": rule_id, "status": "deleted"}

    @app.get("/api/history")
    def get_history() -> dict:
        with get_connection() as connection:
            return {"items": list_history(connection)}


    @app.post("/api/ask/stream")
    def post_ask_stream(payload: AskRequest, request: Request):
        selected_ask_provider = request.app.state.ask_provider
        if selected_ask_provider is None:
            selected_provider = request.app.state.provider
            if selected_provider is None:
                try:
                    selected_provider = _provider_from_env(settings)
                    request.app.state.provider = selected_provider
                except RuntimeError as exc:
                    raise HTTPException(status_code=503, detail=str(exc)) from exc
            selected_ask_provider = LiveAskProvider(selected_provider)
            request.app.state.ask_provider = selected_ask_provider

        def event_stream():
            try:
                with get_connection() as connection:
                    cache_key = ask_cache_key(connection, payload.query.strip(), payload.previous_answer)
                    cached = request.app.state.ask_cache.get(cache_key)
                    if cached is not None:
                        logger.info("Ask cache hit endpoint=stream")
                        yield f"event: final\ndata: {json.dumps(cached, ensure_ascii=False)}\n\n"
                        return
                    for event_name, event_payload in stream_ask_events(
                        connection, selected_ask_provider, payload.query.strip(), payload.previous_answer
                    ):
                        if event_name == "final":
                            request.app.state.ask_cache.put(cache_key, event_payload)
                        yield f"event: {event_name}\ndata: {json.dumps(event_payload, ensure_ascii=False)}\n\n"
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                logger.warning("Streaming Ask contract failure: %s", exc)
                yield "event: error\ndata: {\"message\": \"Ask could not produce a valid grounded answer\"}\n\n"
            except Exception:
                logger.exception("Streaming Ask provider failure")
                yield "event: error\ndata: {\"message\": \"Ask is temporarily unavailable. Please try again.\"}\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.post("/api/ask")
    def post_ask(payload: AskRequest, request: Request) -> dict:
        selected_ask_provider = request.app.state.ask_provider
        if selected_ask_provider is None:
            selected_provider = request.app.state.provider
            if selected_provider is None:
                try:
                    selected_provider = _provider_from_env(settings)
                    request.app.state.provider = selected_provider
                except RuntimeError as exc:
                    raise HTTPException(status_code=503, detail=str(exc)) from exc
            selected_ask_provider = LiveAskProvider(selected_provider)
            request.app.state.ask_provider = selected_ask_provider
        try:
            with get_connection() as connection:
                cache_key = ask_cache_key(connection, payload.query.strip(), payload.previous_answer)
                cached = request.app.state.ask_cache.get(cache_key)
                if cached is not None:
                    logger.info("Ask cache hit endpoint=standard")
                    return cached
                try:
                    result = run_ask(connection, selected_ask_provider, payload.query.strip(), payload.previous_answer)
                except (ValueError, TypeError) as first_exc:
                    # Model output can occasionally miss the grounded Ask contract even
                    # for a good query. Retry once with the same authoritative context
                    # before surfacing an error; invalid final output still fails closed.
                    logger.warning("Ask contract failure; retrying once: %s", first_exc)
                    result = run_ask(connection, selected_ask_provider, payload.query.strip(), payload.previous_answer)
                request.app.state.ask_cache.put(cache_key, result)
                timing = result.get("timing", {})
                logger.info(
                    "Ask timing pipeline=%s context_ms=%s provider_ms=%s validation_ms=%s total_ms=%s",
                    timing.get("pipeline"), timing.get("context_ms"), timing.get("provider_ms"),
                    timing.get("validation_ms"), timing.get("total_ms"),
                )
                return result
        except (ValueError, TypeError) as exc:
            logger.warning("Ask contract failure after retry: %s", exc)
            raise HTTPException(status_code=422, detail="Ask could not produce a valid grounded answer") from exc
        except Exception as exc:
            logger.exception("Ask provider failure")
            raise HTTPException(status_code=503, detail="Ask is temporarily unavailable. Please try again.") from exc

    @app.post("/api/integrations/slack/events")
    async def post_slack_events(request: Request) -> dict:
        """Slack Phase 1 deterministic intake boundary.

        Verifies the request, dedupes by Slack's event_id, and updates
        deterministic conversation/checkpoint state. Never calls a model,
        never creates Evidence/Review/Question, never mutates Current State.
        """
        if not settings.slack_signing_secret:
            raise HTTPException(status_code=503, detail="Slack integration is not configured")

        raw_body = await request.body()
        try:
            verify_slack_request(
                signing_secret=settings.slack_signing_secret,
                timestamp_header=request.headers.get("X-Slack-Request-Timestamp"),
                signature_header=request.headers.get("X-Slack-Signature"),
                raw_body=raw_body,
            )
        except SlackSignatureError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Malformed Slack event payload") from exc

        if payload.get("type") == "url_verification":
            return {"challenge": payload.get("challenge", "")}

        if settings.slack_team_id and payload.get("team_id") != settings.slack_team_id:
            raise HTTPException(status_code=403, detail="Unrecognized Slack workspace")

        if payload.get("type") != "event_callback":
            # Acknowledge quickly; Phase 1 only processes channel activity events.
            return {"ok": True}

        with get_connection() as connection:
            try:
                result = handle_slack_event(
                    connection, payload, quiet_window_seconds=DEFAULT_QUIET_WINDOW_SECONDS
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            connection.commit()
        # Structured, no message bodies: team/channel/event identifiers and
        # disposition only, per the Phase 1 observability contract.
        inner_event = payload.get("event") or {}
        logger.info(
            "slack_event team_id=%s channel_id=%s event_type=%s duplicate=%s disposition=%s",
            payload.get("team_id"), inner_event.get("channel"), inner_event.get("type"),
            result.get("duplicate"), result.get("disposition"),
        )
        return {"ok": True, **result}

    @app.get("/api/integrations/slack/channels")
    def get_slack_channels() -> dict:
        """Channels State knows about, with their approval config and basic activity.

        A channel only has a row once Slack has sent an event from it (or it
        was seeded via ensure_channel_approved at startup) -- there is no
        channel-discovery/OAuth flow yet, so this cannot list every channel
        in a workspace, only ones already seen.
        """
        with get_connection() as connection:
            rows = connection.execute(
                "SELECT id, team_id, channel_id, channel_name, enabled, include_threads, include_bots, "
                "ingestion_started_at FROM slack_channels ORDER BY channel_name, channel_id"
            ).fetchall()
            channels = []
            for row in rows:
                last_event = connection.execute(
                    "SELECT MAX(received_at) AS last_event_at FROM slack_events WHERE team_id=? AND channel_id=?",
                    (row["team_id"], row["channel_id"]),
                ).fetchone()
                channels.append({
                    "id": row["id"],
                    "team_id": row["team_id"],
                    "channel_id": row["channel_id"],
                    "channel_name": row["channel_name"],
                    "enabled": bool(row["enabled"]),
                    "include_threads": bool(row["include_threads"]),
                    "include_bots": bool(row["include_bots"]),
                    "ingestion_started_at": row["ingestion_started_at"],
                    "last_event_at": last_event["last_event_at"] if last_event else None,
                })
        return {"items": channels}

    @app.patch("/api/integrations/slack/channels/{channel_row_id}")
    def patch_slack_channel(channel_row_id: str, payload: SlackChannelUpdate) -> dict:
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        with get_connection() as connection:
            existing = connection.execute(
                "SELECT id FROM slack_channels WHERE id=?", (channel_row_id,)
            ).fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="Slack channel not found")
            set_clause = ", ".join(f"{field}=?" for field in updates)
            values = [int(v) if isinstance(v, bool) else v for v in updates.values()]
            connection.execute(
                f"UPDATE slack_channels SET {set_clause} WHERE id=?", (*values, channel_row_id)
            )
            connection.commit()
            row = connection.execute(
                "SELECT id, enabled, include_threads, include_bots FROM slack_channels WHERE id=?",
                (channel_row_id,),
            ).fetchone()
        return {
            "id": row["id"],
            "enabled": bool(row["enabled"]),
            "include_threads": bool(row["include_threads"]),
            "include_bots": bool(row["include_bots"]),
        }

    @app.get("/api/integrations/slack/health")
    def get_slack_health() -> dict:
        """Compact connection/activity health -- not raw logs. See
        docs/architecture/SLACK_INTEGRATION_PLAN.md, "Integration health"."""
        with get_connection() as connection:
            connection_row = connection.execute(
                "SELECT team_id, workspace_name, status, connected_at, last_event_at FROM slack_connections "
                "ORDER BY connected_at DESC LIMIT 1"
            ).fetchone()
            pending = connection.execute(
                "SELECT COUNT(*) AS pending FROM slack_checkpoints sc "
                "LEFT JOIN slack_checkpoint_evaluations sce ON sce.checkpoint_id = sc.id "
                "WHERE sce.id IS NULL"
            ).fetchone()
        if connection_row is None:
            return {"connected": False, "pending_checkpoints": pending["pending"] if pending else 0}
        return {
            "connected": connection_row["status"] == "connected",
            "workspace_name": connection_row["workspace_name"],
            "team_id": connection_row["team_id"],
            "connected_at": connection_row["connected_at"],
            "last_event_at": connection_row["last_event_at"],
            "pending_checkpoints": pending["pending"] if pending else 0,
        }

    @app.get("/api/integrations/slack/oauth/start")
    def slack_oauth_start() -> RedirectResponse:
        if not (settings.slack_client_id and settings.public_base_url):
            raise HTTPException(status_code=503, detail="Slack OAuth is not configured")
        state = secrets.token_urlsafe(24)
        app.state.slack_oauth_states[state] = time.time() + 600  # 10 minutes to complete the round trip
        redirect_uri = f"{settings.public_base_url}/api/integrations/slack/oauth/callback"
        return RedirectResponse(build_authorize_url(client_id=settings.slack_client_id, redirect_uri=redirect_uri, state=state))

    @app.get("/api/integrations/slack/oauth/callback")
    def slack_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
        if not settings.frontend_base_url:
            raise HTTPException(status_code=503, detail="Slack OAuth is not configured")
        landing = f"{settings.frontend_base_url}?slack_connect={{}}#settings-slack"

        expiry = app.state.slack_oauth_states.pop(state, None) if state else None
        state_is_valid = expiry is not None and expiry > time.time()

        if error or not code or not state_is_valid:
            logger.warning("Slack OAuth callback rejected: error=%s code_present=%s state_valid=%s", error, bool(code), state_is_valid)
            return RedirectResponse(landing.format("error"))

        if not (settings.slack_client_id and settings.slack_client_secret and settings.public_base_url):
            raise HTTPException(status_code=503, detail="Slack OAuth is not configured")

        redirect_uri = f"{settings.public_base_url}/api/integrations/slack/oauth/callback"
        try:
            payload = exchange_code_for_token(
                client_id=settings.slack_client_id, client_secret=settings.slack_client_secret,
                code=code, redirect_uri=redirect_uri,
            )
            team = payload.get("team") or {}
            with get_connection() as connection:
                save_connection(
                    connection, team_id=team.get("id", ""), workspace_name=team.get("name") or "",
                    bot_token=payload.get("access_token") or "", environment=settings.environment,
                )
        except SlackOAuthError as exc:
            logger.warning("Slack OAuth token exchange failed: %s", exc)
            return RedirectResponse(landing.format("error"))

        return RedirectResponse(landing.format("success"))

    return app


app = create_app()
