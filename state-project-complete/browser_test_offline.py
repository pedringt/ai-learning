"""#666: browser tests that open State's own page must not reach the live staging API.

Loaded from file:// or localhost, context-api.js points at state-api-staging.onrender.com, so these tests made real
network calls in qa-fast, and when a response (or failure) arrived late the page re-rendered while a test was
measuring it. Aborting those calls makes every load fail fast and the same way, as it already did on most machines.
"""
from __future__ import annotations

from typing import Any

LIVE_API = "**/*.onrender.com/**"

_LOADED_JS = """() => {
  const t = window.STATE_ASK_TEST_API;
  if (!t) return false;
  const s = t.state;
  return s.workspaceAttentionStatus !== 'loading' && Object.values(s.backendStatus).every(v => v !== 'loading');
}"""


def isolate_from_live_api(target: Any) -> None:
    """Abort every request to the live API from this page or browser context. Call before navigating."""
    target.route(LIVE_API, lambda route: route.abort())


def wait_until_loaded(page: Any, timeout: float = 10_000) -> None:
    """Wait until the app has finished trying to load project data, so no load-time render lands mid-measurement."""
    page.wait_for_function(_LOADED_JS, timeout=timeout)
