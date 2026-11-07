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

qa-real-model:
	@if [ -z "$${ANTHROPIC_API_KEY:-}" ]; then \
		echo "ANTHROPIC_API_KEY is required for real-model QA."; exit 2; \
	fi
	cd state-project-complete && $(PYTHON) -m eval.run_eval

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
