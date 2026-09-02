# Live Provider Testing — Quick Start

## TL;DR

```bash
# 1. Set your API keys
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# 2. Run the test script
python3 test_live_locally.py

# 3. View results
cat live_test_results.json
```

---

## Step 1: Get API Keys

### Anthropic Claude

1. Go to https://console.anthropic.com
2. Log in (or create account)
3. Navigate to API Keys
4. Create a new API key
5. Copy it (starts with `sk-ant-`)

### OpenAI

1. Go to https://platform.openai.com/api/keys
2. Log in (or create account)
3. Create a new API key
4. Copy it (starts with `sk-`)

---

## Step 2: Run Locally

### Option A: Interactive (recommended for first run)

```bash
# 1. In your terminal, set the keys
export ANTHROPIC_API_KEY="sk-ant-xxxxx"
export OPENAI_API_KEY="sk-xxxxx"

# 2. Navigate to state_integration directory
cd /path/to/state_integration

# 3. Run the test script
python3 test_live_locally.py
```

**Output:**
```
============================================================
STATE PROJECT: LIVE PROVIDER TESTING
============================================================
Started: 2026-09-02T...

API Key Status:
  ANTHROPIC_API_KEY: ✓ Set
  OPENAI_API_KEY: ✓ Set

============================================================
Setting up test database
============================================================

============================================================
Testing Anthropic Claude API
============================================================
✓ API key found (length: 152)
Initializing AnthropicProvider...
Processing evidence...
✓ Interpretation succeeded in 2.34s
  Status: succeeded
  Reviews created: 1 (review_01)
  Proposals created: 1 (proposal_01)

============================================================
Testing OpenAI API
============================================================
✓ API key found (length: 48)
Initializing OpenAIProvider...
Processing evidence...
✓ Interpretation succeeded in 3.12s
  Status: succeeded
  Reviews created: 1 (review_02)
  Proposals created: 1 (proposal_02)

============================================================
RESULTS SUMMARY
============================================================

Anthropic Claude (claude-opus-4-6)
  Status: ✓ Success
  Latency: 2.34s
  Reviews: 1
  Proposals: 1

OpenAI (gpt-4o)
  Status: ✓ Success
  Latency: 3.12s
  Reviews: 1
  Proposals: 1

------------------------------------------------------------
COMPARISON
Latency difference: 0.78s (Anthropic faster)

============================================================
Saving results to live_test_results.json
============================================================
✓ Saved to live_test_results.json
```

### Option B: Using `.env` file

Create a `.env` file in the `state_integration/` directory:

```
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx
```

Then run:
```bash
source .env
python3 test_live_locally.py
```

### Option C: Inline (one-liner)

```bash
ANTHROPIC_API_KEY="sk-ant-..." OPENAI_API_KEY="sk-..." python3 test_live_locally.py
```

---

## Step 3: View Results

The script saves results to `live_test_results.json`:

```bash
cat live_test_results.json
```

**Output:**
```json
{
  "timestamp": "2026-09-02T12:34:56.789123",
  "results": [
    {
      "provider": "Anthropic Claude",
      "model": "claude-opus-4-6",
      "status": "succeeded",
      "latency_seconds": 2.34,
      "reviews": 1,
      "proposals": 1
    },
    {
      "provider": "OpenAI",
      "model": "gpt-4o",
      "status": "succeeded",
      "latency_seconds": 3.12,
      "reviews": 1,
      "proposals": 1
    }
  ]
}
```

---

## What the Test Does

1. **Creates a test database** with sample State items (2 items) and Evidence (1 item)
2. **Processes evidence through Anthropic Claude** (if API key set)
   - Calls the full interpretation pipeline
   - Times how long it takes
   - Records success/failure
3. **Processes evidence through OpenAI** (if API key set)
   - Same as above, for comparison
4. **Compares results** (latency, reviews created, proposals created)
5. **Saves JSON results** for analysis

Each provider call:
- Formats the current State + Evidence as a prompt
- Sends to the LLM API
- Parses the JSON response
- Validates schema + semantics
- Persists to database if valid
- Returns results

---

## Expected Results

### Success Indicators ✓
- Status: `succeeded`
- Latency: ~2-5 seconds (depending on model/network)
- Reviews created: 1 (for this test evidence)
- Proposals created: 1 (launch date change detected)

### Failure Indicators ✗
- Status: `failed`
- Error message (e.g., "Invalid API key", "Rate limit exceeded")

---

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
- Make sure you exported it: `export ANTHROPIC_API_KEY="sk-ant-..."`
- Check it was exported: `echo $ANTHROPIC_API_KEY`
- Try inline: `ANTHROPIC_API_KEY="sk-ant-..." python3 test_live_locally.py`

### "Invalid API key" or "401 Unauthorized"
- Copy the key again (might have trailing space)
- Double-check you're using the right key (check Console.anthropic.com or platform.openai.com)
- Make sure the key hasn't been revoked

### "Rate limit exceeded"
- The provider is rate-limiting your account
- Wait a few minutes
- If persistent, check your usage at Console.anthropic.com or platform.openai.com

### "Interpretation failed: invalid_structure" or "invalid_state_reference"
- The model responded with invalid JSON or referenced a non-existent State
- This is captured as a "soft" failure (not an API error)
- Try running again (models can be inconsistent)

### Latency very high (>30s)
- Your network connection might be slow
- The provider might be experiencing issues
- Run again to confirm it's not a one-time spike

---

## Comparison: Anthropic vs OpenAI

| Aspect | Anthropic Claude | OpenAI GPT-4o |
|--------|---|---|
| **Speed** | Typically 2-3s | Typically 3-5s |
| **Accuracy** | High | Very high |
| **Cost** | Lower for this use case | Slightly higher |
| **Context window** | 200K | 128K |
| **Availability** | Very stable | Very stable |

For this task (structured interpretation with ~2KB context), both are excellent. Choose based on:
- **Anthropic** if speed matters (2-3s vs 3-5s)
- **OpenAI** if you already have GPT-4 credits
- **Both** for A/B testing (run both, compare results)

---

## Next Steps

1. ✅ Run `test_live_locally.py` with your API keys
2. 📊 Review the results in `live_test_results.json`
3. 📝 Document which provider works better for your use case
4. 🚀 Add live test results to your portfolio (show real latency + accuracy)

---

## What NOT to Do

- ❌ Don't commit API keys to version control (use `.env` and add to `.gitignore`)
- ❌ Don't run tests in a loop (you'll get rate-limited)
- ❌ Don't share your API keys in screenshots or documents
- ❌ Don't hardcode keys in code (use environment variables)

---

## Files

- **test_live_locally.py** — Standalone script (no unittest framework)
- **test_live_providers.py** — Unittest suite with mock + live tests
- **live_test_results.json** — Output from test_live_locally.py (generated after run)

---

## Questions?

If the tests fail with a provider error:
1. Check API key is valid: `echo $ANTHROPIC_API_KEY`
2. Check you have credits: Log into Console.anthropic.com or platform.openai.com
3. Check your network: `ping google.com`
4. Try a different model if available (e.g., `claude-sonnet-4-6` instead of `claude-opus-4-6`)

---

**Ready to ship!** Once you run this locally and see "✓ Success" for both providers, you have proof that the State system works end-to-end with real LLMs.
