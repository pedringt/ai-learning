"""Generate link-preview cards and Open Graph / Twitter tags for every portfolio page.

Each root page and each cheat sheet (cheat-sheets/*.html) gets a 2400x1260 card in
assets/social/<slug>.png and a marked block of og:/twitter: tags in its <head>, built
from the page's own <title> and meta description. A cheat sheet has no description
tag of its own, so its one-line summary under the heading becomes one, inside the
block. It also writes sitemap.xml for the same pages. Re-running replaces all of
it, so edit a title or description and run this again rather than editing the tags
by hand.

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
CHEAT_SHEETS = "cheat-sheets"
SITEMAP = ROOT / "sitemap.xml"

# Pages without a meta description of their own.
FALLBACK_DESCRIPTIONS = {
    "state-evals.html": "How State's AI behavior is measured: controlled scenarios, the release gate, and what each eval does and does not prove.",
}


LIBRARY_PAGES = {"ai-governance-handbook", "ai-durable-knowledge", "ai-professional-edge", "ai-business-solutions-map", "ai-power-user-playbook"}


def kicker(slug):
    if slug.startswith(CHEAT_SHEETS + "/"):
        return "Library · Cheat sheet"
    if slug in LIBRARY_PAGES:
        return "Library"
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
    # Look for the page's own description, not one this tool wrote into its block.
    own = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), "", text, flags=re.S)
    match = re.search(r'<meta content="([^"]*)" name="description"\s*/?>', own) or re.search(
        r'<meta name="description" content="([^"]*)"\s*/?>', own
    )
    description = html.unescape(match.group(1)) if match else FALLBACK_DESCRIPTIONS.get(path.name)
    add_description = False
    if not description and path.parent.name == CHEAT_SHEETS:
        lede = re.search(r'<p class="(?:lede|lead|sub|intro)[^"]*"[^>]*>(.*?)</p>', text, re.S)
        if lede:
            description = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", lede.group(1)))).strip()
            add_description = True
    if not description:
        raise SystemExit(f"{path.name}: no meta description; add one or a fallback")
    headline = re.split(r"\s+[·|]\s+Context Switch$", title)[0]
    if path.name == "index.html":
        headline = "Context Switch"
    return text, title, headline, description, add_description


# Oct 20: cards follow the site's current look (logo mark, grid, display type, yellow sticker label) and
# render at 2x so LinkedIn's recompression keeps the text sharp. Bump IMAGE_VERSION when cards change so
# LinkedIn and other caches fetch the new image instead of the one stored under the old address.
IMAGE_VERSION = "2"
CARD_CSS = """html,body{margin:0;width:1200px;height:630px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171419;overflow:hidden}
body{background:#fff;background-image:linear-gradient(#f1eff6 1px,transparent 1px),linear-gradient(90deg,#f1eff6 1px,transparent 1px);background-size:48px 48px;position:relative}
body::after{content:"";position:absolute;right:-160px;top:-160px;width:620px;height:620px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,191,214,.20),rgba(255,95,162,.10),transparent)}
.wrap{position:absolute;inset:64px 72px;display:flex;flex-direction:column;z-index:1}
.brand{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:900;letter-spacing:-.03em}
.mark{width:38px;height:38px;border:3px solid #171419;border-radius:11px;background:linear-gradient(135deg,#fff 0 42%,#f4ff52 42% 100%);box-shadow:5px 5px 0 #171419}
.hero{margin:auto 0 0;font-size:96px;line-height:.9;font-weight:950;letter-spacing:-.045em;max-width:1000px}
.hero span{color:#f0408f}
.url{margin-top:34px;font-size:24px;font-weight:800;color:#5f5a66}
.chip{display:inline-block;align-self:flex-start;margin-top:auto;background:#f4ff52;font-size:20px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;padding:8px 16px;transform:rotate(-2deg);border:2px solid #171419}
h1{margin:22px 0 0;font-size:72px;line-height:.98;font-weight:950;letter-spacing:-.04em;max-width:1040px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
p{margin:20px 0 0;font-size:30px;line-height:1.35;color:#5f5a66;font-weight:500;max-width:1000px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}"""


def card_html(kick, headline, description, home=False):
    e = html.escape
    brand = '<div class="brand"><div class="mark"></div>Context Switch</div>'
    if home:
        body = brand + '<div class="hero">AI doesn’t know <span>what it doesn’t know.</span></div><div class="url">contextswitch.tech</div>'
    else:
        body = brand + f'<div class="chip">{e(kick)}</div><h1>{e(headline)}</h1><p>{e(description)}</p>'
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{CARD_CSS}</style></head><body><div class="wrap">{body}</div></body></html>'


def page_url(slug):
    return SITE + "/" if slug == "index" else f"{SITE}/{slug}"


def tags(slug, title, description, add_description=False):
    e = lambda s: html.escape(s, quote=True)
    url = page_url(slug)
    image = f"{SITE}/assets/social/{slug}.png?v={IMAGE_VERSION}"
    return "\n".join([
        BEGIN,
        *([f'<meta content="{e(description)}" name="description"/>'] if add_description else []),
        f'<meta content="website" property="og:type"/>',
        f'<meta content="{e(url)}" property="og:url"/>',
        f'<meta content="{e(title)}" property="og:title"/>',
        f'<meta content="{e(description)}" property="og:description"/>',
        f'<meta content="{image}" property="og:image"/>',
        '<meta content="2400" property="og:image:width"/>',
        '<meta content="1260" property="og:image:height"/>',
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


def sitemap(slugs):
    rows = "".join(f"  <url><loc>{html.escape(page_url(slug))}</loc></url>\n" for slug in slugs)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + rows + "</urlset>\n")


def main():
    check = "--check" in sys.argv
    pages = sorted(p for p in ROOT.glob("*.html") if p.name not in SKIP)
    pages += sorted((ROOT / CHEAT_SHEETS).glob("*.html"))
    stale, cards, slugs = [], [], []
    for path in pages:
        slug = path.relative_to(ROOT).with_suffix("").as_posix()
        slugs.append(slug)
        text, title, headline, description, add_description = page_meta(path)
        updated = with_tags(text, tags(slug, title, description, add_description))
        if updated != text:
            stale.append(path.relative_to(ROOT).as_posix())
            if not check:
                path.write_text(updated)
        if not (OUT / f"{slug}.png").exists():
            stale.append(f"assets/social/{slug}.png")
        cards.append((slug, card_html(kicker(slug), headline, description, home=slug == "index")))
    expected_sitemap = sitemap(slugs)
    if not SITEMAP.exists() or SITEMAP.read_text() != expected_sitemap:
        stale.append("sitemap.xml")
        if not check:
            SITEMAP.write_text(expected_sitemap)
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
        page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=2)
        for slug, card in cards:
            page.set_content(card)
            (OUT / f"{slug}.png").parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(OUT / f"{slug}.png"))
        browser.close()
    print(f"wrote {len(cards)} cards and tags for {len(pages)} pages")


if __name__ == "__main__":
    main()
