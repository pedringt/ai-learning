# State product risk register

Keep this focused on material product/AI risks, not every possible defect. Link actionable mitigation work to GitHub Issues.

State is a portfolio/learning product. Some risks below deliberately model what a real company product would need to manage. Do not interpret those hypothetical production risks as evidence of real customers or an external rollout.

| ID | Risk | Severity | Current mitigation | Status / trigger |
| --- | --- | --- | --- | --- |
| R-001 | AI presents unsupported or fabricated information as established project truth | P1 | Human authorization boundary; Ask grounding rules; real-model evals; regression tests for known failures | Active. Treat provenance/certainty failures as release-relevant. |
| R-002 | Unknown or ambiguous evidence is converted into false certainty (for example unknown -> zero/false/absent) | P1 | Semantic validation, eval cases, human review for consequential ambiguity | Active. Add regression/eval case for every reproduced variant. |
| R-003 | Cross-project data or writes leak between projects | P0 | Explicit project identity on requests; isolation tests; deployed QA | Active. Any recurrence blocks release. |
| R-004 | State creates too many Reviews and people stop treating them as meaningful | P1 | Consequentiality rules; review-burden eval dimension; selective escalation | Active product risk. Evaluate with representative scenarios and review samples rather than pretending real-user burden data exists. |
| R-005 | State misses a consequential change that should have reached human review | P1 | Real-model consequentiality evals plus deterministic enforcement where possible | Active. False negatives matter more than small precision loss. |
| R-006 | Stale proposals overwrite newer project truth | P0 | Version checks / stale-review blocking / atomic transitions | Mitigated by deterministic controls; keep regression coverage. |
| R-007 | Ask confuses pending Reviews/open Questions with Current State | P1 | Grounding rules, record-backed retrieval/navigation, evals | Active. Treat confident misrepresentation as a release blocker. |
| R-008 | Real-model QA becomes expensive/noisy and gets skipped or overused | P2 | `qa-fast` vs `qa-release`; model-sensitive diff gating; targeted live-model checks | Managed. Prefer cheaper deterministic layers first. |
| R-009 | Project-area identifiers are not truly project-scoped before a third project is added | P1 before scale-up | Known limitation documented in project status | Deferred. Must be resolved before a third project is introduced. |
| R-010 | Shared staging data accumulates test Evidence and influences Ask/evals | P2 | Explicit clean-baseline decisions; avoid unapproved resets; distinguish deterministic from live staging tests | Active operational risk. |
| R-011 | A real deployment could send confidential, personal, or otherwise sensitive source content to a model/provider, trace, or log without an explicit data-handling decision | P1 | Portfolio/demo data boundary; `DATA_PRIVACY.md`; PR data-impact check; least-privilege/source-authorization requirements for any hypothetical real connector | Hypothetical production risk. Becomes active implementation risk before any real company source is connected. |
| R-012 | Model latency or per-task cost makes core workflows impractical even when output quality is acceptable | P2 | Measure representative Evidence/Ask latency and provider cost; keep real-model checks targeted; evaluate quality/cost/speed together | Active AI-product tradeoff. Use measured test/eval runs, not invented user metrics. |
| R-013 | A provider/model/prompt/config change shifts semantic behavior without an obvious software regression | P1 | Pin/record model configuration where practical; model-sensitive PR checklist; targeted evals before consequential release; rollback plan | Active. Re-evaluate known behavior families after meaningful model or prompt changes. |

## How to use this file

- Add a risk when it can materially affect trust, authority, user burden, data isolation, privacy, cost, latency, or release confidence.
- Open an Issue when mitigation requires work; do not use this table as the implementation backlog.
- Close/remove risks only when the underlying condition is genuinely gone. If merely accepted or deferred, say so.
- After a P0/P1 incident, check whether this register needs a new risk or stronger mitigation.
- Keep hypothetical enterprise risks clearly labeled until the product actually has the data/users that make them real operational risks.
