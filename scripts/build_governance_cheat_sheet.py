#!/usr/bin/env python3
"""Regenerates cheat-sheets/AI_Governance_Risk_PM_Cheat_Sheet.pdf.

Every box is sized from its own text (Paragraph.wrap), so content can never spill past a
border or collide with the next block. Rebuilt from the published PDF's wording (Oct 2026
review #4: the HIGH risk box overflowed into the note beneath it and the banner sentence
ran past its right edge). Needs `reportlab`.

    python scripts/build_governance_cheat_sheet.py
"""
from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

OUT = Path(__file__).resolve().parent.parent / "cheat-sheets" / "AI_Governance_Risk_PM_Cheat_Sheet.pdf"

INK, MUTED = HexColor("#172033"), HexColor("#5f6b7a")
PURPLE, TEAL, RED = HexColor("#6846c7"), HexColor("#168a9a"), HexColor("#a63f51")
LINE = HexColor("#d8dce5")
PAGE_W, PAGE_H = 612, 792
M = 40
GAP = 14
COL_W = (PAGE_W - 2 * M - GAP) / 2
PAD = 12
ARROW = '<font face="Symbol" color="#5f6b7a">\u2192</font>'


def style(name, font="Helvetica", size=8.1, color=INK, leading=None, **kw):
    return ParagraphStyle(name, fontName=font, fontSize=size, textColor=color, leading=leading or size * 1.3, **kw)


KICKER = style("kicker", "Helvetica-Bold", 7.8, PURPLE, spaceAfter=3)
H2 = style("h2", "Helvetica-Bold", 11.3, INK, leading=13.5, spaceAfter=4)
BODY = style("body", size=8.0, leading=10.4)
SMALL = style("small", size=7.6, color=MUTED, leading=10.8)
NOTE = style("note", "Helvetica-Oblique", 7.1, MUTED, leading=10)
LABEL = style("label", "Helvetica-Bold", 7.4, PURPLE)


def draw(c, flow, x, y_top, w):
    """Draw paragraphs top-down inside width w; returns the y below them."""
    y = y_top
    for p in flow:
        _, h = p.wrap(w, 1000)
        p.drawOn(c, x, y - h)
        y -= h + p.getSpaceAfter()
    return y


def height(flow, w):
    return sum(p.wrap(w, 1000)[1] + p.getSpaceAfter() for p in flow)


def card(c, x, y_top, w, flow, fill=Color(1, 1, 1), stroke=LINE, pad=PAD, min_h=0, trim=8):
    h = max(height(flow, w - 2 * pad) + 2 * pad - trim, min_h)
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.8)
    c.roundRect(x, y_top - h, w, h, 10, fill=1, stroke=1)
    draw(c, flow, x + pad, y_top - pad, w - 2 * pad)
    return y_top - h


def bullets(c, items, x, y, w, dot=PURPLE):
    for text in items:
        p = Paragraph(text, BODY)
        _, h = p.wrap(w - 14, 1000)
        c.setFillColor(dot)
        c.circle(x + 3, y - 6, 1.6, fill=1, stroke=0)
        p.drawOn(c, x + 14, y - h)
        y -= h + 3
    return y


def bullets_height(items, w):
    return sum(Paragraph(t, BODY).wrap(w - 14, 1000)[1] + 5 for t in items)


def build():
    c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H))
    c.setTitle("AI Governance, Safety & Privacy: PM cheat sheet")

    y = PAGE_H - 40
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(M, y, "AI Governance, Safety & Privacy")
    y -= 18
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10.2)
    c.drawString(M, y, "PM cheat sheet: turn policy into product decisions and controls")
    y -= 14

    # banner: the flow, then the qualifier on its own line so nothing runs off the edge
    banner = [
        Paragraph("USEFUL DEFAULT FOR CONSEQUENTIAL WORKFLOWS", KICKER),
        Paragraph(
            f'<font name="Helvetica-Bold" color="#6846c7">AI interprets</font> &nbsp;{ARROW}&nbsp; '
            f'<font name="Helvetica-Bold" color="#168a9a">software enforces</font> &nbsp;{ARROW}&nbsp; '
            '<font name="Helvetica-Bold">people authorize</font>',
            style("flow", size=11, leading=15, spaceAfter=4)),
        Paragraph("Use stricter controls as data, authority, or impact rises.", style("q", size=8.4, color=MUTED)),
    ]
    y = card(c, M, y, PAGE_W - 2 * M, banner, fill=HexColor("#f5f3fb"), stroke=HexColor("#d9d2f3"), pad=10, trim=-2) - 12
    top = y

    # ---- left column
    scan_items = [
        "Data: What enters the model? Client-confidential, personal, regulated, credentials, or proprietary information?",
        "Authority: Does AI only suggest, or can it decide, send, publish, approve, change records, spend money, or touch production?",
        "Impact: What happens if the answer is wrong, biased, stale, leaked, or confidently unsupported?",
        "Access: Who may see the source data and output? Could retrieval expose information across users, teams, or clients?",
        "Oversight: Can a person review important outputs, inspect evidence/logs, stop the system, and recover from a bad action?",
    ]
    inner = COL_W - 2 * PAD
    head = [Paragraph("1 · FAST RISK SCAN", KICKER), Paragraph("Ask these before choosing controls", H2)]
    h_head = height(head, inner)
    h_card = h_head + bullets_height(scan_items, inner) + 2 * PAD - 8
    c.setFillColor(Color(1, 1, 1)); c.setStrokeColor(LINE); c.setLineWidth(0.8)
    c.roundRect(M, top - h_card, COL_W, h_card, 10, fill=1, stroke=1)
    yy = draw(c, head, M + PAD, top - PAD, inner)
    bullets(c, scan_items, M + PAD, yy, inner)
    y_left = top - h_card - 10

    levels = [
        ("LOW", HexColor("#eaf7f0"), "Drafting, brainstorming, public-info summaries. No sensitive data; no consequential action.",
         "Normal QA + approved-tool rules."),
        ("MEDIUM", HexColor("#fff7e6"), "Internal knowledge, client-confidential content in approved systems, support suggestions, code assistance.",
         "Privacy/security review, permissions, evals, source checks, monitoring."),
        ("HIGH", HexColor("#fdeef0"), "Sensitive/regulated data + material decisions, autonomous external actions, production changes, employment/financial/legal/medical impact.",
         "Formal approval, human authorization, least privilege, strong evals, logging, rollback/kill switch, incident plan."),
    ]
    body_w = inner - 50
    lvl_boxes = []
    for name, fill, desc, ctrl in levels:
        paras = [Paragraph(desc, style("ld", size=7.7, leading=10.6, spaceAfter=3)),
                 Paragraph(ctrl, style("lc", "Helvetica-Bold", 7.4, MUTED, leading=10))]
        lvl_boxes.append((name, fill, paras, height(paras, body_w) + 12))
    risk_head = [Paragraph("2 · PRACTICAL RISK LEVELS", KICKER), Paragraph("Scale review to the use case", H2)]
    note = Paragraph("Risk is contextual. Company policy, contracts, and law can raise the required level.", NOTE)
    h_card = (height(risk_head, inner) + sum(b[3] + 6 for b in lvl_boxes) + note.wrap(inner, 100)[1] + 2 * PAD - 6)
    c.setFillColor(Color(1, 1, 1)); c.setStrokeColor(LINE)
    c.roundRect(M, y_left - h_card, COL_W, h_card, 10, fill=1, stroke=1)
    yy = draw(c, risk_head, M + PAD, y_left - PAD, inner)
    for name, fill, paras, bh in lvl_boxes:
        c.setFillColor(fill); c.setStrokeColor(LINE)
        c.roundRect(M + PAD, yy - bh, inner, bh, 7, fill=1, stroke=1)
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 8.4)
        c.drawString(M + PAD + 10, yy - 13, name)
        draw(c, paras, M + PAD + 50, yy - 7, body_w)
        yy -= bh + 6
    note.drawOn(c, M + PAD, yy - note.wrap(inner, 100)[1] + 1)
    y_left -= h_card

    # ---- right column
    rx = M + COL_W + GAP
    controls = [
        ("DATA", "Minimize/redact inputs; approved enterprise tools; retention/training settings; vendor/DPA review."),
        ("ACCESS", "Least privilege; tenant/project boundaries; separate read from write permissions; secrets outside prompts."),
        ("HUMAN", "Human approval before consequential actions; clear escalation path; do not hide uncertainty behind confidence scores."),
        ("EVIDENCE", "Ground important claims in approved sources; show provenance when users need to verify what the AI relied on."),
        ("TEST", "Representative + high-risk evals; permission-boundary tests; prompt-injection/adversarial cases; safe-failure behavior."),
        ("OBSERVE", "Logs/traces appropriate to the risk; monitor failures, corrections, drift, model/vendor changes, and misuse."),
        ("RECOVER", "Pause/kill switch for risky actions; rollback where possible; preserve logs; incident owner + notification path."),
    ]
    label_w = 50
    rows = [(l, Paragraph(t, style("cm", size=7.8, leading=10))) for l, t in controls]
    ctl_head = [Paragraph("3 · CONTROL MENU", KICKER), Paragraph("Choose controls that match the risk", H2)]
    h_rows = sum(p.wrap(inner - label_w, 100)[1] + 6 for _, p in rows)
    h_card = height(ctl_head, inner) + h_rows + 2 * PAD - 10
    c.setFillColor(Color(1, 1, 1)); c.setStrokeColor(LINE)
    c.roundRect(rx, top - h_card, COL_W, h_card, 10, fill=1, stroke=1)
    yy = draw(c, ctl_head, rx + PAD, top - PAD, inner)
    for label, p in rows:
        _, h = p.wrap(inner - label_w, 100)
        c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 7.4)
        c.drawString(rx + PAD, yy - 8, label)
        p.drawOn(c, rx + PAD + label_w, yy - h)
        yy -= h + 6
    y_right = top - h_card - 10

    flow_flow = [
        Paragraph("4 · PM REVIEW FLOW", style("k2", "Helvetica-Bold", 7.8, TEAL, spaceAfter=8)),
        Paragraph(f"<b>1&nbsp;Intake</b> {ARROW} <b>2&nbsp;Classify&nbsp;risk</b> {ARROW} <b>3&nbsp;Data/privacy&nbsp;+&nbsp;vendor&nbsp;review</b> {ARROW} "
                  f"<b>4&nbsp;Define&nbsp;authority&nbsp;&amp;&nbsp;controls</b> {ARROW} <b>5&nbsp;Eval/test</b> {ARROW} <b>6&nbsp;Approve</b> {ARROW} "
                  f"<b>7&nbsp;Monitor</b> {ARROW} <b>8&nbsp;Incident/review</b>", style("fl", size=8.4, leading=13, spaceAfter=9)),
        Paragraph("The PM owns the product questions; specialists own legal/security determinations.", style("s1", size=7.6, color=MUTED, leading=10.8, spaceAfter=4)),
        Paragraph("Re-review when data, permissions, model/vendor, or impact meaningfully changes.", SMALL),
    ]
    y_right = card(c, rx, y_right, COL_W, flow_flow, fill=HexColor("#eef8f8"), stroke=HexColor("#cde6e8"))

    # ---- stop box (full width, two columns)
    y = min(y_left, y_right) - 10
    left_items = ["A new use case introduces sensitive/regulated data or unclear data-retention/training terms.",
                  "An agent gains new write/action permissions, especially money, production, customer messages, or record changes."]
    right_items = ["AI output becomes a material input to a consequential decision without meaningful human review.",
                   "You cannot explain who is accountable, what was accessed, why an action happened, or how to undo it."]
    w2 = COL_W - 2 * PAD
    stop_head = Paragraph("STOP AND ESCALATE WHEN", style("k3", "Helvetica-Bold", 7.8, RED, spaceAfter=6))
    h_stop = (stop_head.wrap(PAGE_W - 2 * M - 2 * PAD, 50)[1] + 6
              + max(bullets_height(left_items, w2), bullets_height(right_items, w2)) + 2 * PAD - 2)
    c.setFillColor(HexColor("#fcf6f7")); c.setStrokeColor(HexColor("#e9cdd2"))
    c.roundRect(M, y - h_stop, PAGE_W - 2 * M, h_stop, 10, fill=1, stroke=1)
    stop_head.drawOn(c, M + PAD, y - PAD - stop_head.wrap(400, 50)[1])
    base = y - PAD - 6 - stop_head.wrap(400, 50)[1] - 2
    bullets(c, left_items, M + PAD, base, w2, dot=RED)
    bullets(c, right_items, rx + PAD, base, w2, dot=RED)

    # ---- footer
    fy = 34
    c.setStrokeColor(LINE); c.setLineWidth(0.8)
    c.line(M, fy + 16, PAGE_W - M, fy + 16)
    c.setFillColor(MUTED); c.setFont("Helvetica", 7.1)
    c.drawString(M, fy + 3, "Framework anchors: NIST AI RMF (Govern · Map · Measure · Manage), NIST GenAI Profile, ISO/IEC 42001.")
    c.setFont("Helvetica-Oblique", 7.0)
    c.drawString(M, fy - 8, "Use this as a product review aid, not a substitute for company policy, legal advice, privacy, security, or compliance review.")
    c.setFont("Helvetica", 7.0)
    c.drawRightString(PAGE_W - M, fy + 3, "Sep 2026")

    c.showPage()
    c.save()
    return y - h_stop


if __name__ == "__main__":
    bottom = build()
    print(f"wrote {OUT}")
