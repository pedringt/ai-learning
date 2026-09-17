.PHONY: qa-bootstrap qa-fast qa-release qa-js qa-python qa-real-model

qa-bootstrap:
	cd state-project-complete && pip install -r requirements.txt && pip install pytest pytest-subtests playwright
	python -m playwright install chromium

qa-fast: qa-python qa-js

qa-python:
	cd state-project-complete && python -m pytest -q

qa-js:
	@set -eu; cd implementation-context-prototype; \
	files=$$(find . -maxdepth 1 -type f -name 'state-*-tests.js' -print | sort); \
	if [ -z "$$files" ]; then echo "No state-*-tests.js files found"; exit 1; fi; \
	for f in $$files; do echo "==> $$f"; node "$$f"; done

qa-real-model:
	@if [ -z "$${ANTHROPIC_API_KEY:-}" ]; then \
		echo "ANTHROPIC_API_KEY is required for real-model QA."; exit 2; \
	fi
	cd state-project-complete && python -m eval.run_eval

qa-release: qa-fast
	@set -eu; \
	base_ref="$${QA_BASE_REF:-origin/staging}"; \
	force="$${QA_FORCE_REAL_MODEL:-0}"; \
	if git rev-parse --verify "$$base_ref" >/dev/null 2>&1; then \
		changed=$$(git diff --name-only "$$base_ref"...HEAD); \
	else \
		echo "Warning: $$base_ref is unavailable; treating release QA as model-sensitive."; \
		changed="state-project-complete/provider-sensitive-unknown"; \
	fi; \
	model_sensitive=$$(printf '%s\n' "$$changed" | grep -E '^(state-project-complete/(anthropic_provider|ask_provider|ask_service|consequentiality_guidance|provider|pipeline|eval)/?|state-project-complete/.*(provider|prompt|interpret|ask).*\.py|implementation-context-prototype/.*ask.*\.js)' || true); \
	if [ "$$force" = "1" ] || [ -n "$$model_sensitive" ]; then \
		echo "Model-sensitive change detected. Running targeted real-model eval."; \
		$(MAKE) qa-real-model; \
	else \
		echo "No model-sensitive State change detected; skipping paid real-model eval."; \
	fi
