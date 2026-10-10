"""The `state` Vercel project's Ignored Build Step (implementation-context-prototype/vercel.json).

Vercel skips the build on exit 0, builds on exit 1, and FAILS the deployment on any other
exit code. History:
- Sept 20: compared against VERCEL_GIT_PREVIOUS_SHA; on Sept 26 a shallow clone lacked that
  commit, `git diff` exited 128 and the deploy failed.
- Sept 26: tip commit only (HEAD^..HEAD). Safe, but a deploy refused by Vercel's daily rate
  limit was then never retried by a later push whose tip did not touch the folder (Oct 10).
- Oct 10 (Paige's OK): compare with the last deployed commit again, but build whenever that
  cannot be checked, and only ever exit 0 or 1.

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
COMMAND = json.loads((ROOT / "implementation-context-prototype" / "vercel.json").read_text())["ignoreCommand"]

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
    # Vercel runs the command from the project's Root Directory.
    return subprocess.run(["sh", "-c", COMMAND], cwd=repo / "app", env=env, capture_output=True).returncode


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    _git(r, "init", "-q")
    _commit(r, "app/index.html", "v1")
    _commit(r, "docs/readme.md", "v1")
    return r


def test_first_deploy_builds(repo):
    assert _run(repo, None) == 1
    assert _run(repo, "") == 1


def test_redeploying_the_same_commit_builds(repo):
    assert _run(repo, _git(repo, "rev-parse", "HEAD")) == 1


def test_an_unknown_previous_commit_builds_instead_of_failing(repo):
    assert _run(repo, "0123456789abcdef0123456789abcdef01234567") == 1


def test_a_change_in_the_app_folder_builds(repo):
    previous = _git(repo, "rev-parse", "HEAD")
    _commit(repo, "app/index.html", "v2")
    assert _run(repo, previous) == 1


def test_a_change_only_outside_the_app_folder_skips(repo):
    previous = _git(repo, "rev-parse", "HEAD")
    _commit(repo, "docs/readme.md", "v2")
    assert _run(repo, previous) == 0


def test_an_app_change_hidden_behind_a_docs_only_tip_still_builds(repo):
    """The case the tip-commit rule got wrong (Sept 20, and the rate-limited deploy on Oct 10)."""
    previous = _git(repo, "rev-parse", "HEAD")
    _commit(repo, "app/index.html", "v2")
    _commit(repo, "docs/readme.md", "v2")
    assert _run(repo, previous) == 1


def test_a_shallow_clone_without_the_previous_commit_builds(repo, tmp_path):
    """The Sept 26 failure: `git diff` exited 128 and Vercel failed the deployment."""
    previous = _git(repo, "rev-parse", "HEAD")
    _commit(repo, "docs/readme.md", "v2")
    _commit(repo, "docs/readme.md", "v3")
    shallow = tmp_path / "shallow"
    subprocess.run(["git", "clone", "-q", "--depth", "1", f"file://{repo}", str(shallow)], check=True, capture_output=True)
    assert _run(shallow, previous) == 1


def test_the_command_only_ever_exits_0_or_1():
    assert COMMAND.rstrip().endswith("&& exit 0 || exit 1")


def test_the_command_fits_vercels_length_limit():
    """Vercel rejects vercel.json (\"Deployment failed\") when ignoreCommand exceeds 256 characters (Oct 10: 261)."""
    assert len(COMMAND) <= 256
