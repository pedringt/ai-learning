"""Local-only dev server for the #104-#108 holistic end-to-end QA pass.

Seeds the REAL Northstar demo data (seed_demo.bootstrap_demo_data) and uses
the REAL AnthropicProvider for both interpretation and Ask -- this pass is
specifically about genuine model judgment across the whole pipeline, not
scripted output, so live calls are the point here (unlike qa_ui_smoke_server.py,
which deliberately avoids them for pure UI-wiring checks). No staging/
production traffic; this is a throwaway local SQLite DB.

Usage: uvicorn qa_holistic_server:app --port 8000
"""
from __future__ import annotations

import tempfile

from anthropic_provider import AnthropicProvider
from api import Settings, create_app
from database_migration_backed import initialize_db
from db import connect
from seed_demo import bootstrap_demo_data

_db_path = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
connection = connect(f"sqlite://{_db_path}")
initialize_db(connection)
bootstrap_demo_data(connection)
connection.commit()
connection.close()

# create_app auto-wraps `provider` in LiveAskProvider for Ask when
# ask_provider is left None (see api.py), so no need to pass it explicitly.
app = create_app(
    Settings(database_path=_db_path, provider="anthropic", cors_origins=["*"]),
    provider=AnthropicProvider(),
)
print(f"Seeded REAL Northstar demo data at {_db_path}")
print("Using live AnthropicProvider for interpretation and Ask.")
