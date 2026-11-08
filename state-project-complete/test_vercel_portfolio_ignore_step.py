"""The portfolio (`ai-learning`) Vercel project's Ignored Build Step (root vercel.json, #627).

Before Nov 7 it had none, so every push to main/staging rebuilt the portfolio, including backend-only and docs-only
pushes, against the Hobby plan's ~100 deployments a day shared with the `state` project. The Nov 7 rule used `git diff`,
but the root .vercelignore allowlist removes `.git` before the step runs, so it never skipped (found Nov 8). It now runs
api/_vercel-ignore-build.js, which asks GitHub's compare API: skip only when every changed file is one the site never
serves, and build whenever that cannot be checked.

These tests drive the real script with a fake GitHub response. No network.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
COMMAND = json.loads((ROOT / "vercel.json").read_text())["ignoreCommand"]
SCRIPT = ROOT / "api" / "_vercel-ignore-build.js"
PREV, CUR = "a" * 40, "b" * 40

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="needs node")


def test_command_fits_vercels_256_character_limit_and_runs_the_script():
    """Vercel fails the deployment when ignoreCommand is longer than 256 characters (the first version was 379)."""
    assert len(COMMAND) <= 256
    assert COMMAND == "node api/_vercel-ignore-build.js"


def test_the_script_survives_the_root_allowlist():
    """The step runs after .vercelignore is applied, so the script must be in a re-included folder."""
    ignore = (ROOT / ".vercelignore").read_text().splitlines()
    assert "/*" in ignore and "!/api" in ignore


def _skip(previous, current, response):
    """response: a dict served as the compare JSON, an int HTTP status, or "throw"."""
    js = f"""
const {{shouldSkip}}=require({json.dumps(str(SCRIPT))});
const response={json.dumps(response)};
const fakeFetch=async url=>{{
  if(response==='throw')throw new Error('network');
  if(typeof response==='number')return {{ok:false,status:response,json:async()=>({{}})}};
  if(!url.endsWith('/compare/'+{json.dumps(previous)}+'...'+{json.dumps(current)}))throw new Error('wrong url '+url);
  return {{ok:true,status:200,json:async()=>response}};
}};
shouldSkip({json.dumps(previous)},{json.dumps(current)},fakeFetch).then(s=>process.stdout.write(String(s)));
"""
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout
    return out == "true"


def _ahead(*paths):
    return {"status": "ahead", "files": [{"filename": p} for p in paths]}


def test_first_deploy_and_redeploys_build():
    assert not _skip("", CUR, _ahead("docs/x.md"))
    assert not _skip(PREV, "", _ahead("docs/x.md"))
    assert not _skip(CUR, CUR, _ahead("docs/x.md"))


def test_anything_unverifiable_builds():
    assert not _skip(PREV, CUR, 404)                      # unknown previous commit
    assert not _skip(PREV, CUR, 403)                      # rate limited
    assert not _skip(PREV, CUR, "throw")                  # network error
    assert not _skip(PREV, CUR, {"status": "diverged", "files": [{"filename": "docs/x.md"}]})   # force push
    assert not _skip(PREV, CUR, {"status": "ahead", "files": []})
    assert not _skip(PREV, CUR, _ahead(*[f"docs/{i}.md" for i in range(300)]))  # GitHub's list may be truncated


@pytest.mark.parametrize("path", ["docs/readme.md", "state-project-complete/api.py", "CLAUDE.md", "qa/deployed/x.spec.js",
                                  "scripts/x.sh", "tools/x.py", ".github/workflows/x.yml", "QA.md"])
def test_changes_only_to_files_the_site_does_not_serve_skip(path):
    assert _skip(PREV, CUR, _ahead(path))


@pytest.mark.parametrize("path", ["index.html", "content/edge.md", "api/new.js", "assets/x.png", "cheat-sheets/x.html",
                                  "implementation-context-prototype/index.html", "vercel.json", ".vercelignore", "new.css",
                                  # Not served, but not listed as unserved; they rarely change.
                                  "Makefile", "render.yaml", "package.json"])
def test_changes_to_served_files_or_deploy_config_build(path):
    assert not _skip(PREV, CUR, _ahead(path))


def test_a_site_change_in_a_mostly_docs_push_still_builds():
    assert not _skip(PREV, CUR, _ahead("docs/a.md", "index.html", "state-project-complete/x.py"))
