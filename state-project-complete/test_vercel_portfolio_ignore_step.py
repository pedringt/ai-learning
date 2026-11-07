"""The portfolio (`ai-learning`) Vercel project's Ignored Build Step (root vercel.json, #627).

Before Nov 7 it had none, so every push to main/staging rebuilt the portfolio, including backend-only and docs-only
pushes, against the Hobby plan's ~100 deployments a day shared with the `state` project. It follows the `state`
project's guarded rule (see test_vercel_ignore_step.py): skip only when nothing the site serves changed since the last
deployed commit, build whenever that cannot be checked, and only ever exit 0 or 1. "Not served" matches .vercelignore.

These tests run the real command from vercel.json in scratch git repos. No network.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
COMMAND = json.loads((ROOT / "vercel.json").read_text())["ignoreCommand"]

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="needs git")


def _git(repo: Path, *args: str) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["git", *args], cwd=repo, env=env, check=True, capture_output=True, text=True).stdout.strip()


def _commit(repo: Path, path: str, text: str) -> str:
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", path)
    return _git(repo, "rev-parse", "HEAD")


def _run(repo: Path, previous: str | None) -> int:
    env = {**os.environ}
    env.pop("VERCEL_GIT_PREVIOUS_SHA", None)
    if previous is not None:
        env["VERCEL_GIT_PREVIOUS_SHA"] = previous
    # The portfolio project's Root Directory is the repository root.
    return subprocess.run(["sh", "-c", COMMAND], cwd=repo, env=env, capture_output=True).returncode


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    _git(r, "init", "-q")
    for path in ("index.html", "docs/readme.md", "state-project-complete/api.py", "content/edge.md", "CLAUDE.md"):
        _commit(r, path, "v1")
    return r


def test_first_deploy_and_redeploys_build(repo):
    assert _run(repo, None) == 1
    assert _run(repo, "") == 1
    assert _run(repo, _git(repo, "rev-parse", "HEAD")) == 1


def test_an_unknown_previous_commit_builds_instead_of_failing(repo):
    assert _run(repo, "0123456789abcdef0123456789abcdef01234567") == 1


@pytest.mark.parametrize("path", ["docs/readme.md", "state-project-complete/api.py", "CLAUDE.md", "qa/deployed/x.spec.js",
                                  "scripts/x.sh", "tools/x.py", ".github/workflows/x.yml", "render.yaml", "Makefile"])
def test_changes_only_to_files_the_site_does_not_serve_skip(repo, path):
    previous = _git(repo, "rev-parse", "HEAD")
    _commit(repo, path, "v2")
    assert _run(repo, previous) == 0


@pytest.mark.parametrize("path", ["index.html", "content/edge.md", "api/new.js", "assets/x.png", "cheat-sheets/x.html",
                                  "implementation-context-prototype/index.html", "vercel.json", ".vercelignore", "new.css"])
def test_changes_to_served_files_or_deploy_config_build(repo, path):
    previous = _git(repo, "rev-parse", "HEAD")
    _commit(repo, path, "v2")
    assert _run(repo, previous) == 1


def test_a_site_change_hidden_behind_a_docs_only_tip_still_builds(repo):
    previous = _git(repo, "rev-parse", "HEAD")
    _commit(repo, "index.html", "v2")
    _commit(repo, "docs/readme.md", "v2")
    assert _run(repo, previous) == 1
