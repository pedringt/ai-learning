"""Shared interpretation instructions for consequentiality filtering and
decision-sized Review grouping (state.md #104).

Both provider adapters (anthropic_provider.py, openai_provider.py) inject this
into their prompts so the two providers see the same semantic guidance, the
same way question_review_prompt.py already keeps open_question instructions
shared. This is guidance for the existing single interpretation call, not a
second model pass. Keep additions here concise -- this text is static
overhead on every interpretation call.
"""

CONSEQUENTIALITY_AND_GROUPING_GUIDANCE = """
- Filter for consequentiality first: a Review needs Evidence that materially changes/threatens Current State, establishes an important missing fact, answers/raises a consequential Question, or changes scope/decisions/ownership/risk/authority -- not scheduling chatter, acknowledgements, minor wording, or a fact already accurately represented in Current State.
- Do not treat "one fact = one Review" as a rule. Group closely related details into one Review when they form one coherent decision; split when a human could reasonably agree with one claim and disagree with another (e.g. a launch date, a security approval, and a scope change are independent; "read-only pilot requiring human approval" is one policy).
- Never recommend a Review whose only action is a bare acknowledgment. missing_understanding must state the concrete new fact (never an empty proposed_changes list); state_at_risk must name the at-risk item(s); use resolves_question_ids or open_question when those fit better. If none apply, return no_review instead of creating a Review.
- If Evidence itself establishes a concrete decision, approval, or milestone (e.g. a contract signed, a stage/phase change, a budget approval), that fact always gets its own missing_understanding or proposed_update recommendation, even when it also raises separate downstream questions or risks. Do not let follow-up open_question/state_at_risk recommendations about what the milestone implies substitute for recording the milestone itself -- record both.
- Dense Evidence often bundles several distinct consequential items (e.g. one milestone AND a separate new policy, in the same note). Before finalizing, re-scan the Evidence paragraph by paragraph: each distinct consequential claim needs its own recommendation (grouped only when it is genuinely one coherent decision) -- do not stop early and let a few salient recommendations stand in for the rest of the Evidence.
- Before finalizing, check each open Question shown above against this Evidence: if Evidence concretely establishes the answer, include that Question's ID in resolves_question_ids on the recommendation that reflects the answer, even when that recommendation's main subject is something else (e.g. a security-approval update that also happens to answer a retention Question).
"""
