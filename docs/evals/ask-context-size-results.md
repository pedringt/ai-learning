# Ask context size, up to the whole project: results (DEC-023 follow-up, #653, Nov 14)

**Run:** State eval matrix suite `contextsize`, [run 43676969245](https://github.com/pedringt/ai-learning/actions/runs/43676969245), branch `eval/653-context-size`.
- **Model and size:** Haiku 5.5, 3 repeats × 31 questions × 5 conditions = 465 calls.
- **Outcome:** 0 errors. Actual spend **$0.835** (7.51M input and 0.17M output tokens), against an estimate of $0.82.

**Setup:**
- Each question goes through the real streaming Ask (`stream_ask_events`) on the synthetic #653 benchmark project: 245 records and a twin project.
- **Selection recall** is the share of each question's needed records that the model put in its selection. It is not answer quality: the Ask quality suites were not run here.
- **Latency** is measured from the provider call: first token, and the finished answer including checks.

**Conditions:**
- `today`: the current code, with windows and word matching.
- `x1`: no windows (DEC-023) at today's per-type limits.
- `x1_5` and `x2`: no windows, with the limits scaled.
- `whole`: no retrieval; every record goes to the model.

## Results

| Condition | Selection recall | All needed selected | First token p50 / p90 | Finished p50 / p90 | Input tokens | Cost per Ask |
|---|---|---|---|---|---|---|
| today | 0.45 | 36% | 850 / 1,446 ms | 2.06 / 2.83 s | 11.5k | $0.0013 |
| x1 (DEC-023) | 0.73 | 68% | 787 / 1,420 ms | 2.12 / 2.90 s | 11.6k | $0.0013 |
| x1.5 | 0.86 | 82% | 847 / 1,371 ms | 2.10 / 2.69 s | 13.2k | $0.0015 |
| **x2** | **0.96** | **95%** | 880 / 1,460 ms | 2.25 / 3.11 s | 14.5k | $0.0016 |
| whole | 0.92 | 90% | 1,046 / 1,555 ms | 2.21 / 3.10 s | 30.0k | $0.0032 |

**Selection recall by family:**

| Family | today | x1 | x1.5 | x2 | whole |
|---|---|---|---|---|---|
| windows | 0.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| paraphrase | 0.33 | 0.17 | 0.50 | 0.83 | 0.94 |
| links | 0.70 | 0.80 | 0.80 | 0.97 | 0.90 |
| answered Questions | 0.20 | 0.80 | 1.00 | 1.00 | 0.93 |
| superseded | 0.50 | 1.00 | 1.00 | 1.00 | 1.00 |
| flood | 0.50 | 0.50 | 1.00 | 1.00 | 1.00 |
| same word | 1.00 | 1.00 | 1.00 | 1.00 | 0.67 |
| pending vs accepted | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

No forbidden record was selected in any call.

## What it shows

- **Cost and latency barely move with size at this scale.**
  - Time to first token rises from about 0.85 s to about 1.05 s for the whole project.
  - The finished answer stays at about 2.1–2.2 s.
  - The whole project costs about $0.003 per Ask, against $0.0013 today.
  - Actual input is about 1.4× the dry-run estimate, because the estimate assumed 3.5 characters per token.
- **The model doesn't fully replace retrieval.** Given every record, it selected the needed ones less often than at ×2 (0.92 vs 0.96). Its misses were:
  - "What was approved?": the Review behind "Approved, go ahead." was missed in all 3 runs. Link expansion is meant to fix exactly this.
  - "When is the design review?": missed in all 3 runs. Here the model selected nothing from Evidence.
  - One paraphrase and one answered Question.
- **The model handles most paraphrases itself once the record reaches it:** 0.83 at ×2 and 0.94 for the whole project, against 0.17–0.50 at smaller limits. The ×2 misses were mostly "What did Legal say about the data processing agreement?" (3 of 3).
- **Caveats:**
  - It's the synthetic fixture and 31 questions, 3 runs each, so small numbers. One case decides a family's score.
  - Real projects are smaller today: production Northstar's whole project would be well under this fixture's 30k tokens.
  - Answer quality and authority wording were not measured.

## Not decided

The budget (DEC-023 item 2) and whether to use whole-project context (item 4's option 3) are Paige's decisions.

## DEC-023 before/after (Nov 14)

**After side:** `contextnow` suite, [run 43683640532](https://github.com/pedringt/ai-learning/actions/runs/43683640532), on staging code `6b760b6` (DEC-023 plus #662, which doesn't change retrieval). 93 calls, 0 errors, **$0.172**.

**Before side:** the `today` condition of run 43676969245, on the code before DEC-023. Same fixture, questions, model and repeats.

| | Before | After DEC-023 |
|---|---|---|
| Selection recall | 0.446 | **0.964** |
| All needed records selected | 36% | 96% |
| First token p50 / p90 | 850 / 1,446 ms | 795 / 1,356 ms |
| Finished p50 / p90 | 2.06 / 2.83 s | 2.07 / 2.70 s |
| Input tokens per Ask | 11.5k | 16.7k |
| Cost per Ask | $0.0013 | $0.0019 |
| Forbidden records selected | 0 | 0 |

**By family, before → after:**
- windows 0.00 → 1.00
- answered Questions 0.20 → 1.00
- links 0.70 → 1.00
- superseded 0.50 → 1.00
- flood 0.50 → 1.00
- paraphrase 0.33 → 0.83
- same word and pending vs accepted stay at 1.00.

**The one miss:** "What did Legal say about the data processing agreement?" (p6) in all 3 runs. This measures record selection, not answer quality. The Ask quality check on the combined release is separate (the coordinator runs it).
