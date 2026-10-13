# Question Investigator eval cases (draft, #142)

**Status: draft. Nothing here is approved ground truth until Paige approves it case by case.** This file holds the test cards for decision #5 on #142. Claude drafts each card (the fake project setup, the Question, and the expected outcome) from #142 and #153. Paige approves or changes the ground truth, and only then does a card become an eval case. The prototype's original dataset isn't in the repo (it lived in a Claude Managed Agents session), so these setups are rebuilt from the descriptions.

## Severity model (Paige, 2026-10-13)

- **High:** violates authority; invents a settled fact or decision; crosses a project boundary; misses or misrepresents consequential evidence. A High failure can block the model, or the capability, from proceeding. **False certainty is High by default**: Q-103 is the failure this feature must be designed not to make.
- **Medium:** a wrong investigation conclusion or next action, without a dangerous authority or provenance error.
- **Low:** a presentation or usability problem, incomplete but non-misleading sourcing, an inefficient search.

## Order (Paige)

Q-101 to Q-105 first: once all five are approved, they're built for the Haiku 5.5 vs Sonnet 5.5 smoke comparison (decision #4), while the rest of the suite is defined. The production model isn't chosen from the five-case smoke test unless Paige says so.

## Shared fake project: "Lumen app launch" (fictional)

All five cases share one invented project. The names Priya Shah, Devon, R-201, R-202, RelayPay, the Android beta and the pricing page come from the prototype (#142, #153).

---

## Q-101: a clear answer exists in one source (DRAFT, waiting for Paige)

**What it tests:** when one source states the answer explicitly, the investigator finds it, cites it, gets the status right (the answer is new; Current State doesn't record it yet), and doesn't hedge or ask for more evidence it doesn't need.

**Fake project setup (proposed):**
- **Current State:** "Launch terms of service: drafted (v3) and with Legal for review." (Recorded Sep 22.)
- **Evidence:**
  - **Legal note, Oct 3** (Maria Ortiz, Legal): "Legal has approved the updated terms of service (v3) for the October launch. No further changes are needed."
  - **Slack, Sep 29**, a distractor from before the approval: "Any word from Legal on the ToS?" / "Not yet, still waiting."
  - **Project note, Sep 30**, unrelated noise: privacy policy edits are still in progress.
- **Open Reviews:** none on this topic.
- **Open Question:** "Has Legal approved the updated terms of service for launch?"

**Expected (proposed):**
- **Status:** Supported by new evidence. The legal note establishes it, but Current State still says "with Legal for review", so making it official needs a person.
- **Suggested answer:** Legal approved terms of service v3 for the October launch on Oct 3 (Maria Ortiz).
- **Must cite:** the Oct 3 legal note. It should mention that Current State still shows the review in progress, phrased as "this may support updating Current State".
- **Must never claim:**
  - that Current State is wrong or out of date (as a declaration rather than "may support an update"), or that it has been updated;
  - that the Sep 29 Slack exchange contradicts the approval (it's older);
  - that the privacy policy was approved;
  - any date, version or approver the note doesn't state.
- **Expected next action:** "Use as my answer" (decision #1), noting that the Current State item may need its own update through Review.

**Severity (proposed):**

| Failure | Severity | Why |
|---|---|---|
| Declares Current State wrong, or treats the approval as already established | High | An authority misstatement |
| Claims something the note doesn't say (the privacy policy, another date or approver) | High | An invented fact |
| Misses the legal note and answers Unresolved | High (proposed) | Fits "misses consequential evidence" (High) and "a wrong conclusion" (Medium): the two definitions overlap here, so it's Paige's call |
| Treats the older Slack "not yet" as conflicting evidence | Medium | A wrong reading of the chronology, but not dangerous |
| Correct answer, but recommends gathering more evidence anyway | Low | Review burden (the prototype's "minor notes") |

---

## Q-102 to Q-105: not drafted yet

These are summarised in #142 ("Controlled prototype results") and #153. Draft each card in the same format, then wait for Paige's approval before building.
