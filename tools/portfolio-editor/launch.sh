#!/bin/zsh
# Starts the portfolio editor (#617) if it isn't running and opens it in the
# default browser. The "Edit Portfolio" app runs this with a config.sh beside
# it; see make-app.sh.
set -u
here="${0:A:h}"
CONTENT_DIR="$HOME/code/portfolio-content"
BASE_BRANCH=staging
PUBLISH=on
PORT=4317
REMOTE=https://github.com/pedringt/ai-learning.git
[[ -f "$here/config.sh" ]] && source "$here/config.sh"

url="http://127.0.0.1:$PORT/"
log="$HOME/Library/Logs/portfolio-editor.log"
fail(){
  osascript -e "display dialog \"$1\" with title \"Edit Portfolio\" buttons {\"OK\"} default button 1 with icon caution" >/dev/null 2>&1
  exit 1
}

if ! curl -fsS -o /dev/null "${url}__editor/api/ping" 2>/dev/null; then
  node="$(command -v node || true)"
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    [[ -z "$node" && -x "$candidate" ]] && node="$candidate"
  done
  [[ -n "$node" ]] || fail "Node.js isn't installed, so the editor can't start. Ask Claude to set it up."

  # Bring the drafts clone up to date first, so this launch already runs the
  # newest editor code. Any conflict is left for the editor to report.
  if [[ -d "$CONTENT_DIR/.git" && -z "$(git -C "$CONTENT_DIR" status --porcelain 2>/dev/null)" ]]; then
    git -C "$CONTENT_DIR" fetch -q origin 2>/dev/null &&
      { git -C "$CONTENT_DIR" rebase -q "origin/$BASE_BRANCH" >/dev/null 2>&1 || git -C "$CONTENT_DIR" rebase --abort >/dev/null 2>&1; }
  fi

  # Prefer the editor code in the drafts clone, so it updates with the site;
  # fall back to the copy inside this app on the first run.
  server="$CONTENT_DIR/tools/portfolio-editor/server.js"
  [[ -f "$server" ]] || server="$here/server.js"
  [[ -f "$server" ]] || fail "The editor files are missing. Ask Claude to rebuild the Edit Portfolio app."

  extra=()
  [[ "$PUBLISH" == off ]] && extra+=(--no-publish)
  mkdir -p "${log:h}"
  nohup "$node" "$server" --content "$CONTENT_DIR" --base "$BASE_BRANCH" --port "$PORT" --remote "$REMOTE" "${extra[@]}" >>"$log" 2>&1 &

  # The first run downloads the site, which can take a minute or two.
  for i in {1..180}; do
    curl -fsS -o /dev/null "${url}__editor/api/ping" 2>/dev/null && break
    kill -0 $! 2>/dev/null || fail "The editor stopped while starting. Ask Claude to check $log."
    sleep 1
  done
  curl -fsS -o /dev/null "${url}__editor/api/ping" 2>/dev/null || fail "The editor didn't start in time. Ask Claude to check $log."
fi

# PE_NO_OPEN=1 starts the editor without opening a browser (for checks).
[[ -n "${PE_NO_OPEN:-}" ]] || open "$url"
