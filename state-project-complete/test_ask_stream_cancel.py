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

from types import SimpleNamespace

from api import Settings, create_app
from ask_provider import LiveAskProvider
from test_ask_r9 import FakeAskProvider


class _TricklingProvider(FakeAskProvider):
    """Has a stream() like the real provider: yields a valid answer in small pieces, slowly.

    `closed` is set when the stream is closed early (the real provider's `with messages.stream(...)` exits then and
    closes the HTTP stream); `completed` when it ran to the end.
    """

    def __init__(self):
        super().__init__()
        self.closed = threading.Event()
        self.completed = threading.Event()

    def stream(self, prompt):
        text = json.dumps({"selection": self.selection, "answer": self.answer})
        step = max(1, len(text) // 25)
        try:
            for i in range(0, len(text), step):
                time.sleep(0.12)
                yield text[i:i + step]
            self.completed.set()
        except GeneratorExit:
            self.closed.set()
            raise


def _cancel_mid_answer(tmp_path, provider, after_cancel):
    settings = Settings(database_path=str(tmp_path / "cancel.db"), cors_origins=[], demo_bootstrap=True)
    app = create_app(settings, provider=None, ask_provider=provider)
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
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
        after_cancel()
    finally:
        server.should_exit = True
        thread.join(timeout=10)


def test_cancelling_a_streaming_ask_mid_answer_logs_no_server_failure(tmp_path, caplog):
    with caplog.at_level(logging.INFO, logger="state.api"):
        _cancel_mid_answer(tmp_path, _TricklingProvider(), lambda: time.sleep(1.5))      # let the server finish its cleanup
    failures = [r.getMessage() for r in caplog.records if "Streaming Ask provider failure" in r.getMessage()]
    assert not failures, failures


def test_cancelling_a_streaming_ask_closes_the_provider_stream(tmp_path):
    """#654: after a cancel the server closed nothing, so the provider's HTTP stream (and the model's generation)
    stayed open until garbage collection. The provider stream must be closed promptly, not run to the end."""
    provider = _TricklingProvider()
    seen = {}
    # Checked while the server is still running: shutting it down closes everything anyway.
    _cancel_mid_answer(tmp_path, provider, lambda: seen.update(closed=provider.closed.wait(2), completed=provider.completed.is_set()))
    assert seen["closed"], "the provider stream was still open 2 s after the client disconnected"
    assert not seen["completed"]


def test_closing_the_openai_ask_stream_closes_its_http_response():
    """#654: the OpenAI path, unlike Anthropic's `with messages.stream(...)`, did not close its response early."""
    class _Response:
        closed = False

        def __iter__(self):
            for text in ("{", "\"selection\"", ":"):
                yield SimpleNamespace(usage=None, choices=[SimpleNamespace(delta=SimpleNamespace(content=text))])

        def close(self):
            self.closed = True

    response = _Response()
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_: response)))
    stream = LiveAskProvider(SimpleNamespace(name="openai", model_identifier="test", client=client)).stream("prompt")
    assert next(stream) == "{"
    stream.close()
    assert response.closed
