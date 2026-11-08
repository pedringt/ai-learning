-- DEC-012 guards (Nov 8): Project Health's paid actions run as Vercel functions with no shared memory, so a
-- cooldown that holds across parallel requests needs one shared row per action. A claim is a key (for example
-- "investigate:state:production:<sha>:github-check" or "run:state:staging"), a random token and an expiry. No
-- content, prompts, evidence or reports.

CREATE TABLE IF NOT EXISTS project_health_claims (
    claim_key TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
