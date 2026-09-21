"""A SQLite connection opened by one request thread must be usable and closable from another (Sept 21 production).

The streaming Ask endpoint is a sync generator that the web server steps through on a pool of worker threads, so the
connection it opens in one step can be closed in a later step on a different thread. SQLite's default same-thread
check then raised ProgrammingError on close, after the answer was already generated, and the person saw
"Ask is temporarily unavailable". No model calls here.
"""
import threading

from db import connect


def _open_here_then_run_elsewhere(tmp_path, action):
    """Open a connection in one thread and keep that thread ALIVE while another thread runs `action` on it
    (if the first thread ends, the OS can reuse its thread id and hide the problem)."""
    holder, opened, done = {}, threading.Event(), threading.Event()

    def opener():
        holder["conn"] = connect(f"sqlite://{tmp_path / 't.db'}")
        holder["conn"].execute("CREATE TABLE IF NOT EXISTS t(x INTEGER)")
        holder["conn"].commit()
        opened.set()
        done.wait(10)

    def other():
        opened.wait(10)
        try:
            holder["result"] = action(holder["conn"])
        except Exception as exc:  # the assertion below reports it
            holder["error"] = f"{type(exc).__name__}: {exc}"
        done.set()

    threads = [threading.Thread(target=opener), threading.Thread(target=other)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return holder


def test_a_connection_can_be_closed_from_a_different_thread_than_the_one_that_opened_it(tmp_path):
    holder = _open_here_then_run_elsewhere(tmp_path, lambda conn: conn.close() or "closed")
    assert holder.get("error") is None, holder.get("error")
    assert holder["result"] == "closed"


def test_a_connection_can_be_used_from_a_different_thread_than_the_one_that_opened_it(tmp_path):
    def use(conn):
        conn.execute("INSERT INTO t(x) VALUES (7)")
        conn.commit()
        return conn.execute("SELECT x FROM t").fetchone()["x"]

    holder = _open_here_then_run_elsewhere(tmp_path, use)
    assert holder.get("error") is None, holder.get("error")
    assert holder["result"] == 7
