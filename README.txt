State R9.7 — Workspace Needs Your Attention

What changed
- Removes the late-inserting yellow Review banner from Workspace.
- Adds a stable Needs your attention section directly beneath Ask.
- The section exists during hydration, so Reviews loading later do not insert a new
  block and shove the page downward.
- Surfaces at most two substantive items:
  1. pending Reviews first;
  2. concrete blocking questions second.
- Ordinary open questions are intentionally not promoted here.
- Each surfaced item includes what it is, the actual decision/question, and why it
  matters rather than only a count.
- Review rows open the specific Review; blocker rows open the specific Question.
- Remaining unresolved items route to Open Items.
- When there is nothing actionable, the same stable section calmly says so.

Product rule
Workspace surfaces what you should not miss.
Project holds what is true.
Open Items holds everything unresolved.
Ask handles what you want to know.

Verification
- Frontend integration contracts: 38 passed.
- Full repository backend/integration suite passed.
- Existing Ask behavior harness passed.

Deployment
- This is primarily a Vercel/frontend change.
- Upload context-app.js and context-tool.css preserving their paths.
- test_frontend_integration_contract.py is included for repository regression coverage.
