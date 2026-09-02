"""FastAPI wrapper for State's interpretation and human-review workflows."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager, contextmanager
from typing import Literal
import logging
import uuid
import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from anthropic_provider import AnthropicProvider
from database_migration_backed import initialize_db
from db import connect
from interpretation_pipeline_integrated import InterpretationProvider, new_id, process_evidence
from openai_provider import OpenAIProvider
from seed_demo import bootstrap_demo_data
STATE_BUILD_REV = "r8-scale-qa-2026-09-02"
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
    resolve_review,
)


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    database_url: str | None = None
    # Backward-compatible local/test path. Production should use DATABASE_URL.
    database_path: str | None = None
    provider: Literal["anthropic", "openai"] = "anthropic"
    cors_origins: list[str] = Field(default_factory=list)

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


def create_app(settings: Settings | None = None, provider: InterpretationProvider | None = None) -> FastAPI:
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
            if os.getenv("STATE_DEMO_BOOTSTRAP", "").strip().lower() in {"1", "true", "yes"}:
                seeded = bootstrap_demo_data(connection)
                logger.info("Demo bootstrap: %s", seeded)
        if app.state.provider is None:
            try:
                app.state.provider = _provider_from_env(settings)
            except RuntimeError as exc:
                logger.warning("Provider not initialized at startup: %s", exc)
        yield

    app = FastAPI(title="State API", version="0.1.0", lifespan=lifespan)
    app.state.provider = provider
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
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
        return {"status": "ok", "build": STATE_BUILD_REV}

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

    @app.post("/api/questions/{question_id}/stop")
    def post_stop_question(question_id: str) -> dict:
        with get_connection() as connection:
            try:
                stop_question(connection, question_id)
            except ReviewNotFoundError as exc:
                raise HTTPException(status_code=404, detail="Open question not found") from exc
            return {"question_id": question_id, "status": "stopped"}

    @app.get("/api/history")
    def get_history() -> dict:
        with get_connection() as connection:
            return {"items": list_history(connection)}

    return app


app = create_app()
