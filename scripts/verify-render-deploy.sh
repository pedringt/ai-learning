#!/usr/bin/env bash
# Verify a Render backend is actually serving the commit you just pushed,
# instead of trusting Render's own deploy-status API.
#
# Why this exists (2026-09-14 incident): Render's deploys API reported the
# correct commit as "live" while the running process was still serving the
# PREVIOUS deploy's code (missing an API field added in the new commit,
# causing every request that used it to fail with a 422). A cache-cleared
# manual redeploy fixed it. /health already reports the real running
# commit via Render's own RENDER_GIT_COMMIT env var (see api.py's
# _build_rev()) -- this script just polls that until it matches what you
# expect, so "the deploy finished" and "the right code is actually running"
# are checked as two separate facts, not inferred from one API status.
#
# Usage:
#   scripts/verify-render-deploy.sh <health-url> [expected-sha] [timeout-seconds]
#
# Examples:
#   scripts/verify-render-deploy.sh https://state-api-staging.onrender.com/health
#   scripts/verify-render-deploy.sh https://state-api-staging.onrender.com/health $(git rev-parse HEAD) 300
#
# expected-sha defaults to the current `git rev-parse HEAD`.
# timeout-seconds defaults to 300 (5 minutes); poll interval is 10s.
#
# Exit codes: 0 = verified match. 1 = timed out without matching (treat the
# deploy as NOT verified -- do not proceed to smoke-test or promote).

set -euo pipefail

URL="${1:?Usage: $0 <health-url> [expected-sha] [timeout-seconds]}"
EXPECTED_FULL="${2:-$(git rev-parse HEAD)}"
TIMEOUT="${3:-300}"
INTERVAL=10

# /health truncates to 12 chars (see api.py's _build_rev()).
EXPECTED="${EXPECTED_FULL:0:12}"

echo "Verifying $URL serves commit $EXPECTED (full: $EXPECTED_FULL)"

elapsed=0
last_seen=""
while [ "$elapsed" -lt "$TIMEOUT" ]; do
  body="$(curl -fsS --max-time 15 "$URL" 2>/dev/null || true)"
  seen="$(printf '%s' "$body" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("build",""))
except Exception:
    print("")' 2>/dev/null || true)"

  if [ "$seen" != "$last_seen" ]; then
    echo "  [$elapsed s] /health build = ${seen:-<no response>}"
    last_seen="$seen"
  fi

  if [ -n "$seen" ] && [ "$seen" = "$EXPECTED" ]; then
    echo "VERIFIED: $URL is serving $EXPECTED"
    exit 0
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

echo "NOT VERIFIED: $URL never reported build=$EXPECTED within ${TIMEOUT}s (last seen: ${last_seen:-<none>})"
echo "Do not treat this deploy as confirmed. If Render's dashboard already says 'live', the cache-cleared-redeploy incident shows that alone is not sufficient -- trigger a redeploy with build cache cleared and re-run this script."
exit 1
