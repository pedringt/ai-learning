"""Shared JSON-extraction helper for provider adapters.

Models sometimes wrap a JSON response in markdown code fences despite being
asked not to. Both the Anthropic and OpenAI relevance-classification methods
need the same lenient extraction, so it lives here once instead of being
copy-pasted into each adapter.
"""

from __future__ import annotations

import json
import re
from typing import Any


def extract_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        raise
