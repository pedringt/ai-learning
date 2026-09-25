# State

**State is a maintained-project-understanding tool.** It keeps a trustworthy view of what a project currently treats as true instead of rebuilding that view from project history every time someone asks.

Its central rule is:

> **AI interprets. Software enforces. People authorize.**

State is the flagship project in an applied-AI learning portfolio. It is a working product with a live model, backend, database, deterministic tests, browser QA, and a real deployment workflow. It is still a portfolio and learning product, not a planned external pilot or customer rollout. Portfolio reviewers may interact with it as a demo. Product exercises in this repo sometimes model what a real team would need, but they should never invent customers, adoption, pilot results, or production-user evidence.

## Product model

| Object | What it means |
|---|---|
| **Evidence** | Immutable record of what was said, observed, or imported. Evidence does not silently become truth. |
| **Current State** | Maintained facts the project currently treats as true. |
| **Reviews** | AI-proposed interpretations or changes that need human judgment. |
| **Questions** | Important unknowns. Questions can be open or explicitly blocking. |
| **History** | Atomic record of accepted transitions and their provenance. |
| **Ask** | Read-only synthesis over maintained project context. It must keep accepted facts, pending reviews, questions, and evidence distinct. |

Core invariants:

- AI can propose. It cannot authorize a Current State change.
- Evidence is immutable. Corrections supersede rather than rewrite.
- Current State changes require explicit human authorization. During normal operation, consequential changes go through Review; Baseline Setup separately confirms routine Starting State facts.
- Accepted changes update Current State and History atomically.
- Stale proposals fail closed through version checks.
- Schema-valid output can still be semantically wrong.
- Unknown must never be silently converted into `0`, `false`, or absent.
- Ask cannot directly mutate project records and must not present pending proposals or uncertainty as settled fact. An unanswered Ask can hand a Question to a person to review and add.
- Project data must remain isolated across projects.

## Repository map

The repository root also contains the public portfolio site.

| Path | Purpose |
|---|---|
| `implementation-context-prototype/` | Authoritative State frontend used by the live product. |
| `state-project-complete/` | Authoritative FastAPI backend built by Render. |
| `state-project-complete/migrations/` | Numbered database migrations. Use the directory itself as the source of truth for the current migration set. |
| `state-project-complete/eval/` | Executable model/evaluation harnesses. |
| `qa/deployed/` | Deployed-staging Playwright QA. |
| `tools/` | Local visual-regression and Ask-flow capture tools. |
| `docs/product/` | Product brief, decisions, risks, metrics, privacy assumptions, and GitHub operating model. |
| `docs/qa/` | Human/Cowork QA instructions and reporting templates. |
| `docs/evals/` | Eval registry and guidance. |
| `docs/incidents/` | Incident-review template and records. |
| `docs/history/` | Historical snapshots and superseded implementation notes. |
| `docs/PROJECT_STATUS.md` | Canonical current-state handoff. Read this first when resuming work. |
| `QA.md` | Canonical QA contract. |
| `RELEASE.md` | Current release and rollback gate. |
| `CLAUDE.md` | Instructions for Claude/AI coding sessions. |

The historically named frontend files such as `context-feedback-pass*.js`, `context-design-pass.js`, `context-attention-alignment.js`, and `context-final-mobile.js` are still live runtime code. Their names look temporary, but prior cleanup investigation found they are not safe to delete casually.

## Current implementation

State currently includes:

- project switching with seeded Northstar and Juniper Office Move examples
- Evidence/Notes intake
- AI interpretation with deterministic validation and human authority checks
- grouped Reviews whose pending proposals currently share one Review-level decision
- human adjustment of AI proposals while preserving provenance
- Question creation/linking/resolution flows
- Current State as a readable project wiki
- History with before/after decision provenance
- Ask with authority-aware grounding, streaming, follow-ups, and cancellation
- project rules in Settings
- Slack as the shipped external integration, with approved-channel intake and Slack sharing

The backend supports SQLite and Postgres through `db.py` and numbered migrations. The current production portfolio deployment uses persistent SQLite on Render; staging uses ephemeral SQLite.

## Running locally

### Backend

```bash
cd state-project-complete
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL="sqlite:///tmp/state.db"
export STATE_PROVIDER=anthropic
export ANTHROPIC_API_KEY="..."
export STATE_DEMO_BOOTSTRAP=1

python -m uvicorn api:app --reload --port 8000
```

Use the project virtual environment and pinned requirements. Do not rely on globally installed provider SDK versions.

Check startup:

```bash
curl http://127.0.0.1:8000/health
```

Migrations run automatically at startup and are recorded in `schema_migrations`.

### Frontend

`implementation-context-prototype/index.html` can open directly from `file://`. To point it at a local backend, set:

```html
<script>window.STATE_API_BASE = 'http://127.0.0.1:8000';</script>
```

or set `data-api-base` on the `<html>` element.

## QA

The preferred entry point is the root `Makefile`:

```bash
make qa-bootstrap   # one-time local dependency setup
make qa-fast        # deterministic/free regression checks
make qa-release     # release gate, including model-sensitive checks when required
```

`qa-fast` is the routine confidence layer. It runs the deterministic Python and frontend behavior suites without intentionally spending model tokens.

GitHub Actions runs the same fast QA on every pull request and on pushes to `main` and `staging`. The JavaScript job automatically discovers every `state-*-tests.js` file so adding a new behavior suite does not require maintaining a manual list.

For deployed staging checks, use the workflows and instructions in `qa/deployed/` and `docs/qa/`. Real-model QA is deliberately targeted because it costs money and introduces model variance.

See `QA.md` for the full contract, finding types, and release expectations.

## Release flow

- `main` is production.
- `staging` is the test/review branch.
- Feature work starts from `staging`.
- Product/site changes go through `staging` before `main` unless the user explicitly authorizes a narrow exception.
- Passing tests is not permission to deploy.
- Promotion to `main` always requires explicit current authorization.
- After a backend change reaches a Render-backed branch, verify the actual `/health` build SHA with `scripts/verify-render-deploy.sh`; do not rely only on the Render dashboard saying a deploy is live.

The current release and rollback procedure lives in `RELEASE.md`. Older deployment checklists have been moved under `docs/history/` and are not operational instructions.

## Deployment surfaces

| Surface | Host | Source |
|---|---|---|
| Portfolio production (`www.contextswitch.tech`) | Vercel project `ai-learning` | `main` |
| State frontend production (`state.contextswitch.tech`) | Vercel project `state` | `main` |
| State API production (`state-api`) | Render | `main` |
| State frontend staging | Vercel preview/staging deployment | `staging` |
| State API staging (`state-api-staging`) | Render | `staging` |

Vercel is currently on Pro. This repository still deploys both the `ai-learning` and `state` Vercel projects, so avoid unnecessary repeated deploys. The staging Render service can sleep after idle.

Secrets such as database URLs, model API keys, and Slack credentials belong in deployment environment settings and are never committed.

## Product and AI operating docs

For PM/product work, use these instead of burying decisions in chat:

- `docs/product/PRODUCT_BRIEF.md`: who/what State is for, product boundary, principles
- `docs/product/DECISIONS.md`: settled product decisions
- `docs/product/RISKS.md`: known risks and mitigations
- `docs/product/METRICS.md`: quality, latency, cost, and review-burden measurement design
- `docs/product/DATA_PRIVACY.md`: demo-data reality and hypothetical real-company requirements
- `docs/evals/README.md`: eval registry
- `docs/incidents/`: incident learning loop

The project is GitHub-first: Issues track work/problems/questions, the Project board tracks work state, PRs record changes, and Actions provide automated QA evidence.

## Known constraints and debt

These are deliberate or documented, not accidental omissions:

- State is not a multi-tenant production SaaS. Auth/organizations are out of scope for this portfolio product.
- State does not use a vector database or generic agent architecture. Selection and authority boundaries are intentionally explicit.
- The frontend still has several historically named live patch files. Consolidation was investigated and caused regressions; revisit only for a concrete product or maintenance reason.
- `project_areas.id` is still globally keyed rather than project-scoped. It is safe for the current seeded projects but should be redesigned before expanding the project model further.
- Model/provider behavior can drift even when software does not. Consequential model/prompt/config changes should be paired with relevant eval evidence.
- Latency and model cost are product-quality dimensions, not just engineering details. The measurement approach is documented in `docs/product/METRICS.md`.

## Where to start

If you are joining the project or resuming after a break:

1. Read `docs/PROJECT_STATUS.md`.
2. Read `docs/product/PRODUCT_BRIEF.md` and `docs/product/DECISIONS.md` for product intent.
3. Read `QA.md` before testing or changing QA behavior.
4. Check the relevant GitHub Issue/Project item before starting implementation.
5. Verify the repo and deployed environments rather than relying on old conversation memory.
