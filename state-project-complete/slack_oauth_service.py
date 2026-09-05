"""Slack OAuth: the self-serve "Connect Slack" flow.

Distinct from slack_intake_service.py (which only ever *receives* Slack
events) and slack_relevance_service.py (which only ever calls an LLM) --
this is the one place State makes an outbound call to Slack's own API, to
exchange an OAuth authorization code for a bot token after a human
approves the install in Slack's UI.

Public channels only for now: matches the architecture doc's deferral of
private-channel visibility rules until an explicit rule exists for who in
State can see raw Slack source content.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable

from db import Connection
from interpretation_pipeline_integrated import new_id

SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
SLACK_OAUTH_ACCESS_URL = "https://slack.com/api/oauth.v2.access"

# channels:read lets a future feature resolve a channel's display name;
# channels:history is what receiving message events over the already
# -configured Events Subscription actually requires.
BOT_SCOPES = "channels:read,channels:history"


class SlackOAuthError(Exception):
    """Raised for any OAuth failure -- Slack rejected the code, or the
    request to Slack itself failed. Callers should treat this as a single
    "could not connect" case; the message is for logs, not end users."""


def build_authorize_url(*, client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "scope": BOT_SCOPES,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    return f"{SLACK_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


def exchange_code_for_token(
    *,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
    post: Callable[[str, bytes], bytes] | None = None,
) -> dict[str, Any]:
    """POST to Slack's oauth.v2.access and return the parsed response.

    `post` is injectable for tests (a callable taking url and form-encoded
    body bytes, returning the raw response body bytes) so no test needs a
    real network call.
    """
    body = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
    }).encode("utf-8")

    if post is not None:
        raw = post(SLACK_OAUTH_ACCESS_URL, body)
    else:
        request = urllib.request.Request(SLACK_OAUTH_ACCESS_URL, data=body, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read()
        except urllib.error.URLError as exc:
            raise SlackOAuthError(f"Could not reach Slack: {exc}") from exc

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise SlackOAuthError("Slack returned a non-JSON response") from exc

    if not payload.get("ok"):
        raise SlackOAuthError(payload.get("error", "unknown_error"))
    return payload


def disconnect_most_recent(connection: Connection) -> bool:
    """Mark the most recently connected workspace as disconnected.

    A testing/reset convenience (mirrors the existing "Reset example data"
    action's pragmatism, not a security-grade token revocation) -- clears
    the stored bot token and flips status, but does not call Slack's own
    auth.revoke API or affect whether the app is still installed in Slack.
    Returns False if there was nothing connected to disconnect.
    """
    row = connection.execute(
        "SELECT id FROM slack_connections WHERE status='connected' ORDER BY connected_at DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return False
    connection.execute("UPDATE slack_connections SET status='disconnected', bot_token=NULL WHERE id=?", (row["id"],))
    connection.commit()
    return True


def save_connection(connection: Connection, *, team_id: str, workspace_name: str, bot_token: str, environment: str) -> None:
    """Upsert the workspace connection. One row per team_id."""
    if not team_id:
        raise SlackOAuthError("Slack did not return a team id")
    existing = connection.execute(
        "SELECT id FROM slack_connections WHERE team_id=?", (team_id,)
    ).fetchone()
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing is None:
        connection.execute(
            "INSERT INTO slack_connections "
            "(id, team_id, workspace_name, status, environment, bot_token, connected_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (new_id("slkconn"), team_id, workspace_name, "connected", environment, bot_token, now_iso),
        )
    else:
        connection.execute(
            "UPDATE slack_connections SET workspace_name=?, status='connected', bot_token=?, connected_at=? "
            "WHERE id=?",
            (workspace_name, bot_token, now_iso, existing["id"]),
        )
    connection.commit()
