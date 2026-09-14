# State QA: What to Say

Use these as the default instructions. The repo's `QA.md` contains the full rules, so you should not need to re-explain State each time.

## Claude Code

For normal verification:

> Run `qa-fast` and report any failures. Do not make changes unless I separately authorize fixes.

For a significant AI/release change:

> Run `qa-release` and report the results. Do not make changes unless I separately authorize fixes.

If Claude Code finds a bug during QA:

> Finish the QA pass first. Do not fix anything yet. Give me the full findings.

After you decide what should be fixed:

> Implement the approved findings only, add regression tests where practical, then rerun the appropriate QA. Do not deploy or merge anywhere unless I name the destination.

## Claude Cowork

For an exploratory staging pass:

> QA State staging using the repo QA instructions. Act like a normal project-team user. Focus on confusing, misleading, broken, slow, surprising, or untrustworthy behavior. Do not make changes.

For a more targeted pass:

> QA this State feature on staging using the repo QA instructions. Focus on the changed workflow and adjacent regression risks. Do not make changes.

## ChatGPT

To review findings from another tool:

> Review these State QA findings against the product model. Separate confirmed bugs, product ambiguities, regression risks, and optional improvements. Do not make changes.

To generate edge cases before implementation:

> Stress-test this State feature conceptually. Give me the highest-value edge cases and authority/integrity risks that should become automated tests.

To decide what to automate after a manual bug:

> Turn this State bug into the cheapest appropriate regression test so we do not need to keep finding it manually.

## GitHub

Usually no instruction is needed. PRs should run **State QA Fast** automatically.

For the heavier deployed staging pass, run the **State Deep QA** workflow on `staging` after the relevant change has been authorized there.

Use the real-model staging workflow only when model behavior itself needs verification. Do not run it by habit; it makes paid model calls and can create test Evidence.

## Paige manual pass

Use `docs/qa/MANUAL_RELEASE.md` for the short trust pass on meaningful releases.

The goal is not to re-click every automated path. Focus on:

- Would I trust what State now treats as true?
- Did anything become authoritative that should not have?
- Did State hide or overstate uncertainty?
- Is it asking me to review too much?
- Does Ask invent or misrepresent provenance, decisions, or certainty?
- Does the workflow make sense to a normal project-team user?

## Shortest possible versions

If you want the minimal prompt, these are enough:

- **Claude Code:** `Run qa-fast.`
- **Claude Code, major AI/release change:** `Run qa-release.`
- **Cowork:** `QA State staging using the repo QA instructions.`
- **ChatGPT:** `Review these State QA findings.`
- **You:** open `docs/qa/MANUAL_RELEASE.md` and do the trust pass.

All QA requests are read-only by default. Testing does not authorize fixes, merging, staging deployment, or production deployment.
