# AI interpretation tracing

Issue #141 adds lightweight, vendor-neutral tracing around State's existing interpretation pipeline. The goal is diagnosis, not a new observability platform.

## What one trace records

A trace gets a stable `trace_...` ID before the interpretation starts and links it to the durable `interpretation_record_id` created by State. The trace separates the run into layers so an eval failure can be localized instead of treated as a generic model problem:

1. **Evidence/input**: Evidence ID, source type, content hash/length, and optionally the full content.
2. **Context supplied**: the exact Current State and open-Review authority snapshot passed to the provider.
3. **Prompt/instructions**: prompt family plus a hash/length of the prompt reconstructed by the same provider prompt builder from the same inputs. Local eval/debug traces can include the full prompt.
4. **Provider/model**: provider, model identifier, and provider-call timing.
5. **Model interpretation**: the provider output before State normalization and the structured result persisted after normalization.
6. **Validation**: whether the provider call, normalization, schema validation, and semantic validation succeeded or failed.
7. **Classification**: `no_review` versus `review_recommended` and recommendation count.
8. **Final deterministic action**: Review IDs, Review details, proposed State changes, Question links, and Current State versions before/after the interpretation.
9. **Errors and timing**: pipeline error code, provider error when present, provider timing, and total timing.

This lets an eval report say, for example, that retrieval/context was correct, the raw model output first lost uncertainty, validation accepted that structurally valid output, and the deterministic layer correctly created a Review from what it was given.

## Evals

`eval/harness.py` now runs each scenario through `run_traced_interpretation()` and stores the resulting `trace_id` and `trace_path` on `ScenarioResult`. `eval/run_eval.py` prints trace IDs beside misses, unnecessary Reviews, ambiguous cases, and errors, and includes trace IDs/paths in its JSON report.

By default local eval traces are written under `state-project-complete/eval/traces/`. That directory is gitignored. `STATE_EVAL_TRACE_DIR` can point the run elsewhere.

## Redaction and sensitive content

`TracePolicy` owns content capture. Its default is conservative:

- Evidence text is **not** stored, only a SHA-256 hash and character count.
- Full prompt text is **not** stored, only a SHA-256 hash and character count.
- Full raw/normalized model payloads are **not** stored; outcome, topics, recommendation count, hash, and size are retained.
- API keys and provider credentials are never copied into the trace.

Local eval/debug runs use `TracePolicy.eval_debug()` so the exact Evidence, prompt, and model payload can be inspected while diagnosing a controlled test case. Production callers should use the redacted default unless there is an explicit retention/privacy decision for richer content.

## Scope of this first version

The wrapper is reusable around any `process_evidence()` call, but this first integration is deliberately attached to the eval/failure-diagnosis path rather than automatically writing full traces for every live user submission. That avoids silently introducing production content retention while still satisfying the immediate product need: failed eval cases now carry enough structured evidence to identify the first observable wrong layer.

A later production integration can call the same wrapper with the redacted policy or export the trace fields to OpenTelemetry, AWS, Datadog, Langfuse, or another system without changing State's authority model.
