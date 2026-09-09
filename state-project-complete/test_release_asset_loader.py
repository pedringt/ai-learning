import re
from pathlib import Path


FRONTEND = Path(__file__).parent.parent / "implementation-context-prototype"


def test_state_release_assets_share_one_dynamic_version_token():
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")

    token_match = re.search(r"var\s+v\s*=\s*['\"]([\w.-]+)['\"]", html)
    assert token_match, "index.html no longer defines the shared State release token"
    token = token_match.group(1)

    array_match = re.search(r"var\s+files\s*=\s*\[(.*?)\]", html, re.S)
    assert array_match, "index.html no longer defines the State JS release asset list"
    assets = re.findall(r"['\"]([^'\"]+\.js)['\"]", array_match.group(1))
    referenced = {Path(src).name for src in assets}

    required = {"context-ask.js", "context-app.js", "context-history.js", "context-quickwins.js"}
    assert required <= referenced

    for src in assets:
        assert (FRONTEND / Path(src).name).exists(), f"{src} is listed but does not exist"

    css_match = re.search(r"context-tool\.css\?v=([\w.-]+)", html)
    assert css_match, "context-tool.css is no longer cache-busted"
    assert css_match.group(1) == token, (
        f"CSS release token {css_match.group(1)!r} does not match JS release token {token!r}"
    )

    assert "s.src=(local?'':'/implementation-context-prototype/')+f+'?v='+v" in html
