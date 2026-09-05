"""Slack request signature verification.

Implements Slack's signing-secret scheme: verify a request came from Slack
and reject stale/replayed requests before any payload is parsed or
processed. See https://api.slack.com/authentication/verifying-requests-from-slack.
"""

from __future__ import annotations

import hashlib
import hmac
import time

REPLAY_WINDOW_SECONDS = 5 * 60


class SlackSignatureError(Exception):
    """Raised when a request fails Slack signature or replay verification."""


def verify_slack_request(
    *,
    signing_secret: str,
    timestamp_header: str | None,
    signature_header: str | None,
    raw_body: bytes,
    now: float | None = None,
) -> None:
    """Verify a Slack request's timestamp and HMAC signature.

    Raises SlackSignatureError on any failure. Callers must not parse or act
    on the payload unless this returns without raising.
    """
    if not timestamp_header or not signature_header:
        raise SlackSignatureError("Missing Slack signature headers")

    try:
        timestamp = int(timestamp_header)
    except ValueError as exc:
        raise SlackSignatureError("Malformed Slack request timestamp") from exc

    current_time = time.time() if now is None else now
    if abs(current_time - timestamp) > REPLAY_WINDOW_SECONDS:
        raise SlackSignatureError("Stale or replayed Slack request timestamp")

    basestring = b"v0:" + str(timestamp).encode("ascii") + b":" + raw_body
    digest = hmac.new(signing_secret.encode("utf-8"), basestring, hashlib.sha256).hexdigest()
    expected_signature = f"v0={digest}"

    if not hmac.compare_digest(expected_signature, signature_header):
        raise SlackSignatureError("Invalid Slack request signature")
