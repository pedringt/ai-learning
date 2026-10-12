"""Compose Baseline Setup into State's core runtime (#502).

Every Baseline behaviour that changes a core module goes through an extension
point that module declares (see ``extension_points.ExtensionPoint``). This is
the one place that adds the layers, in order. Adding a layer twice is a no-op,
so calling ``compose_baseline_runtime()`` more than once is safe.

Inventory (what each layer changes, and who reads it):

api_core.process_evidence  + baseline_setup.with_baseline_metadata
    Persists area/topic hints and chunk coverage after a successful run.
    Read by: api_core POST /api/evidence and /api/evidence/upload (shared intake
    helper), /api/evidence/{id}/reanalyze and /promote (_reanalyze);
    baseline_manual_setup POST /api/baseline/manual and
    baseline_async_intake._analyze_in_background (both call api_core.process_evidence;
    the latter used to be re-pointed by api.py).
api_core.resolve_review    + baseline_setup.with_baseline_organization
    Files accepted Baseline facts under their proposed area/topic.
    Read by: api_core POST /api/reviews/{id}/resolve.
api_core._provider_from_env + baseline_setup.with_baseline_providers
    Builds the Baseline provider classes (chunking, area/topic schema, Baseline
    prompt guidance) instead of the plain adapters.
    Read by: api_core lifespan, evidence intake helper, _reanalyze, /api/ask and
    /api/ask/stream; baseline_async_intake._selected_provider.
baseline_setup.split_evidence_text + baseline_dogfood_fixes.with_section_aware_split
    Splits by numbered/Markdown source sections before size-based chunking.
    Read by: the Baseline provider classes' interpret (chunking) and
    baseline_resilience's max_tokens retry split.
baseline_setup.baseline_prompt_guidance + baseline_prompt_hardening.with_quality_guidance
    Appends the Baseline quality checks while a project is in Baseline Setup.
    Read by: the Baseline provider classes' _build_prompt.
review_service.list_presented_reviews + baseline_review_visibility.with_actionable_reviews
    Hides routine Starting State creates from the open Review list during Baseline Setup.
    Read by: api_core (bootstrap, attention, evidence responses, reanalysis,
    GET /api/reviews, resolve response) and ask_service._compact_candidates, both
    as ``list_reviews``. The raw review_service.list_reviews (baseline_draft) is unchanged.
anthropic_provider.interpret_call + baseline_resilience.with_max_tokens_retry
    Retries a Baseline Setup chunk that hit max_tokens as smaller pieces (split with
    baseline_setup.split_evidence_text) and merges them. Read by every
    AnthropicProvider.interpret, including the Baseline subclass's per-chunk calls
    (formerly a patch of the AnthropicProvider.interpret class attribute).

Replaced by plain code (no longer composed at runtime):
- baseline_async_intake._analyze_in_background is the delete-safe version.
- seed_demo._PROJECT_DEPENDENT_TABLES lists baseline_evidence_coverage first.
- 015_baseline_setup.sql was already in database_migration_backed's expected list.
"""
from __future__ import annotations

import anthropic_provider
import api_core
import baseline_setup
import review_service
from baseline_dogfood_fixes import with_section_aware_split
from baseline_prompt_hardening import with_quality_guidance
from baseline_resilience import with_max_tokens_retry
from baseline_review_visibility import with_actionable_reviews


def compose_baseline_runtime() -> None:
    api_core.process_evidence.add_layer("baseline_metadata", baseline_setup.with_baseline_metadata)
    api_core.resolve_review.add_layer("baseline_organization", baseline_setup.with_baseline_organization)
    api_core._provider_from_env.add_layer("baseline_providers", baseline_setup.with_baseline_providers)
    baseline_setup.split_evidence_text.add_layer("section_aware", with_section_aware_split)
    baseline_setup.baseline_prompt_guidance.add_layer("quality_checks", with_quality_guidance)
    review_service.list_presented_reviews.add_layer("baseline_actionable", with_actionable_reviews)
    anthropic_provider.interpret_call.add_layer("baseline_max_tokens_retry", with_max_tokens_retry)
