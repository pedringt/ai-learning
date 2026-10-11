"""Generate link-preview cards and Open Graph / Twitter tags for every portfolio page.

Each root page gets a 1200x630 card in assets/social/<slug>.png and a marked
block of og:/twitter: tags in its <head>, built from the page's own <title> and
meta description. Re-running replaces both, so edit a title or description and
run this again rather than editing the tags by hand.

    state-project-complete/.venv/bin/python tools/social_previews.py          # write
    state-project-complete/.venv/bin/python tools/social_previews.py --check  # exit 1 if stale
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://www.contextswitch.tech"
OUT = ROOT / "assets" / "social"
BEGIN, END = "<!-- social-preview:begin -->", "<!-- social-preview:end -->"
SKIP = {"404.html"}

# Pages without a meta description of their own.
FALLBACK_DESCRIPTIONS = {
    "project-health.html": "A live view of delivery, runtime and AI-quality signals across my projects, and what each one can and cannot confirm.",
    "state-evals.html": "How State's AI behavior is measured: controlled scenarios, the release gate, and what each eval does and does not prove.",
}


def kicker(slug):
    if slug == "index":
        return "Applied AI + Product Work"
    if slug.startswith("state-") or slug == "implementation-context":
        return "State"
    if slug.startswith("project-health"):
        return "Project Health"
    if slug == "tastemake":
        return "Tastemake"
    return "Case study"


def page_meta(path):
    text = path.read_text()
    title = html.unescape(re.search(r"<title>([^<]*)</title>", text).group(1)).strip()
    match = re.search(r'<meta content="([^"]*)" name="description"\s*/?>', text) or re.search(
        r'<meta name="description" content="([^"]*)"\s*/?>', text
    )
    description = html.unescape(match.group(1)) if match else FALLBACK_DESCRIPTIONS.get(path.name)
    if not description:
        raise SystemExit(f"{path.name}: no meta description; add one or a fallback")
    headline = re.split(r"\s+[·|]\s+Context Switch$", title)[0]
    if path.name == "index.html":
        headline = "Context Switch"
    return text, title, headline, description


def card_html(kick, headline, description):
    e = html.escape
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:1200px;height:630px;background:#fbf8f3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#171419}}
.card{{position:absolute;inset:44px;border:2px solid #e5ddd6;border-radius:28px;background:#fffdfa;padding:58px 64px;box-sizing:border-box;display:flex;flex-direction:column}}
.kick{{font-size:24px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5b478f}}
h1{{margin:26px 0 0;font-size:66px;line-height:1.05;letter-spacing:-.02em;font-weight:800;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
p{{margin:24px 0 0;font-size:28px;line-height:1.4;color:#6d676f;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}}
.foot{{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:22px;font-weight:700;color:#171419}}
.foot span:last-child{{color:#6d676f;font-weight:600}}
</style></head><body><div class="card"><div class="kick">{e(kick)}</div><h1>{e(headline)}</h1><p>{e(description)}</p>
<div class="foot"><span>Context <span style="color:#5b478f">Switch</span></span><span>contextswitch.tech</span></div></div></body></html>"""


def tags(slug, title, description):
    e = lambda s: html.escape(s, quote=True)
    url = SITE + "/" if slug == "index" else f"{SITE}/{slug}"
    image = f"{SITE}/assets/social/{slug}.png"
    return "\n".join([
        BEGIN,
        f'<meta content="website" property="og:type"/>',
        f'<meta content="{e(url)}" property="og:url"/>',
        f'<meta content="{e(title)}" property="og:title"/>',
        f'<meta content="{e(description)}" property="og:description"/>',
        f'<meta content="{image}" property="og:image"/>',
        '<meta content="1200" property="og:image:width"/>',
        '<meta content="630" property="og:image:height"/>',
        f'<meta content="{e(title)}" property="og:image:alt"/>',
        '<meta content="summary_large_image" name="twitter:card"/>',
        f'<meta content="{e(title)}" name="twitter:title"/>',
        f'<meta content="{e(description)}" name="twitter:description"/>',
        f'<meta content="{image}" name="twitter:image"/>',
        f'<meta content="{e(title)}" name="twitter:image:alt"/>',
        END,
    ])


def with_tags(text, block):
    text = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", "", text, flags=re.S)
    # Drop hand-written og:/twitter: tags; the generated block replaces them.
    text = re.sub(r'<meta\b[^>]*\b(?:property|name)="(?:og|twitter):[^"]*"[^>]*>\n?', "", text)
    return text.replace("</head>", block + "\n</head>", 1)


def main():
    check = "--check" in sys.argv
    pages = sorted(p for p in ROOT.glob("*.html") if p.name not in SKIP)
    stale, cards = [], []
    for path in pages:
        slug = path.stem
        text, title, headline, description = page_meta(path)
        updated = with_tags(text, tags(slug, title, description))
        if updated != text:
            stale.append(path.name)
            if not check:
                path.write_text(updated)
        if not (OUT / f"{slug}.png").exists():
            stale.append(f"assets/social/{slug}.png")
        cards.append((slug, card_html(kicker(slug), headline, description)))
    if check:
        if stale:
            print("stale:", ", ".join(stale))
            sys.exit(1)
        print(f"{len(pages)} pages up to date")
        return
    from playwright.sync_api import sync_playwright

    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 630})
        for slug, card in cards:
            page.set_content(card)
            page.screenshot(path=str(OUT / f"{slug}.png"))
        browser.close()
    print(f"wrote {len(cards)} cards and tags for {len(pages)} pages")


if __name__ == "__main__":
    main()
