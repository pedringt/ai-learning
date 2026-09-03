State R9.4.2 — OpenAI benchmark + Ask contract fix

Why
- The deployed OpenAI Ask path was only appending "Return JSON only".
- OpenAI returned plausible but wrong selection keys like:
  state / reviews / questions / history / evidence / rules
- State requires the exact AskSelection schema:
  state_ids / review_ids / blocking_question_ids / question_ids / history_ids / evidence_ids
- The fast-path fallback then made a second OpenAI call and failed the same contract.

Fix
- OpenAI Ask now uses strict JSON-schema structured output for both fast synthesis and one-call fallback.
- OPENAI_MODEL is now read from Render env, defaulting to gpt-4.1-mini.
- OpenAIProvider default model is gpt-4.1-mini.
- Ask timing logs now include provider and model so benchmark results are unambiguous.
- Regression test verifies structured-output use.

Verification
- Full backend/integration suite: 201 passed, 3 skipped, 7 subtests passed.
- Targeted Ask/frontend tests: 49 passed.

Render settings after deploy
- STATE_PROVIDER=openai
- OPENAI_MODEL=gpt-4.1-mini
- Keep ANTHROPIC_API_KEY and CLAUDE_MODEL in place for easy rollback/comparison.

After deploy
- Run: Prep me for the security meeting
- Copy the new Ask timing line; it will include provider=openai model=gpt-4.1-mini.
