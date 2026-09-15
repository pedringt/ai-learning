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

#: Injected only when a project has zero active Current State items (see
# anthropic_provider.py/openai_provider.py's `_build_prompt`). Normal
# operation's consequentiality bar is calibrated against comparison with
# existing Current State; a brand-new or newly-adopted project has little or
# none to compare against, so applying that same bar silently produces
# "no_review" for real project knowledge with nothing for the user to
# reject or correct (2026-09-15 product finding: substantive first-evidence
# notes describing real project facts were returned no_review, while the
# same facts phrased as an explicit current-state statement were not).
BOOTSTRAP_GUIDANCE = """
- Current State is empty for this project -- there is nothing yet to compare Evidence against. Apply a bootstrap bar instead of the normal comparison-based one: bias toward coverage over strict filtering, since missing real project knowledge while establishing a baseline is more costly than proposing a few extra items for a human to review.
- Test each candidate fact against: would losing or misunderstanding this information materially affect someone's understanding of the project, how they operate it, evaluate it, or make decisions about it? If yes, propose it as missing_understanding even if it would not clear the normal bar once Current State already covered similar ground.
- Likely-consequential bootstrap information: product purpose and scope, important project rules, authority/governance rules, major technical architecture facts, current priorities, important constraints, decisions that materially affect future work, and meaningful unresolved questions (as open_question recommendations, not missing_understanding).
- A planning/spec document may mix settled decisions, tentative ideas, and explicit open questions. Do not classify the whole document from its overall tone or words such as "should". Preserve settled decisions as proposed maintained facts, keep genuinely tentative material as Evidence unless consequential, and surface important unresolved items as Questions.
- Do not propose low-level implementation detail or incidental historical facts as Current State just because Current State is empty -- the bootstrap bar is lower, not absent.
- If this Evidence contains several distinct baseline facts, still use the decision-sized grouping principle above (one Review per coherent topic/area) rather than one giant Review or a flood of one-line Reviews.
"""

#: Injected only when a person explicitly asks State to propose Evidence for
# Current State (the "promote" escape hatch -- api.py's
# POST /api/evidence/{id}/promote). This action is available even when the
# same Evidence already produced other Reviews or Questions: a prior partial
# interpretation must not prevent a person from saying "you missed something
# I want maintained." The person is deciding that the Evidence deserves
# Current State consideration; the model still decides what the Evidence
# actually establishes and how to phrase it.
#
# This does not bypass Review or let AI mutate Current State directly. Normal
# schema/semantic validation, stale/version protection, and human Review still
# apply after this.
USER_PROMOTION_GUIDANCE = """
The user has explicitly asked State to propose this Evidence for Current State. Treat the consequentiality decision as human-supplied for this pass: do not decline merely because the Evidence would not clear the normal consequentiality bar, and do not decline because this Evidence already produced another Review or Question. Re-read the Evidence for maintained facts that may have been missed and formulate the most accurate proposal(s) you can. Preserve uncertainty: settled decisions and established facts may become Current State proposals, while genuinely unresolved or tentative material should remain Questions/Evidence rather than being forced into Current State. Do not invent detail or convert uncertainty into certainty. Return no_review only when there is no maintainable fact to propose (for example the Evidence is empty/unintelligible, establishes only unresolved speculation, or the relevant fact is already exactly represented in Current State or an equivalent open proposal), and explain that plainly in no_review_explanation.
"""