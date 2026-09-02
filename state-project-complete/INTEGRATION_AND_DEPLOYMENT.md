# State integration and deployment

## What is integrated

The browser's **Add project update** flow now posts evidence to the FastAPI service. The service stores immutable Evidence, invokes the configured provider, validates the structured interpretation, and returns any newly created Reviews. Interpretation alone never changes Current State.

Review actions call the server:

- **Accept change** applies every pending proposal in one transaction, writes old and new values to History, and increments the State version.
- **Keep current** resolves the Review as confirmed current without changing State.
- **Reject proposal** resolves the Review as not applied without changing State.

The browser refreshes open Reviews, Current State, and History after server actions.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Deployment health check |
| `POST` | `/api/evidence` | Store and interpret new Evidence |
| `GET` | `/api/reviews?status=open` | Read open or resolved Reviews and proposals |
| `POST` | `/api/reviews/{review_id}/resolve` | Human decision: `accept`, `keep`, or `reject` |
| `GET` | `/api/state` | Read active Current State |
| `GET` | `/api/history` | Read append-only State transitions |

Example evidence body:

```json
{"content":"The pilot date moved to October 15.","source_type":"project_update"}
```

Example resolution body:

```json
{"decision":"accept","note":"Confirmed in the launch meeting."}
```

## Environment variables

- `DATABASE_PATH`: SQLite file path. Local default: `data/state.db`. In a hosted service it **must** point inside a persistent volume, such as `/var/data/state.db`.
- `STATE_PROVIDER`: `anthropic` or `openai`.
- `ANTHROPIC_API_KEY`: required when using Anthropic; server-side only.
- `OPENAI_API_KEY`: required when using OpenAI; server-side only.
- `CORS_ORIGINS`: comma-separated exact frontend origins. Do not use `*` for a public deployment.

Set the frontend API URL in `frontend/index.html` using the `state-api-url` meta tag. Never place a provider key in frontend files.

## Run locally

From this directory:

```bash
python3 -m pip install -r requirements.txt
cp .env.example .env
python3 seed_demo.py
uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, serve the frontend (do not open it as `file://`):

```bash
python3 -m http.server 8080 --directory frontend
```

Open `http://localhost:8080`, add an update, inspect Review, then choose Accept, Keep, or Reject. Confirm server truth directly with `/api/state`, `/api/reviews`, and `/api/history`.

The seed command refuses to run if Current State already contains data.

## Deployment assessment

### Recommended for this single-user prototype: Render web service + persistent disk

Use one paid Render web-service instance with one persistent disk mounted at `/var/data` and set `DATABASE_PATH=/var/data/state.db`. Build command: `pip install -r requirements.txt`. Start command: `uvicorn api:app --host 0.0.0.0 --port $PORT`. Health path: `/health`.

This preserves the existing SQLite design and transaction behavior, but it intentionally limits the service to one instance. Back up the database and do not enable horizontal scaling. Render's default filesystem is ephemeral; a free web service without a disk is unsafe for this database.

After the first deploy, open the service shell and run `DATABASE_PATH=/var/data/state.db python3 seed_demo.py` once. Set `CORS_ORIGINS` to the exact deployed frontend origin and replace the frontend meta tag with the API's HTTPS origin.

### Railway

Railway is also compatible if a volume is attached to the API service, mounted (for example) at `/var/data`, and `DATABASE_PATH=/var/data/state.db`. The same single-instance SQLite constraint applies. Do not deploy without the volume.

### Vercel

Vercel is suitable for the static frontend, but not for this SQLite-backed FastAPI service. Serverless/edge filesystems are not durable application storage. Moving the API to Vercel requires replacing SQLite with a durable managed database and adapting the database layer and migrations first.

### When to move to Postgres

Use managed Postgres before multiple API instances, concurrent multi-user use, or a serverless API deployment. The current code uses SQLite-specific SQL and is not yet a Postgres adapter.

## Verification status and remaining work

- Automated: packaged backend tests plus API workflow tests cover Evidence → Review → human resolution → Current State/History.
- Live provider calls: not run without user-owned API keys.
- Browser UI: statically connected; full browser QA against a live model remains required.
- Authentication and user isolation are not implemented. Do not expose this publicly with sensitive information until authentication is added.
- Retry, rate limiting, cost tracking, prompt versioning, observability, and backups remain production-hardening work.

This is an integrated local prototype, not a verified production-ready service.
