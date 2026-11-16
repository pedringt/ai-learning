# Copy Context filtered by task text: measurement (DEC-023 item 6, Nov 15)

**Question:** should Copy Context ("Working context") keep only the records relevant to the "What are you working on?" text, instead of copying all of them?

**Status:** measured with no model calls. Nothing is decided or changed.

**How:**
- `eval/copy_context_benchmark.py` runs 12 task texts against the #653 benchmark project: 30 State items, 8 pending Reviews and 12 open Questions.
- Each task has its needed records, true by construction.
- Four filters were tried, using today's word matching and BM25. Each was tried two ways: keep only matching records, or keep the top 8 per type.

| Filter | Needed records kept | Tasks with every needed record | Items copied | Copy size |
|---|---|---|---|---|
| Everything (today) | 1.00 | 100% | 50 | 3,034 chars (100%) |
| Word match, matching only | 0.88 | 83% | 3.5 | 212 (7%) |
| Word match, top 8 per type | 0.88 | 83% | 24 | 1,467 (48%) |
| BM25, matching only | 0.88 | 83% | 3.1 | 189 (6%) |
| BM25, top 8 per type | 0.88 | 83% | 24 | 1,472 (48%) |

**What every filter missed:**
- "Write the go-live checklist" lost "Public launch date is March 3" (a paraphrase).
- "Write the public launch announcement" lost "English and German ship first; French follows".

**Real copy sizes today** (production, Nov 15, read-only):
- Northstar: 25 State, 7 pending Reviews, 19 open Questions; about 6,200 characters (about 1,550 tokens).
- Juniper: about 1,900 characters.

## What it shows

- **The full copy is already small.** At today's project sizes it's 1–2k tokens, so a filter would save at most about 1.5k tokens of pasted text.
- **Every filter dropped accepted facts the task needed:** 1 in 8 of the needed records, and 1 task in 6 lost something.
- **The loss is silent.** A Copy Context the person pastes into another tool would carry no sign that a governing fact was left out.
- **The fixture is synthetic** and the case count is small.

**Decided (Paige, Nov 15):** Copy Context stays complete (DEC-023). Fallback if copies grow large: keep all Current State and filter only Reviews and Questions (100% of needed records kept, 65% of the size, on the fixture).
