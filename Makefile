.PHONY: qa-bootstrap qa-fast qa-release qa-js qa-python qa-real-model

# The project venv if it exists, else python3 (a stock Mac has no `python`). Override with PYTHON=...
PYTHON ?= $(if $(wildcard state-project-complete/.venv/bin/python),$(CURDIR)/state-project-complete/.venv/bin/python,python3)

qa-bootstrap:
	cd state-project-complete && $(PYTHON) -m pip install -r requirements.txt && $(PYTHON) -m pip install -r requirements-dev.txt
	$(PYTHON) -m playwright install chromium

qa-fast: qa-python qa-js

qa-python:
	cd state-project-complete && env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY $(PYTHON) -m pytest -q

qa-js:
	@set -eu; cd implementation-context-prototype; \
	files=$$(find . -maxdepth 1 -type f -name 'state-*-tests.js' -print | sort); \
	if [ -z "$$files" ]; then echo "No state-*-tests.js files found"; exit 1; fi; \
	for f in $$files; do echo "==> $$f"; node "$$f"; done
	node --test tools/portfolio-editor/test/*.test.js

# Tests that need a real model key (#624). qa-python unsets the keys, so they run only here: about 50 Haiku calls,
# well under $0.20. OPENAI_API_KEY is unset because State runs on Anthropic, so the OpenAI comparisons stay skipped.
# test_real_model_test_list.py fails if a new key-gated test file is missing from this list. A test that fails is
# rerun once and blocks only if it fails again (DEC-019).
REAL_MODEL_TESTS = test_ask_pending_review_authority.py test_bootstrap_mixed_spec_eval.py test_consequentiality_eval_dataset.py test_evidence_intake_consequentiality.py test_live_providers.py

qa-real-model:
	@if [ -z "$${ANTHROPIC_API_KEY:-}" ]; then \
		echo "ANTHROPIC_API_KEY is required for real-model QA."; exit 2; \
	fi
	cd state-project-complete && $(PYTHON) -m eval.run_eval
	@# DEC-019 (Nov 8): each of these is a single live sample, so a failed test is rerun once in the same run and
	@# fails the gate only if it fails again. A consistent regression fails twice; a one-off model miss does not.
	cd state-project-complete && env -u OPENAI_API_KEY $(PYTHON) -m pytest -q $(REAL_MODEL_TESTS) || { \
		echo "Rerunning the failed model-key tests once (DEC-019)."; \
		env -u OPENAI_API_KEY $(PYTHON) -m pytest -q --last-failed --last-failed-no-failures none $(REAL_MODEL_TESTS); }

qa-release: qa-fast
	@set -eu; \
	branch="$${GITHUB_REF_NAME:-$$(git rev-parse --abbrev-ref HEAD)}"; \
	if [ "$$branch" = "staging" ]; then default_base=origin/main; else default_base=origin/staging; fi; \
	base_ref="$${QA_BASE_REF:-$$default_base}"; \
	echo "Comparing against $$base_ref to decide whether the paid eval is needed."; \
	force="$${QA_FORCE_REAL_MODEL:-0}"; \
	if git rev-parse --verify "$$base_ref" >/dev/null 2>&1; then \
		changed=$$(git diff --name-only "$$base_ref"...HEAD); \
	else \
		echo "Warning: $$base_ref is unavailable; treating release QA as model-sensitive."; \
		changed="state-project-complete/provider-sensitive-unknown"; \
	fi; \
	model_sensitive=$$(printf '%s\n' "$$changed" | grep -E '^(state-project-complete/(anthropic_provider|ask_provider|ask_service|consequentiality_guidance|provider|pipeline|eval)/?|state-project-complete/.*(provider|prompt|interpret|ask|model|baseline_(composition|resilience|setup)|omission|relevance).*\.py|implementation-context-prototype/.*ask.*\.js|render\.yaml$$)' || true); \
	if [ "$$force" = "1" ] || [ -n "$$model_sensitive" ]; then \
		echo "Model-sensitive change detected. Running targeted real-model eval."; \
		$(MAKE) qa-real-model; \
	else \
		echo "No model-sensitive State change detected; skipping paid real-model eval."; \
	fi
