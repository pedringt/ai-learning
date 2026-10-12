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
    baseline_manual_setup POST /api/baseline/manual (api_core.process_evidence).
api_core.resolve_review    + baseline_setup.with_baseline_organization
    Files accepted Baseline facts under their proposed area/topic.
    Read by: api_core POST /api/reviews/{id}/resolve.
api_core._provider_from_env + baseline_setup.with_baseline_providers
    Builds the Baseline provider classes (chunking, area/topic schema, Baseline
    prompt guidance) instead of the plain adapters.
    Read by: api_core lifespan, evidence intake helper, _reanalyze, /api/ask and
    /api/ask/stream; baseline_async_intake._selected_provider.
"""
from __future__ import annotations

import api_core
import baseline_setup


def compose_baseline_runtime() -> None:
    api_core.process_evidence.add_layer("baseline_metadata", baseline_setup.with_baseline_metadata)
    api_core.resolve_review.add_layer("baseline_organization", baseline_setup.with_baseline_organization)
    api_core._provider_from_env.add_layer("baseline_providers", baseline_setup.with_baseline_providers)
