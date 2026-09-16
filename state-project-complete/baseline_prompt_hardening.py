"""Baseline-only interpretation guidance from Issue #163 dogfooding.

The core Baseline Setup prompt defines the lifecycle. This small composition
layer sharpens the product-quality rules that became concrete during manual
setup testing without changing State's authority model or provider schema.
"""
from __future__ import annotations

from typing import Any, Mapping

_INSTALLED = False

_QUALITY_GUIDANCE = r"""
<baseline_setup_quality_checks>
Baseline Setup is assembling one editable Starting State. Straightforward, unambiguous, durable starting facts still MUST be emitted as missing_understanding create proposals when the Evidence establishes them. Those proposals are internal draft material: software keeps them out of the individual Review queue and presents them together in the Starting State draft. Do not return no_review merely because a routine baseline fact does not need its own approval click.

Reserve an individual Review for real human judgment:
- an explicit unresolved Question;
- contradictory claims where the Evidence does not establish which one is current;
- unclear recency or authority that makes a consequential claim unsafe to establish;
- a risk to already-maintained Current State; or
- a proposed change to an already-maintained fact.
If sources disagree and the available Evidence does not establish which is current, DO NOT choose one just to complete the baseline. Surface the uncertainty as an open_question or state_at_risk as appropriate.
If one source mixes settled facts with unresolved Questions, handle both independently. Explicit Questions must not crowd out or replace the durable facts the same source clearly establishes.

Quality checks for the Starting State:
- Treat meaningful source headings and numbered sections as strong organization signals. If the source already separates Product overview, Product principles, Product structure, Technical approach, Development focus, Evaluation, Open questions, or comparable sections, preserve that organization unless two headings are clearly the same durable category.
- Every baseline create proposal MUST include a useful non-empty proposed_area_name and proposed_topic. "General" is a last resort only when the source truly provides no meaningful organization and no coherent category can be inferred from the fact. Never place most of a structured source into General.
- If the source has no useful headings, infer a SMALL coherent taxonomy from the content. Reuse equivalent categories across facts and earlier sources instead of creating a new area for every sentence.
- Decompose the source into independently maintainable facts. A project definition, authority rule, product principle, product surface, technical approach, development priority, and evaluation rule are different facts even when they appear in the same paragraph or chunk. Do not summarize an entire section or multiple sections into one giant Current State statement.
- Preserve explicit bullets and named items when they can change independently. It is better to produce several concise draft facts under one stable section than one long fact containing a whole list of unrelated decisions or principles.
- Project stage and Project outcome are special header facts. Only use those topics when Evidence actually establishes lifecycle stage or outcome. Purpose, scope, or a general status narrative is not a stage/outcome merely because it sounds important.
- Preserve explicit named lists and their counts. Never say a plan has N exercises/components/items while naming only some of them or collapsing the rest into vague wording. Split independently changing named items into maintainable facts when they are durable enough for Current State.
- Setup coverage commentary such as "recent work is not fully specified" or "more Evidence may be needed" is setup feedback, not durable project truth. Surface a Question/coverage warning when consequential; do not store the warning as Current State.
- Prefer a small coherent area taxonomy. Reuse an existing or clearly equivalent broad area instead of near-duplicate headings such as "Governance" plus "Governance & Controls" or "Project Scope" plus "Project Purpose & Scope".
- Preserve hierarchy and framing. A learning exercise belongs under the learning plan/learning area unless the Evidence explicitly establishes it as a real active initiative. Hypotheticals, examples, options, and planned exercises must stay labeled as such.
- Never create a Current State fact or area description that merely says it was created during Baseline Setup or from human-authorized material. That is provenance/process metadata, not project truth.

Before returning, check the proposed Starting State against the source's major sections. If a major section contains clearly established durable project knowledge and none of that knowledge is represented by a create proposal, add the missing maintainable fact(s). Open Questions should remain Questions rather than being converted into Current State.
</baseline_setup_quality_checks>
""".strip()


def install_baseline_prompt_hardening() -> None:
    """Append dogfood-derived quality guidance only while baseline is active."""
    global _INSTALLED
    if _INSTALLED:
        return

    import baseline_setup

    original = baseline_setup.baseline_prompt_guidance

    def hardened_prompt_guidance(connection: Any, evidence: Mapping[str, Any]) -> str:
        prompt = original(connection, evidence)
        if not baseline_setup.is_baseline_setup(connection):
            return prompt
        return f"{prompt}\n\n{_QUALITY_GUIDANCE}" if prompt else _QUALITY_GUIDANCE

    baseline_setup.baseline_prompt_guidance = hardened_prompt_guidance
    _INSTALLED = True
