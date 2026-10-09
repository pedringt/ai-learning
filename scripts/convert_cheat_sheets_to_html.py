#!/usr/bin/env python3
"""Convert existing cheat-sheet PDFs to readable printable HTML references.
Run in a GitHub Action; originals remain unchanged."""
from pathlib import Path
import fitz, html, re, statistics

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "cheat-sheets"
PDFS = sorted(FOLDER.glob("*.pdf"))
STYLE = """<style>
:root{--ink:#20202a;--muted:#5f6271;--accent:#6a50a7;--line:#dddce6;--paper:#fff;--wash:#f7f5fc}
*{box-sizing:border-box}body{margin:0;background:#f4f3f7;color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
a{color:var(--accent)}.wrap{max-width:840px;margin:38px auto 70px;padding:42px 52px;background:var(--paper);border:1px solid var(--line);border-radius:16px}
.top{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:13px}.top a{text-decoration:none;font-weight:700}
.label{text-transform:uppercase;letter-spacing:.12em;color:var(--accent);font-size:11px;font-weight:800;margin-top:32px}
h1{font:700 32px/1.13 Georgia,serif;letter-spacing:-.03em;margin:8px 0 12px}
h2{font-size:18px;margin:30px 0 10px;border-top:1px solid var(--line);padding-top:24px}
p{margin:0 0 12px;overflow-wrap:anywhere}.intro{font-size:17px;color:var(--muted)}
ul{padding-left:21px;margin:8px 0}li{padding-left:3px;margin:0 0 10px;overflow-wrap:anywhere}
.footer{border-top:1px solid var(--line);padding-top:24px;margin-top:32px;font-size:13px;color:var(--muted)}
.print{border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:var(--wash);cursor:pointer;font:inherit;color:var(--ink)}
@media(max-width:700px){.wrap{margin:0;padding:24px 22px;border:0;border-radius:0}.top{flex-wrap:wrap}h1{font-size:27px}}
@media print{body{background:white}.wrap{margin:0;border:0;padding:0;max-width:none}.print{display:none}h2{break-after:avoid}p,li{orphans:2;widows:2}@page{size:letter;margin:.65in}}
</style>"""

def normalize(txt):
    txt = txt.replace("\u2022", "•").replace("\uf0b7", "•")
    return " ".join(txt.split())

def extract(pdf):
    doc=fitz.open(pdf)
    blocks=[]
    sizes=[]
    for page in doc:
        for blk in page.get_text("dict",sort=True)["blocks"]:
            if "lines" not in blk: continue
            lines=[]
            for line in blk["lines"]:
                spans=[s for s in line["spans"] if s["text"].strip()]
                if not spans: continue
                txt=normalize("".join(s["text"] for s in spans))
                if not txt: continue
                size=max(s["size"] for s in spans)
                bold=any(("bold" in s["font"].lower() or "black" in s["font"].lower()) for s in spans)
                sizes.append(size)
                lines.append((txt,size,bold))
            if lines:
                blocks.extend(lines)
    return blocks, statistics.median(sizes) if sizes else 10, len(doc)

def render(pdf):
    lines,base,n=extract(pdf)
    if len(lines)<4: raise ValueError(f"Insufficient text in {pdf}: {len(lines)} lines")
    title=pdf.stem.replace("_"," ").replace("  "," ")
    # Prefer original front-page title if present and substantial.
    for text,size,bold in lines[:8]:
        if size>base*1.35 and 10<len(text)<105:
            title=text; break
    chunks=[]
    seen_heading=False
    for i,(txt,size,bold) in enumerate(lines):
        if i<5 and txt==title: continue
        if re.fullmatch(r"(?:\d+|Page\s+\d+|\d+\s*/\s*\d+)",txt,re.I):continue
        if txt.startswith("•") or re.match(r"^[-–]\s+",txt):
            chunks.append("<p class='bullet'>• "+html.escape(txt.lstrip("•-– ").strip())+"</p>")
        elif size>=base*1.23 and len(txt)<125 or (bold and len(txt)<75 and size>=base*1.02 and not txt.endswith(".")):
            chunks.append("<h2>"+html.escape(txt)+"</h2>")
            seen_heading=True
        else:
            chunks.append("<p>"+html.escape(txt)+"</p>")
    if not chunks:raise ValueError("No content "+str(pdf))
    original=html.escape(pdf.name)
    head=f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} · Context Switch</title>{STYLE}</head><body>
    <main class="wrap"><div class="top"><a href="../index.html#learn">← Learning Library</a><button class="print" onclick="window.print()">Print / Save PDF</button></div>
    <div class="label">Context Switch · Learning reference</div><h1>{html.escape(title)}</h1><p class="intro">Reference converted from the original cheat sheet. All extracted text is retained.</p>"""
    foot=f"""<div class="footer"><a href="{original}" target="_blank" rel="noopener">View original PDF</a> · {n} original page(s)</div></main></body></html>"""
    dest=pdf.with_suffix(".html")
    dest.write_text(head+"\n".join(chunks)+foot,encoding="utf-8")
    print(pdf.name,"->",dest.name,len(lines),"lines",len(chunks),"blocks")

def relink():
    index=ROOT/"index.html"
    s=index.read_text(encoding="utf-8")
    count=0
    for pdf in PDFS:
        name=pdf.name
        href="cheat-sheets/"+name
        # Only update direct Learning Library links; original PDF stays linked inside converted reference.
        new="cheat-sheets/"+pdf.stem+".html"
        if href in s:
            s=s.replace('href="'+href+'"','href="'+new+'"')
            count+=1
    index.write_text(s,encoding="utf-8")
    print("Relinked",count,"PDF links in index.html")

if __name__=="__main__":
    if len(PDFS)<12:raise SystemExit(f"Expected at least 12 PDFs; found {len(PDFS)}")
    for pdf in PDFS:render(pdf)
    relink()
