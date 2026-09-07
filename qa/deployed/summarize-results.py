"""Renders qa-report.json (Playwright's JSON reporter output) as a short
pass/fail list for the GitHub Actions job summary. Kept as its own file
because the shell step that calls it lives inside a YAML block scalar, where
an inline multi-line Python string is fragile to indent correctly."""
import json

with open("qa-report.json") as f:
    data = json.load(f)

stats = data.get("stats", {})
print(
    f"Expected: {stats.get('expected', 0)}  "
    f"Unexpected: {stats.get('unexpected', 0)}  "
    f"Flaky: {stats.get('flaky', 0)}  "
    f"Skipped: {stats.get('skipped', 0)}"
)
print()


def walk(suites, prefix=""):
    for s in suites:
        for spec in s.get("specs", []):
            for test in spec.get("tests", []):
                status = test.get("results", [{}])[-1].get("status", "unknown")
                mark = "PASS" if status == "passed" else "FAIL"
                print(f"{mark} {prefix}{spec.get('title')}")
        walk(s.get("suites", []), prefix + s.get("title", "") + " / ")


walk(data.get("suites", []))
