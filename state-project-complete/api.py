"""FastAPI wrapper for State's interpretation and human-review workflows."""

from __future__ import annotations

import os
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Iterator, Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from anthropic_provider import AnthropicProvider
from database_migration_backed import initialize_db
from interpretation_pipeline_integrated import InterpretationProvider, new_id, process_evidence
from openai_provider import OpenAIProvider
from review_service import (
    ReviewConflictError,
    ReviewNotFoundError,
    list_history,
    list_reviews,
    list_state,
    resolve_review,
)


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    database_path: str = "data/state.db"
    provider: Literal["anthropic", "openai"] = "anthropic"
    cors_origins: list[str] = []

    @classmethod
    def from_env(cls) -> "Settings":
        origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:8000").split(",") if x.strip()]
        return cls(
            database_path=os.getenv("DATABASE_PATH", "data/state.db"),
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


def _provider_from_env(settings: Settings) -> InterpretationProvider:
    if settings.provider == "anthropic":
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY is required when STATE_PROVIDER=anthropic")
        return AnthropicProvider(api_key=os.environ["ANTHROPIC_API_KEY"])
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required when STATE_PROVIDER=openai")
    return OpenAIProvider(api_key=os.environ["OPENAI_API_KEY"])


def create_app(settings: Settings | None = None, provider: InterpretationProvider | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    db_path = Path(settings.database_path).expanduser().resolve()

    @contextmanager
    def connect() -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            yield connection
        finally:
            connection.close()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with connect() as connection:
            initialize_db(connection)
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

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/api/evidence", status_code=201)
    def interpret_evidence(payload: EvidenceInput, request: Request) -> dict:
        evidence_id = new_id("evidence")
        selected_provider = request.app.state.provider
        if selected_provider is None:
            try:
                selected_provider = _provider_from_env(settings)
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
        with connect() as connection:
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
                    "SELECT error_code FROM interpretation_records WHERE id=?", (result.interpretation_record_id,)
                ).fetchone()
                raise HTTPException(status_code=422, detail={
                    "code": record["error_code"], "evidence_id": evidence_id,
                    "interpretation_record_id": result.interpretation_record_id,
                })
            return {
                "evidence_id": evidence_id,
                "interpretation_record_id": result.interpretation_record_id,
                "processing_status": result.processing_status,
                "reviews": created_reviews,
            }

    @app.get("/api/state")
    def get_state() -> dict:
        with connect() as connection:
            return {"items": list_state(connection)}

    @app.get("/api/reviews")
    def get_reviews(status: Literal["open", "resolved"] = Query(default="open")) -> dict:
        with connect() as connection:
            return {"items": list_reviews(connection, status)}

    @app.post("/api/reviews/{review_id}/resolve")
    def post_resolution(review_id: str, payload: ResolutionInput) -> dict:
        with connect() as connection:
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

    @app.get("/api/history")
    def get_history() -> dict:
        with connect() as connection:
            return {"items": list_history(connection)}

    return app


app = create_app()
