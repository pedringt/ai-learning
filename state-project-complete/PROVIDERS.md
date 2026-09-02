# Live Provider Adapters: Anthropic & OpenAI

## Overview

The State system now supports live provider adapters for both Anthropic Claude and OpenAI APIs. These adapters follow a thin-wrapper pattern:

1. **Adapter formats context** (State items, Reviews, Evidence) into a prompt
2. **Adapter calls the provider API** (Claude or GPT-4)
3. **Adapter returns structured JSON** for validation by application logic
4. **Application validates** schema + semantics (unchanged from Phase 2)

The adapters are **stateless** — they don't make decisions about State. They send information to the LLM and return what it says.

---

## Quick Start

### Setup: Install dependencies

```bash
# For Anthropic
pip install anthropic

# For OpenAI
pip install openai

# Both
pip install anthropic openai
```

### Setup: Configure API keys

```bash
# Anthropic (Claude)
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI (GPT-4)
export OPENAI_API_KEY="sk-..."
```

### Usage: Basic integration

```python
from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence
from anthropic_provider import AnthropicProvider

# Set up database connection
with get_test_db() as connection:
    # Create provider
    provider = AnthropicProvider(model_identifier="claude-opus-4-6")
    
    # Process evidence
    result = process_evidence(
        connection=connection,
        evidence_id="evidence_01",
        provider=provider,
    )
    
    # Access results
    print(f"Reviews created: {result.review_ids}")
    print(f"Proposals created: {result.proposal_ids}")
    print(f"Status: {result.processing_status}")
```

---

## Provider Adapters

### AnthropicProvider

Wraps the Anthropic API.

```python
from anthropic_provider import AnthropicProvider

# Initialize
provider = AnthropicProvider(
    model_identifier="claude-opus-4-6",  # or "claude-sonnet-4-6", etc.
    api_key="sk-ant-..."  # optional; uses ANTHROPIC_API_KEY env var if None
)

# Use with process_evidence()
result = process_evidence(
    connection=connection,
    evidence_id="evidence_01",
    provider=provider,
)
```

**Models available:**
- `claude-opus-4-6` (most capable)
- `claude-sonnet-4-6` (balanced)
- `claude-haiku-4-5` (fast, cheap)

### OpenAIProvider

Wraps the OpenAI API.

```python
from openai_provider import OpenAIProvider

# Initialize
provider = OpenAIProvider(
    model_identifier="gpt-4o",  # or "gpt-4-turbo", etc.
    api_key="sk-..."  # optional; uses OPENAI_API_KEY env var if None
)

# Use with process_evidence()
result = process_evidence(
    connection=connection,
    evidence_id="evidence_01",
    provider=provider,
)
```

**Models available:**
- `gpt-4o` (latest general-purpose)
- `gpt-4-turbo` (stable, strong reasoning)
- `gpt-4` (older version)

---

## How Providers Work

### 1. Context Preparation

When `interpret()` is called, the adapter:
1. Fetches full State item statements (not just IDs)
2. Fetches full Review details (decision question, consequence, type)
3. Assembles a natural-language prompt

**From the database:**
```sql
SELECT statement FROM current_state_items WHERE id IN (...);
SELECT decision_question, why_consequential FROM review_issues WHERE id IN (...);
```

**Into a prompt section:**
```
## Current State (maintained understanding)

- state_01: The AI Support Pilot is limited to the billing-support team.
- state_02: The AI Support Pilot will launch to the billing-support team on October 1.

## Open Reviews (pending human decisions)

- review_01 (proposed_update)
  - Decision: Should we shift the launch date?
  - Why: Timeline changed due to security review.
```

### 2. Provider Call

The adapter sends a structured prompt that includes:
- Current State items (full text)
- Open Reviews (full details)
- New Evidence (the thing we're interpreting)
- JSON schema for the expected response

**Example prompt snippet:**
```
You are an AI assistant helping maintain project context and decision-making.

[...context...]

Respond ONLY with JSON in this structure:
{
  "summary": "...",
  "topics": [...],
  "outcome": "no_review" | "review_recommended",
  "review_recommendations": [...]
}
```

### 3. Response Parsing

The adapter:
1. Receives response text from the provider
2. Extracts JSON (handles markdown code blocks)
3. Returns the structured dict

**Example response:**
```json
{
  "summary": "Launch date moved to October 15.",
  "topics": ["pilot", "launch"],
  "outcome": "review_recommended",
  "review_recommendations": [
    {
      "review_action": "create",
      "review_type": "proposed_update",
      "decision_question": "Update launch date to October 15?",
      "why_consequential": "Timeline has changed; recorded date is now stale.",
      "affected_state_item_ids": ["state_02"],
      "proposed_changes": [
        {
          "operation": "update",
          "state_item_id": "state_02",
          "expected_version": 1,
          "proposed_statement": "The AI Support Pilot will launch on October 15.",
          "rationale": "Evidence explicitly states the new date."
        }
      ]
    }
  ]
}
```

### 4. Application Validation

The application (not the adapter) validates:
- **Schema**: Does the response match the JSON schema?
- **Semantics**: Do all referenced State IDs exist? Do versions match?

If validation fails, the evidence is marked as failed and no State changes are proposed.

---

## Testing

### Mock tests (no API keys required)

```bash
cd /home/claude/state_integration
python3 test_live_providers.py -v
```

This runs with mocked API responses, so no API keys needed.

**Output:**
```
test_anthropic_mock_interpret ... ok
test_openai_mock_interpret ... ok
test_provider_prompt_construction ... ok

Ran 3 tests in 0.007s
OK
```

### Live tests (API keys required)

To test with real APIs:

1. **Set up API keys:**
   ```bash
   export ANTHROPIC_API_KEY="sk-ant-..."
   export OPENAI_API_KEY="sk-..."
   ```

2. **Uncomment live tests in `test_live_providers.py`:**
   ```python
   # In the LiveProviderTemplateTest class, uncomment:
   # - test_live_anthropic()
   # - test_live_openai()
   ```

3. **Run tests:**
   ```bash
   python3 test_live_providers.py -v
   ```

---

## Integration with Existing Pipeline

The adapters integrate with `process_evidence()` from `interpretation_pipeline_integrated.py`:

```python
def process_evidence(
    connection: sqlite3.Connection,
    evidence_id: str,
    provider: InterpretationProvider,  # Can be fake, Anthropic, or OpenAI
) -> ProcessingResult:
    """Process evidence using a provider."""
    
    # Capture context (State + Reviews at this moment)
    context = capture_context(connection)
    
    # Fetch evidence
    evidence = connection.execute(
        "SELECT id, content FROM evidence WHERE id=?",
        (evidence_id,),
    ).fetchone()
    
    # Call provider
    interpretation = provider.interpret(
        context=context,
        evidence=evidence,
        connection=connection,  # Needed for adapter to fetch full context
    )
    
    # Validate + persist
    _validate_schema(interpretation)
    _validate_semantics(interpretation, context)
    _persist_success(connection, evidence, interpretation)
    
    return result
```

---

## Provider Behavior Differences

| Aspect | Anthropic | OpenAI |
|--------|-----------|--------|
| **Response time** | Typically fast | Typically fast |
| **Cost** | Variable by model | Variable by model |
| **JSON parsing** | Sometimes wraps in markdown | Usually wraps in markdown |
| **Context window** | 200K (Opus) | 128K (GPT-4o) |
| **Reliability** | Very high | Very high |

For this use case (structured interpretation with ~2KB context), both are excellent.

---

## Common Issues & Troubleshooting

### "anthropic package required"
Install: `pip install anthropic`

### "openai package required"
Install: `pip install openai`

### API key not found
- Check environment variables: `echo $ANTHROPIC_API_KEY`
- Ensure you've exported them: `export ANTHROPIC_API_KEY="sk-..."`
- Pass explicitly: `AnthropicProvider(api_key="sk-...")`

### JSON parsing error
The adapters handle markdown code blocks and plain JSON. If still failing:
1. Print the raw response: add debug logging in `interpret()`
2. Verify the model returns valid JSON
3. Check for stray text before/after JSON block

### Context window exceeded
If the prompt is too long (unlikely for most projects):
- Use a smaller model as a fallback
- Trim State items to only active ones (already done)
- Reduce Open Reviews to only unresolved ones (already done)

### Rate limits
If hitting provider rate limits:
- Add exponential backoff retry logic
- Space out `process_evidence()` calls
- Consider OpenAI if Anthropic rate-limited, or vice versa

---

## Advanced: Creating a Custom Provider

To add a new provider (e.g., Llama via Together AI):

```python
from typing import Any, Mapping
from state_spike.semantic_validation import InterpretationContextSnapshot

class CustomProvider:
    def __init__(self, model_identifier: str, api_key: str | None = None):
        self.name = "custom"
        self.model_identifier = model_identifier
        self.api_key = api_key
        self._client = None  # Lazy-load your client

    def interpret(
        self,
        *,
        context: InterpretationContextSnapshot,
        evidence: Mapping[str, Any],
        connection: Any,
    ) -> Mapping[str, Any]:
        """Return structured interpretation."""
        
        # Build prompt (use _build_prompt() from existing adapters as template)
        prompt = self._build_prompt(context, evidence, connection)
        
        # Call your provider
        response_text = self._client.call(prompt)
        
        # Parse JSON
        structured = json.loads(response_text)
        
        return structured

    def _build_prompt(self, context, evidence, connection) -> str:
        """Format prompt. See AnthropicProvider._build_prompt() for example."""
        pass
```

Then use with `process_evidence()`:
```python
custom_provider = CustomProvider(model_identifier="your-model")
result = process_evidence(connection, evidence_id, provider=custom_provider)
```

---

## Files

- **anthropic_provider.py** — Anthropic Claude adapter
- **openai_provider.py** — OpenAI GPT adapter
- **test_live_providers.py** — Mock + template for live tests
- **PROVIDERS.md** — This document

## Next Steps

1. ✅ Adapters built and tested with mocks
2. ⬜ Run with real API keys (uncomment live tests)
3. ⬜ Add retry + exponential backoff
4. ⬜ Track costs/latency per provider
5. ⬜ Optional: Create a provider switcher (A/B test Anthropic vs OpenAI)
