"""Cancelling a streaming Ask must not leave a server error behind (Sept 21 production, issue #249).

Pressing the X while an answer is still loading makes the client disconnect. The server then has to clean up the
abandoned stream on whichever worker thread is free, and closing its SQLite connection there used to raise
"SQLite objects created in a thread can only be used in that same thread" (logged as 'Streaming Ask provider
failure'; in production it also surfaced as "Ask is temporarily unavailable" on the next question). This runs the
real app on a real socket with a fake provider that trickles a valid answer, cancels mid-stream, and checks the
server logged no failure. No model calls.
"""
import json
import logging
import socket
import threading
import time

import httpx
import uvicorn

from api import Settings, create_app
from test_ask_r9 import FakeAskProvider


class _TricklingProvider(FakeAskProvider):
    """Has a stream() like the real provider: yields a valid answer in small pieces, slowly."""

    def stream(self, prompt):
        text = json.dumps({"selection": self.selection, "answer": self.answer})
        step = max(1, len(text) // 25)
        for i in range(0, len(text), step):
            time.sleep(0.12)
            yield text[i:i + step]


def test_cancelling_a_streaming_ask_mid_answer_logs_no_server_failure(tmp_path, caplog):
    settings = Settings(database_path=str(tmp_path / "cancel.db"), cors_origins=[], demo_bootstrap=True)
    app = create_app(settings, provider=None, ask_provider=_TricklingProvider())
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    with caplog.at_level(logging.INFO, logger="state.api"):
        thread.start()
        try:
            for _ in range(100):
                try:
                    httpx.get(f"http://127.0.0.1:{port}/health", timeout=1)
                    break
                except Exception:
                    time.sleep(0.1)
            # Start an Ask and cancel it partway through (the X button = the client closes the connection).
            with httpx.Client(timeout=20) as client:
                with client.stream("POST", f"http://127.0.0.1:{port}/api/ask/stream", json={"query": "What should I know?"}) as response:
                    chunks = response.iter_raw()
                    next(chunks)
                    time.sleep(0.25)
            time.sleep(1.5)                                                                         # let the server finish its cleanup
        finally:
            server.should_exit = True
            thread.join(timeout=10)
    failures = [r.getMessage() for r in caplog.records if "Streaming Ask provider failure" in r.getMessage()]
    assert not failures, failures
