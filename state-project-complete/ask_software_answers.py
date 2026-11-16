"""Ask answers that software writes from the record, with no model call (Paige's directions, Nov 16).

Each one replaces a model answer for a kind of question the model answered badly in the Nov 16 production QA:

- #692 re-checks and confirmation dates: the model never sees `last_confirmed_at` or `needs_recheck` (DEC-026 kept them
  out of its context), so it said nothing was flagged beside a "needs re-check" chip. Software answers these from the
  same fields Current State shows.
- #693 another project by name: asked from Juniper about Northstar, the model presented Juniper's records as
  Northstar's. Software says which project Ask is answering from and declines.
- #687 follow-ups without the earlier answer: "What source supports that?" was answered about unrelated records.
  Software asks for the whole question; earlier answers are still not passed through (a separate product change).

Every answer here is an ordinary Ask envelope (claims and sections citing real records of the active project), so the
drawer, Copy and the eval scorers read it like any other answer. `timing.pipeline` says which software answer it was.
"""
from __future__ import annotations

import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Mapping

from ask_contract import AskAnswerItem, AskAnswerSection, AskClaim, AskSelection, AskSynthesis
from ask_display import claim_lines
from db import project_id_of
from review_service import list_presented_reviews, list_questions, list_state

STATE_LABEL = "Current State"
MAX_LISTED = 8          # AskAnswerSection.items limit

# --------------------------------------------------------------------------------------------------------------------
# Shared helpers


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def _stem(word: str) -> str:
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


def _local_datetime(value: str | None, timezone_offset: int | None) -> datetime | None:
    """A stored UTC timestamp in the asker's time zone. `timezone_offset` is the browser's Date.getTimezoneOffset()
    (minutes behind UTC); without it, UTC. The drawer's re-check chip formats the same timestamp in the browser's
    zone, so the two show the same day."""
    if not value:
        return None
    try:
        moment = datetime.strptime(str(value)[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return moment - timedelta(minutes=timezone_offset or 0)


def format_confirmed(value: str | None, timezone_offset: int | None, today: date | None = None) -> str:
    """"Aug 3", as the drawer's chip shows it (toLocaleDateString month short, day numeric); the year is added only
    when it isn't this year."""
    moment = _local_datetime(value, timezone_offset)
    if moment is None:
        return "on an unknown date"
    text = f"{moment.strftime('%b')} {moment.day}"
    if moment.year != (today or date.today()).year:
        text += f", {moment.year}"
    return text


def _envelope(connection: Any, answer: AskSynthesis, *, pipeline: str, started: float, state_ids: list[str] | None = None) -> dict[str, Any]:
    answer.summary = "\n".join(claim_lines(answer.model_dump()))
    selection = AskSelection(job=answer.job, state_ids=list(dict.fromkeys(state_ids or []))[:12])
    reviews = list_presented_reviews(connection, "open")
    questions = list_questions(connection, "open")
    total_ms = round((time.perf_counter() - started) * 1000)
    return {
        "answer": answer.model_dump(),
        "selection": selection.model_dump(),
        "open_items_remaining": {"count": len(reviews) + len(questions), "reviews": len(reviews)},
        "followup_mode": "new",
        "timing": {"pipeline": pipeline, "context_ms": total_ms, "provider_ms": 0, "validation_ms": 0, "total_ms": total_ms},
    }


# --------------------------------------------------------------------------------------------------------------------
# #692: re-checks and confirmation dates

_RECHECK_QUESTION = re.compile(
    r"\bre[\s-]?check|\blast\s+(?:re-?)?confirm(?:ed|ation)\b|\bconfirmation\s+dates?\b|\bwhen\s+(?:was|were)\b.*\blast\b.*\bconfirmed\b",
    re.IGNORECASE,
)
# Words that say what kind of question it is, not which item it is about.
_RECHECK_FILLER = {
    "a", "an", "the", "and", "or", "of", "for", "in", "on", "to", "by", "at", "is", "are", "was", "were", "be", "been",
    "has", "have", "had", "do", "does", "did", "it", "its", "this", "that", "these", "those", "our", "we", "us", "me",
    "my", "you", "your", "i", "there", "any", "anything", "all", "every", "which", "what", "when", "who", "whom",
    "how", "long", "ago", "list", "show", "tell", "give", "please", "can", "could", "would", "should", "need", "needs",
    "needed", "needing", "require", "requires", "due", "overdue", "flag", "flagged", "item", "items", "fact", "facts",
    "current", "state", "record", "records", "last", "lastly", "confirm", "confirmed", "confirmation", "confirmations",
    "reconfirm", "reconfirmed", "reconfirming", "confirming", "date", "dates", "dated", "re", "check", "recheck", "rechecks", "rechecked",
    "checked", "checking", "still", "true", "past", "interval", "intervals", "reminder", "reminders", "formally",
    "time", "project", "so", "far", "yet", "now", "right", "currently", "explicitly", "marked", "as", "being",
    "most", "recent", "recently", "ever", "one", "ones", "some", "where", "from", "with", "about", "s",
}
_WHO = re.compile(r"\b(who|whom|by whom)\b", re.IGNORECASE)


def is_recheck_question(query: str) -> bool:
    return bool(_RECHECK_QUESTION.search(query or ""))


def _subject_words(query: str) -> set[str]:
    return {_stem(w) for w in _words(query) if w not in _RECHECK_FILLER and len(w) > 1}


def _matching_items(query: str, items: list[Mapping[str, Any]]) -> tuple[list[Mapping[str, Any]], bool]:
    """The Current State items the question is about, and whether it names a subject at all.

    An item matches when its topic and statement hold every subject word of the question (or at least two of them);
    the best matches win, topic words breaking ties ("escalation path" is k-escalation, not every statement that
    mentions escalation). More than three equally good matches is no match: software can't tell which one is meant."""
    subject = _subject_words(query)
    if not subject:
        return [], False
    scored = []
    for item in items:
        topic = {_stem(w) for w in _words(str(item.get("topic") or ""))}
        words = topic | {_stem(w) for w in _words(str(item.get("statement") or ""))}
        coverage = len(subject & words)
        if coverage == len(subject) or coverage >= 2:
            scored.append(((coverage, len(subject & topic)), item))
    if not scored:
        return [], True
    best = max(key for key, _ in scored)
    top = [item for key, item in scored if key == best]
    return (top if len(top) <= 3 else []), True


def _days_phrase(days: int | None) -> str:
    return f"{days}-day" if days else ""


def _item_claim(item: Mapping[str, Any], reminders_on: bool, timezone_offset: int | None, today: date | None) -> AskClaim:
    topic = str(item.get("topic") or "This item").strip()
    when = format_confirmed(item.get("last_confirmed_at"), timezone_offset, today)
    days = item.get("effective_recheck_days")
    if item.get("needs_recheck"):
        text = f"{topic} was last confirmed {when}. That's longer ago than its {_days_phrase(days)} re-check interval, so it needs a re-check."
    elif reminders_on and days:
        text = f"{topic} was last confirmed {when}, within its {_days_phrase(days)} re-check interval."
    else:
        text = f"{topic} was last confirmed {when}."
    return AskClaim(text=text[:300], basis="current_state", primary_record_id=str(item["id"]), label=STATE_LABEL)


def _flagged_card(item: Mapping[str, Any], timezone_offset: int | None, today: date | None) -> AskAnswerItem:
    days = item.get("effective_recheck_days")
    detail = f"{item.get('topic')} · last confirmed {format_confirmed(item.get('last_confirmed_at'), timezone_offset, today)}"
    if days:
        detail += f" · re-check every {days} days"
    return AskAnswerItem(text=str(item.get("statement") or item.get("topic") or "Current State item")[:700],
                         record_type="state", record_id=str(item["id"]), detail=detail[:1000], wording="record")


def recheck_answer(connection: Any, query: str, *, timezone_offset: int | None = None, today: date | None = None,
                   started: float | None = None) -> dict[str, Any] | None:
    """#692 (Paige, Nov 16): answer re-check and confirmation-date questions from `last_confirmed_at` and
    `needs_recheck` (DEC-026), never from the model. None when the question isn't one."""
    if not is_recheck_question(query):
        return None
    started = time.perf_counter() if started is None else started
    items = [x for x in list_state(connection) if "needs_recheck" in x]
    if not items:
        return None     # a database before migration 026 has no confirmation dates; the model answers as before
    reminders_on = any(x.get("effective_recheck_days") for x in items)
    flagged = [x for x in items if x.get("needs_recheck")]
    claims: list[AskClaim] = []
    sections: list[AskAnswerSection] = []
    shown_ids: list[str] = []
    named, has_subject = _matching_items(query, items)
    if named:
        for item in named:
            claims.append(_item_claim(item, reminders_on, timezone_offset, today))
            shown_ids.append(str(item["id"]))
        if not reminders_on:
            claims.append(AskClaim(text="Re-check reminders are off for this project, so no item is flagged for a re-check."))
        job = "current_fact"
    else:
        job = "attention_check"
        if has_subject:
            claims.append(AskClaim(text="State couldn't tell which Current State item this is about, so here is every "
                                        "item that needs a re-check."))
        if not reminders_on:
            claims.append(AskClaim(text="Re-check reminders are off for this project, so no Current State item is flagged "
                                        "for a re-check. They can be turned on in Settings."))
        elif not flagged:
            claims.append(AskClaim(text="No Current State item needs a re-check: each was last confirmed within its "
                                        "re-check interval."))
        else:
            count = len(flagged)
            noun = "item needs" if count == 1 else "items need"
            claims.append(AskClaim(text=f"{count} Current State {noun} a re-check: last confirmed longer ago than "
                                        f"{'its' if count == 1 else 'their'} re-check interval."))
            listed = sorted(flagged, key=lambda x: str(x.get("last_confirmed_at") or ""))[:MAX_LISTED]
            sections.append(AskAnswerSection(kind="open_attention", title="Needs a re-check",
                                             items=[_flagged_card(x, timezone_offset, today) for x in listed]))
            shown_ids.extend(str(x["id"]) for x in listed)
            if count > MAX_LISTED:
                claims.append(AskClaim(text=f"The {MAX_LISTED} confirmed longest ago are listed here; Current State "
                                            "lists all of them."))
    if _WHO.search(query):
        claims.append(AskClaim(text="State records when an item was last confirmed, not who confirmed it."))
    answer = AskSynthesis(job=job, headline="Re-check dates", claims=claims[:4], sections=sections)
    return _envelope(connection, answer, pipeline="software_recheck", started=started, state_ids=shown_ids)


def confirmation_fingerprint(connection: Any) -> list[list[Any]]:
    """What a re-check answer depends on beyond the Ask candidates, for the Ask cache key: a "Still true" moves an
    item's date without changing any record the model sees."""
    return [[x.get("id"), x.get("last_confirmed_at"), x.get("effective_recheck_days"), bool(x.get("needs_recheck"))]
            for x in list_state(connection) if "needs_recheck" in x]


# --------------------------------------------------------------------------------------------------------------------
# #693: questions about another project


def _phrase_in(phrase: str, text: str) -> bool:
    return bool(phrase) and re.search(rf"(?<![a-z0-9]){re.escape(phrase.lower())}(?![a-z0-9])", text) is not None


def _active_project_text(connection: Any) -> str:
    """Everything the active project's own records say, to tell another project's name from an ordinary word."""
    parts: list[str] = []
    for item in list_state(connection):
        parts += [str(item.get("topic") or ""), str(item.get("statement") or "")]
    for review in list_presented_reviews(connection, "open"):
        parts += [str(review.get("decision_question") or ""), str(review.get("why_consequential") or "")]
    for question in list_questions(connection, "open"):
        parts.append(str(question.get("text") or ""))
    return " ".join(parts).lower()


def other_projects_named(connection: Any, query: str) -> tuple[str, list[str]]:
    """The active project's name, and the names of other projects the question names.

    A project is named by its full name, or by its id when the id is a plain word (the demo projects' "northstar" and
    "juniper"; a created project's id is generated, so only its name counts). A name that also appears in the active
    project's own records ("Budget", say) is an ordinary word there, not a reference to the other project."""
    active_id = project_id_of(connection)
    rows = [dict(row) for row in connection.execute("SELECT id, name FROM projects").fetchall()]
    active_name = next((str(r["name"]) for r in rows if r["id"] == active_id), active_id)
    text = (query or "").lower()
    candidates = []
    for row in rows:
        if row["id"] == active_id:
            continue
        names = [str(row["name"] or "").strip()]
        if re.fullmatch(r"[a-z]{4,}", str(row["id"])):
            names.append(str(row["id"]))
        if any(_phrase_in(name, text) for name in names):
            candidates.append((str(row["name"] or row["id"]), names))
    if not candidates:
        return active_name, []
    own = _active_project_text(connection) + " " + active_name.lower()
    named = [name for name, names in candidates if not any(_phrase_in(n, own) for n in names if _phrase_in(n, text))]
    return active_name, named


def _join(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def other_project_answer(connection: Any, query: str, *, started: float | None = None) -> dict[str, Any] | None:
    """#693 (Paige, Nov 16): asked about another project by name, Ask says which project it is answering from and
    declines; it never answers from the active project's records, and never offers to track the other project's
    Question here. None when the question names no other project."""
    active, others = other_projects_named(connection, query)
    if not others:
        return None
    started = time.perf_counter() if started is None else started
    names = _join(others)
    possessive = f"{names}'" if names.endswith("s") else f"{names}'s"
    claims = [
        AskClaim(text=f"Ask answers only from {active}, the project you have open. It can't see {possessive} records, "
                      f"so it won't answer for {names}."[:300]),
        AskClaim(text=f"To ask about {names}, switch to {'it' if len(others) == 1 else 'that project'} with the project "
                      "switcher, then ask again."[:300]),
    ]
    answer = AskSynthesis(job="general_project_synthesis", headline="Another project", claims=claims)
    return _envelope(connection, answer, pipeline="software_other_project", started=started)


# --------------------------------------------------------------------------------------------------------------------
# #687: follow-ups that depend on an earlier answer Ask doesn't have

# Whole questions that only make sense after an earlier answer.
_FOLLOWUP_EXACT = {
    "why", "why not", "how", "how so", "how come", "really", "are you sure", "is that right", "is that true",
    "is that correct", "says who", "who says", "tell me more", "more", "more detail", "more details", "go on",
    "continue", "elaborate", "explain", "explain more", "expand", "and", "so", "what else", "who else", "anything else",
    "such as", "for example", "like what", "source", "sources", "proof", "shorter", "longer", "simpler",
}
# Words that point back at an earlier answer.
_DEICTIC = re.compile(r"\b(that|this|it|those|these|them|they|above|previous|earlier|you said|your answer)\b", re.IGNORECASE)
_NOT_POINTING = re.compile(r"\b(?:this|that|the)\s+(?:project|week|month|quarter|year|morning|afternoon|time)\b")
# Words that carry no subject of their own: function words, and what a follow-up asks to do with an earlier answer.
_FOLLOWUP_FILLER = {
    "a", "an", "the", "and", "or", "but", "of", "for", "in", "on", "to", "by", "at", "with", "from", "about", "as",
    "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "has", "have", "had", "can", "could",
    "would", "should", "will", "may", "might", "must", "it", "its", "this", "that", "these", "those", "them", "they",
    "their", "above", "previous", "earlier", "you", "your", "said", "say", "says", "me", "my", "i", "we", "us", "our",
    "what", "which", "who", "whom", "whose", "why", "how", "when", "where", "there", "here", "so", "then", "just",
    "please", "make", "give", "tell", "show", "put", "turn", "into", "more", "less", "again", "also", "really", "sure",
    "right", "true", "correct", "mean", "means", "meant", "source", "sources", "support", "supports", "supported",
    "supporting", "backs", "back", "evidence", "proof", "come", "came", "from", "know", "shorter", "longer",
    "simpler", "shorten", "simplify", "summarize", "summarise", "rephrase", "reword", "rewrite", "explain",
    "expand", "elaborate", "detail", "details", "version", "bullet", "bullets", "points", "one", "s", "t", "not",
    "no", "yes", "ok", "okay", "thanks", "thank", "all", "any", "some", "else", "other", "only", "first", "part",
}


def is_dependent_followup(query: str) -> bool:
    """A question that needs an earlier answer to mean anything: "Why?", "What source supports that?", "Make this
    shorter". It points back ("that", "this", "it") and names at most one subject word of its own, or it is one of
    the bare follow-ups above. A question that names its subject ("What does that mean for the pilot budget?" names
    two) is answered as asked."""
    words = _words(query)
    if not words:
        return False
    if " ".join(words) in _FOLLOWUP_EXACT:
        return True
    # "this project", "this week": a subject, not a pointer back at an earlier answer.
    pointing = _NOT_POINTING.sub(" ", (query or "").lower())
    if not _DEICTIC.search(pointing):
        return False
    subject = [w for w in words if w not in _FOLLOWUP_FILLER]
    return len(subject) <= 1


def followup_answer(connection: Any, query: str, previous_answer: Mapping[str, Any] | None, *,
                    started: float | None = None) -> dict[str, Any] | None:
    """#687 (Paige, Nov 16): a follow-up asked without the earlier answer gets a request for the complete question,
    never an answer about unrelated records. Ask does not carry earlier answers forward (the drawer sends each
    question alone); when a caller does send the previous answer, the existing follow-up handling applies."""
    if previous_answer or not is_dependent_followup(query):
        return None
    started = time.perf_counter() if started is None else started
    claims = [
        AskClaim(text="This looks like a follow-up to an earlier answer. Ask answers each question on its own and "
                      "doesn't see earlier answers, so it can't tell what this refers to."),
        AskClaim(text="Ask again with the whole question, naming what it's about."),
    ]
    answer = AskSynthesis(job="general_project_synthesis", headline="Needs the whole question", claims=claims)
    return _envelope(connection, answer, pipeline="software_followup", started=started)


# --------------------------------------------------------------------------------------------------------------------


def software_answer(connection: Any, query: str, previous_answer: Mapping[str, Any] | None = None, *,
                    today: date | None = None, timezone_offset: int | None = None) -> dict[str, Any] | None:
    """The software-written answer for this question, or None when the model should answer it."""
    started = time.perf_counter()
    return (other_project_answer(connection, query, started=started)
            or followup_answer(connection, query, previous_answer, started=started)
            or recheck_answer(connection, query, timezone_offset=timezone_offset, today=today, started=started))
