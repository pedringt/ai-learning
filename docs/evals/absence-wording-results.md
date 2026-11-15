# How Ask words absence: results (DEC-023 item 7, Nov 15)

**Run:** eval-matrix suite `absence`, [run 43745803115](https://github.com/pedringt/ai-learning/actions/runs/43745803115). Haiku 5.5, 11 questions × 5 repeats = 55 calls, 0 errors, **$0.099**.

**Setup:**
- Fixture: the #653 benchmark project, with today's (DEC-023) retrieval.
- Scoring: deterministic phrase checks on the displayed answer (`eval/absence_wording.py`); no grader model.

| Group | What a good answer does | Result |
|---|---|---|
| No record answers it (5 questions) | says it isn't recorded; invents no number; no denial about the world | **25 / 25** |
| Yes/no, nothing on record settles it (3) | record-first ("State has no recorded Security approval"), never "No, Security hasn't approved" | **15 / 15** |
| A record answers it but wasn't in the model's context (3) | must not say State has no record, since the record exists | **0 / 15** |

**Examples from the third group:**
- "State has no record of a wellness program", when 3 wellbeing notes exist.
- "State has no recorded Legal statement about the data processing agreement", when "Counsel signed off on the DPA on Oct 2" exists. A few answers added "among the supplied records".
- "State does not have enough confirmed information to say who is getting new laptops", when the laptop-refresh notes exist.

## What it shows

- **True absence and denial temptations are handled well.** The record-first wording rule works: no world-denials and no invented numbers in 40 answers.
- **When retrieval misses a record, Ask always says, as fact, that State has no record of it.**
  - The only hedge is DEC-015's fixed footer: "Based on what's recorded in State. There may be things it doesn't know about."
  - The prompt tells the model that the records it's given are State's records, so the wording follows that instruction.
- **How often this happens:** since DEC-023, retrieval misses are rare on the fixture. The model had the needed records for 0.96 of questions, and the misses were paraphrases and old notes with no shared words. In those cases the answer's first line is false, not just incomplete.

## Possible responses (not decided)

1. **Accept it.** The footer already says State may not know everything, and misses are rare.
2. **Change the wording rule.** Ask would say absence relative to what it looked at: for example "State's records I checked don't show …" or "I couldn't find a record of …". It's a prompt change, so it needs the before/after Ask suites (CLAUDE.md), and it would weaken the clear "State has no record" answer for true absence too.
3. **Change it only when the context was cut.** Ask knows when retrieval left records out (the project had more records than the limits). Only then would it use "I couldn't find …" wording, leaving true absence in small projects unchanged.

Which response to take is Paige's decision.

## Decision and change (Paige, Nov 15): word absence relative to what Ask looked at, only when retrieval cut the context

**How it works:**
- `_context_was_cut` is true when some record type had more records than were sent to the model.
- Only then does the prompt change:
  - The base absence sentence and its denial examples say "the records I looked at".
  - An extra rule forbids "State has no record of X" for things no supplied record mentions.
- A project sent whole keeps the plain wording.

| Run | No record answers it | Yes/no, nothing settles it | Record exists, not sent | Answers with "State has no record" wording |
|---|---|---|---|---|
| Before, run 43745803115 | 25/25 | 15/15 | 0/15 | 55 |
| Extra rule only, run 43760830372 | 25/25 | 15/15 | 10/15 | 37 |
| **Base sentence replaced, run 43763944832 (`8841a8d`)** | **25/25** | **15/15** | **15/15** | 3 |

**Each run:** 55 Haiku 5.5 calls, about $0.10. The last run's absence answers read like "The records I looked at don't show a budget for the Japan expansion."

**Production:** Northstar has 25 Current State items against a limit of 24, so some Northstar questions count as cut and get this wording.

**Before promotion:** the Ask quality suite on staging, a prompt change (CLAUDE.md).
