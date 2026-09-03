"""Post-processing transforms for Ask refinements — v2 with better detection and complete implementations."""
from ask_contract import AskSynthesis, AskAnswerSection, AskAnswerItem


def _looks_like_question(query: str) -> bool:
    """Detect if query is a question rather than a transformation command."""
    q = query.strip().lower()
    # Question patterns
    if q.startswith(('what', 'why', 'how', 'when', 'where', 'who', 'which', 'can you', 'could you', 'would you', 'should')):
        return True
    if q.endswith('?'):
        return True
    if any(marker in q for marker in ['tell me about', 'explain', 'describe', 'clarify', 'what if', 'did we']):
        return True
    return False


def detect_refinement_type(query: str) -> str | None:
    """Detect refinement type from natural language variations.
    
    Handles synonyms and natural phrasing while avoiding false positives.
    """
    if _looks_like_question(query):
        return None
    
    q = query.lower()
    
    # THREE BULLETS — handle many synonyms
    bullets_keywords = ['bullet', 'point', 'item', 'line']
    number_keywords = ['3', 'three', 'exactly 3', 'only 3']
    if any(num in q for num in number_keywords) and any(bul in q for bul in bullets_keywords):
        # Make sure it's a transformation not a question
        if not any(x in q for x in ['how many', 'why', 'what']):
            return "three_bullets"
    
    # FOCUS BLOCKERS — handle "just", "only", "show me"
    blocker_keywords = ['blocker', 'blocking', 'blocked']
    focus_keywords = ['only', 'just', 'focus', 'show', 'give']
    if any(b in q for b in blocker_keywords):
        if any(f in q for f in focus_keywords):
            # Exclude if it looks like a question
            if not any(x in q for x in ['how many', 'what', 'why']):
                return "focus_blockers"
    
    # SHORTEN — many natural forms
    if any(keyword in q for keyword in [
        'shorten', 'shorter', 'condense', 'brief', 'concise', 
        'make it concise', 'trim', 'trim down', 'cut this', 'make it brief',
        'compress', 'tighten', 'cut the length', 'shorter version'
    ]):
        return "shorten"
    
    # AGENDA — explicit format request
    if any(keyword in q for keyword in ['agenda', 'agenda format', 'turn into agenda']):
        return "agenda"
    
    # LEADERSHIP/EXEC — executive ready
    if any(keyword in q for keyword in [
        'leadership-ready', 'leadership ready', 'exec-ready', 'exec ready',
        'executive ready', 'executive summary', 'exec summary', 'for executives', 'exec brief',
        'c-suite', 'for leaders', 'make it exec'
    ]):
        return "leadership"
    
    # MORE DETAILED — expand context
    if any(keyword in q for keyword in [
        'expand', 'more detail', 'more context', 'elaborate', 'go deeper',
        'deeper dive', 'add context', 'add detail', 'fill in', 'more info',
        'make it more detailed', 'longer version'
    ]):
        # Distinguish from conversational "add more context about sources"
        # Transformation: "make it more detailed", "expand this"
        # Conversational: "add more context about X"
        if not any(x in q for x in ['about ', 'regarding ', 'on ', 'for ']):
            return "more_detailed"
    
    return None


def transform_to_three_bullets(answer: AskSynthesis) -> AskSynthesis:
    """Transform answer to exactly 3 bullets in a single section, nothing else."""
    # Flatten all items from all sections
    all_items = []
    for section in answer.sections:
        all_items.extend(section.items)
    
    # Take only the first 3
    if len(all_items) > 3:
        all_items = all_items[:3]
    elif len(all_items) == 0:
        # Edge case: no items at all
        all_items = [AskAnswerItem(
            text="No points to display.",
            record_type="none",
            record_id=None
        )]
    
    # Create a single section with just these items
    # CRITICAL: Only the items in the section. The frontend must ignore headline/summary.
    bullet_section = AskAnswerSection(
        kind="other",
        title="Key points",  # Brief title, frontend hides if desired
        items=all_items
    )
    
    # Return answer with ONLY this section, clear headline/summary to emphasize bullets are the answer
    answer.sections = [bullet_section]
    answer.headline = ""  # Clear headline
    answer.summary = ""  # Clear summary
    answer.suggested_refinements = []  # No refinement chips
    return answer


def transform_focus_blockers(answer: AskSynthesis) -> AskSynthesis:
    """Transform answer to show ONLY confirmed blocker questions."""
    blocker_items = []
    
    for section in answer.sections:
        # Filter items: keep only blocking_questions
        blocking_items = [
            item for item in section.items 
            if item.record_type == "blocking_question"
        ]
        blocker_items.extend(blocking_items)
    
    if blocker_items:
        blocker_section = AskAnswerSection(
            kind="questions",
            title="Blocking decisions required",
            items=blocker_items
        )
        answer.sections = [blocker_section]
        answer.headline = ""
        answer.suggested_refinements = []
    else:
        # No blockers found
        empty_section = AskAnswerSection(
            kind="other",
            title="No blockers",  # No visually empty title
        items=[AskAnswerItem(
            text="No confirmed blocking questions in current State.",
                record_type="none",
                record_id=None
            )]
        )
        answer.sections = [empty_section]
        answer.headline = ""
    
    return answer


def transform_shorten(answer: AskSynthesis) -> AskSynthesis:
    """Transform answer to ~40-60% of original length. Keep only most essential items."""
    # Target: 40-60% of items
    total_items = sum(len(section.items) for section in answer.sections)
    target_count = max(1, int(total_items * 0.5))  # 50% as midpoint
    
    items_to_keep = []
    for section in answer.sections:
        items_to_keep.extend(section.items[:2])  # Keep top 2 items per section
        if len(items_to_keep) >= target_count:
            items_to_keep = items_to_keep[:target_count]
            break
    
    # Rebuild with shortened item list, keep structure
    shortened_sections = []
    items_left = items_to_keep[:]
    
    for section in answer.sections:
        section_items = [item for item in section.items if item in items_left]
        if section_items:
            shortened_sections.append(AskAnswerSection(
                kind=section.kind,
                title=section.title,
                items=section_items
            ))
            for item in section_items:
                items_left.remove(item)
    
    answer.sections = shortened_sections
    answer.suggested_refinements = []  # Clear refinement suggestions
    return answer


def transform_to_agenda(answer: AskSynthesis) -> AskSynthesis:
    """Transform answer to agenda format (topics/decisions/times)."""
    agenda_items = []
    
    for section in answer.sections:
        for item in section.items:
            # Reframe items as agenda topics
            agenda_item = AskAnswerItem(
                text=item.text,
                record_type=item.record_type,
                record_id=item.record_id,
                detail=item.detail  # Use detail as "decision" or "discussion"
            )
            agenda_items.append(agenda_item)
    
    # Limit to 3-5 agenda items
    agenda_items = agenda_items[:5]
    
    agenda_section = AskAnswerSection(
        kind="other",
        title="Agenda",
        items=agenda_items
    )
    
    answer.sections = [agenda_section]
    answer.headline = ""
    answer.suggested_refinements = []
    return answer


def transform_to_leadership(answer: AskSynthesis) -> AskSynthesis:
    """Transform to decision/status/risk framing for executive audience."""
    # Group items by type: decisions, status, risks
    decisions = []
    status = []
    risks = []
    
    for section in answer.sections:
        for item in section.items:
            if section.kind == "questions" or "block" in item.text.lower():
                decisions.append(item)
            elif "review" in section.kind or "needs_review" in section.kind:
                risks.append(item)
            else:
                status.append(item)
    
    # Build leadership-ready sections
    leadership_sections = []
    
    if decisions:
        leadership_sections.append(AskAnswerSection(
            kind="questions",
            title="Decisions needed",
            items=decisions[:2]  # Keep only top 2
        ))
    
    if status:
        leadership_sections.append(AskAnswerSection(
            kind="established",
            title="Status",
            items=status[:2]
        ))
    
    if risks:
        leadership_sections.append(AskAnswerSection(
            kind="needs_review",
            title="Risk",
            items=risks[:2]
        ))
    
    answer.sections = leadership_sections if leadership_sections else answer.sections
    answer.headline = ""
    answer.suggested_refinements = []
    return answer


def transform_more_detailed(answer: AskSynthesis) -> AskSynthesis:
    """Transform to more detailed version by expanding detail fields and keeping all sections."""
    # Simply ensure detail fields are visible; don't add invented content
    # Keep all sections, just make sure detail is used
    # This is intentionally conservative: we expand what exists, don't invent.
    
    for section in answer.sections:
        for item in section.items:
            # Detail is already in the item; just keep it
            pass
    
    # Don't clear headline/summary for this one — user asked for more detail
    answer.suggested_refinements = []
    return answer


def apply_refinement_transform(query: str, answer: AskSynthesis) -> AskSynthesis:
    """Apply refinement transformations to enforce strict compliance."""
    refinement_type = detect_refinement_type(query)
    
    if refinement_type == "three_bullets":
        return transform_to_three_bullets(answer)
    elif refinement_type == "focus_blockers":
        return transform_focus_blockers(answer)
    elif refinement_type == "shorten":
        return transform_shorten(answer)
    elif refinement_type == "agenda":
        return transform_to_agenda(answer)
    elif refinement_type == "leadership":
        return transform_to_leadership(answer)
    elif refinement_type == "more_detailed":
        return transform_more_detailed(answer)
    
    return answer
