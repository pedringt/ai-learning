from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError, ValidationError


SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "structured_interpretation.schema.json"


class StructuredInterpretationSchemaError(ValueError):
    """Raised when provider output violates the application-owned JSON Schema."""

    def __init__(self, message: str, *, path: tuple[Any, ...] = ()) -> None:
        super().__init__(message)
        self.path = path


def _load_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


SCHEMA = _load_schema()
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())


def validate_schema(payload: Any) -> None:
    """Validate only the structural contract for StructuredInterpretation.

    This function intentionally has no database or context access. Passing this
    check means only that the payload has a legal application-owned shape; it
    does not mean State/Review references are valid or that the interpretation
    is correct.
    """

    errors = sorted(VALIDATOR.iter_errors(payload), key=lambda error: list(error.absolute_path))
    if not errors:
        return

    first = errors[0]
    path = tuple(first.absolute_path)
    location = "$" if not path else "$" + "".join(
        f"[{part}]" if isinstance(part, int) else f".{part}" for part in path
    )
    raise StructuredInterpretationSchemaError(
        f"schema_violation at {location}: {first.message}",
        path=path,
    )
