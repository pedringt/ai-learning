# Ask paraphrase misses: options (research for #653, Nov 14)

**Question (Paige, DEC-023, item 4):** what can stop Ask missing a record that answers the question in different words? Example: "When do customers get access?" against "Public launch date is March 3."

**Status:** research only. Nothing here is decided or built.

**Evidence:** the #653 benchmark fixture, which is synthetic and was written by me, plus vendor documentation. These are fixture numbers, not production behavior.

## What was measured

All variants score the whole project (DEC-023: no windows) and use today's per-type limits.

| Option | Recall (all families) | Paraphrase (6 cases) | Mean context |
|---|---|---|---|
| Today's word matching (A1) | 0.80 | 2 / 6 | 12.4k chars |
| BM25 (A4) | 0.79 | 2 / 6 | 12.1k |
| BM25 + link expansion (A4+A5) | 0.82 | 2 / 6 | 13.2k |
| **Local embeddings** (bge-small-en-v1.5, E) | **0.95** | **5 / 6** | 13.8k |
| BM25 + embeddings, rank fusion (H) | 0.95 | 5 / 6 | 13.8k |
| Hybrid + link expansion (H+A5) | **0.96** | 5 / 6 | 15.2k |

**Other measurements:**
- **Paraphrase case still missed:** "What did Legal say about the data processing agreement?" against "Counsel signed off on the DPA" (embeddings alone). The hybrid missed a different one.
- **Isolation and authority:** isolation stayed 0 and authority 100% in every variant.
- **Embedding speed:** on a laptop, the model embedded 243 records in 3.5 s and a query in about 6 ms.
- **Embedding memory:** the embedding process peaked at about **650 MB** of memory.
- **Whole fixture project:** 245 records, about 61k characters (about 15k tokens).

**What wasn't measured:** an LLM-based option (it needs paid calls), a hosted embedding API (it needs a key and new data-sharing), or a project alias list (it would be hand-written to fit these cases).

## The options

### 1. Local embedding model on State's own server
A small open-source model, such as `BAAI/bge-small-en-v1.5` (about 33M parameters), runs inside the State backend through ONNX (`fastembed`). Each record is embedded when it's written and stored as a vector beside it. Each Ask embeds the question and ranks by similarity, alone or fused with keyword ranking.

- **Data:** nothing leaves State's server. That's no new third party under `DATA_PRIVACY.md`.
- **Cost:** no per-call fee.
- **Quality on the fixture:** paraphrase 5/6, overall 0.95.
- **Blocker:** memory. The process peaked at about 650 MB locally. Production runs on Render Starter, which has about 512 MB in total for the whole app. That would mean a larger instance, a paid upgrade, or a measured smaller setup (quantized model, one thread). It's unproven on Render.
- **Work:** a new dependency (onnxruntime), a model download at deploy or start-up, and a vector column. Backfill for existing records, and re-embedding when a record changes.

### 2. Hosted embedding API (Voyage AI, which Anthropic recommends; or OpenAI)
The same approach as option 1, but the embedding runs at the provider. Anthropic has no embedding model of its own and points to Voyage AI, which is now run by MongoDB.

- **Price:** `voyage-4-lite` costs $0.02 per million tokens, with 200M free tokens. OpenAI's `text-embedding-3-small` also costs $0.02 per million. At State's size, that's a fraction of a cent a month.
- **Data:** every record's text and every Ask question go to a new third party. `DATA_PRIVACY.md` requires checking retention, training use, residency and subprocessors first. Voyage's training opt-out is managed in MongoDB Atlas; I didn't confirm a zero-retention option.
- **Server:** no memory problem.
- **Reliability:** adds a network call to each Ask and to each write, plus a second provider that can fail. Ask needs a fallback to keyword ranking.

### 3. No retrieval for small projects: send the model everything
The model already selects records. If a project is small enough, Ask could send every record and let the model do the semantic matching.

- **Cost:** the whole fixture project is about 15k tokens of input. Haiku 5.5 charges $0.10 per million input tokens, so that's about $0.0015 per Ask, against about $0.0003 today.
- **Unknowns:** first-token latency, and whether the model's answers get worse when the context is diluted. `eval/scaling_experiment.py` studied dilution for interpretation, not for Ask. Both need the paid budget run DEC-023 already calls for.
- **Limit:** it stops working once projects grow, so retrieval comes back eventually.

### 4. LLM query expansion
One extra cheap model call rewrites the question into likely record wording before keyword ranking.

- **Data:** only the question goes to the model, the same provider as today.
- **Cost:** one extra call and about a second of latency on every Ask.
- **Not measured.** It needs paid calls. It keeps keyword ranking's other weaknesses.

### 5. Project alias list (A7 in #653)
A hand-maintained synonym list per project, for example "go-live" means "launch".

- **Pros:** cheap and deterministic.
- **Cons:** someone has to maintain it, and it only covers the phrasings someone thought of. It wasn't measured, because a list written for these cases would only prove itself.

### Not suited at State's size
- **Contextual retrieval** (Anthropic): an LLM writes context for each chunk before indexing. Anthropic reports that contextual embeddings plus contextual BM25 cut failed retrievals by 49%, and by 67% with reranking. That's built for long documents split into chunks. State's records are already short and self-contained.
- **Vector databases** (pgvector, sqlite-vec, Pinecone): at a few hundred to a few thousand records, comparing against every stored vector in Python is fast enough. A vector index only matters at a much larger scale.

## How the options compare

| | Fixes paraphrase (fixture) | New data sharing | Per-Ask cost | Main risk |
|---|---|---|---|---|
| 1 Local embeddings | 5/6 | none | none | memory on Render Starter |
| 2 Hosted embeddings | likely similar, not measured | yes, new third party | negligible | privacy review, second provider |
| 3 Send everything | not measured (model-dependent) | none new | about $0.0015 | latency, dilution, project growth |
| 4 Query expansion | not measured | none new | one extra call | latency |
| 5 Alias list | not measured | none | none | maintenance, coverage |

## What would settle it (not started)

1. **Option 1:** measure peak memory on a Render Starter-sized instance with a quantized model and one thread.
2. **Option 3:** fold into the paid budget run DEC-023 already requires: latency and answer quality at today's limits versus the whole project.
3. **Option 2:** a `DATA_PRIVACY.md` review of Voyage's or OpenAI's retention and training terms, before any key is created.

## Sources

- Anthropic, "Embeddings" (no first-party model; recommends Voyage): https://platform.claude.com/docs/en/build-with-claude/embeddings
- Voyage AI pricing (page updated 2026-09-29): https://docs.voyageai.com/pricing
- OpenAI `text-embedding-3-small`: https://developers.openai.com/api/docs/models/text-embedding-3-small
- MongoDB, Voyage model-training data controls: https://www.mongodb.com/docs/voyageai/management/model-training-data/
- Anthropic, "Contextual Retrieval": https://www.anthropic.com/engineering/contextual-retrieval
- bge-small-en-v1.5 size (about 33M parameters, 384 dimensions): https://www.promptlayer.com/models/bge-small-en-v15
- Haiku 5.5 price: `state-project-complete/spend_guard.py` (checked 2026-10-19)
