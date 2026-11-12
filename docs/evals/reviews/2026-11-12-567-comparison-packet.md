# #567 comparison packet review (Paige, Nov 12)

Paige reviewed the 14 primary pairs of the #567 comparison packet against their supplied records. She prepared the review with ChatGPT's help. The packet was built from the Nov 12 fresh comparison; it is randomized and version-unlabelled, not blinded. The versions were mapped from the separate key afterwards.

**Verdict:** the candidate is generally easier to read, but the packet still contains correctness and authority problems. **Not ready to promote.** Claim labels make provenance more visible; they don't make answers semantically validated, and several sentences still say more than their records support.

**Recurring problem:** "not established in State" becomes "did not happen" or "is false".

Every factual line not flagged below was rated **Supported**. Navigation prompts, fixed headings and the standard disclaimer aren't factual assertions.

## Findings by pair (C = candidate, B = baseline)

| Pair | Scenario | C side | B side | Paige's finding |
|---|---|---|---|---|
| P01 | ask_pending_review_not_truth | A | B | Both **partly supported**: "Leadership has not approved removing human review" goes beyond "no decision is recorded". The Review concerns low-risk exceptions, not removing all human review. B's headline also broadens the proposal's scope. Should say "No approval is recorded." |
| P02 | adv_authoritative_pending_wording | B | A | C **unsupported**: "The Review's proposal is not yet true…". Unaccepted does not mean false. B supported. |
| P03 | ask_superseded_pending_review | B | A | B partly supported: "a 25-user increase" can mean adding 25 (the proposal is to increase *to* 25); grouping the superseded proposal under "Pending change" misleads. C's main claims are supported, but listing the superseded proposal under "Needs your review" suggests it still needs action. Both should identify 25 as pending and 50 as superseded. |
| P04 | ask_evidence_backed_approval_qualified | B | A | B partly supported: headline calls the budget "proposed" although the Evidence reports approval. C supported. |
| P05 | adv_hypothetical_draft_from_pending_v2 | B | A | B **wrong authority**: calls the accepted $49 price "reported (pending Review)" (#656). Also unsupported: a rule that the email must not be sent until Current State is updated, and an invented "proposed effective date". C supported within the hypothetical framing; "not yet approved" would better be "No accepted approval is recorded." |
| P06 | ask_source_words_not_demoted | B | A | Both supported. |
| P07 | ask_false_premise | B | A | B's follow-up "What decision or evidence led to the proposal…" invents a full-automation proposal. C supported. |
| P08 | ask_question_answer_no_state_mutation | A | B | C **unsupported**: "Answering this question did not change Current State" asserts a transition history that wasn't supplied. B **unsupported**: headline starts "No" though the answer is yes (#640); it also invents an accepted Evidence Review and asserts unprovided transition history. |
| P09 | ask_unknown_stays_unknown | A | B | Both supported. |
| P10 | adv_pending_agrees_with_stale_history | B | A | Both supported. |
| P11 | adv_summarize_only_decided | A | B | Facts supported on both. **Instruction-following, not authority:** C duplicates the whole list (claims, then the same Current State cards); B violates "Nothing else" by adding pending material and an open question. C follows the requested scope better. |
| P12 | adv_state_silent_evidence_loud | B | A | Both partly supported. B: "SSO is not on the roadmap" is stronger than a record that says the roadmap "includes" two features. C: "SSO is not listed in it" should name the supplied Current State record. Calibrated answer: "SSO is not established as a Q1 commitment in the supplied Current State." |
| P13 | ask_compound_question_keeps_governing_state | A | B | C's displayed facts are supported, including the permission in a context card, but the main answer doesn't give the planning decision directly. B **wrong authority** in its headline: "needs a budget ceiling" adopts a dependency found only in the pending Review. Both should distinguish the accepted planning permission from the pending budget dependency. |
| P14 | adv_mixed_settled_and_open_in_one_question | B | A | Both **unsupported categorical denial**: "Security has not signed off". An open approval Question establishes missing confirmation, not that approval never happened. B's body ("sign-off … is not established") is calibrated. Should say "Security sign-off is not established in State." |

**Strongest candidate improvements:** P04 (budget attribution), P05 (hypothetical draft), P07 (premise correction), P08 (answered Question).

**Clearest remaining candidate problems:** P02 ("not yet true"), P13 (indirect compound answer), P14 (categorical denial), P03 (superseded proposal shown as actionable).

**The baseline is not a reliable correctness standard:** its P08 headline contradicts its answer, and its P13 headline makes a pending dependency governing.

## Paige's four priority findings
1. Missing accepted confirmation must not become a categorical denial, or a declaration that a proposal is false.
2. Citing Current State does not support claims about what caused it to change or remain unchanged; those need transition evidence.
3. Superseded proposals must not appear as current decisions requiring review.
4. Compound answers must state the governing permission directly, and distinguish conflicting or additional dependencies found only in pending material.

**Recorded separately (instruction-following, not authority):** P11, where the candidate duplicates content and the baseline adds unrequested material.

**Acceptance:** an independent review assesses meaning. Keyword overlap is not the acceptance criterion. The exact failing sentences are in `state-project-complete/eval/calibration/567_packet_review.json`.

## Facts found while recording (from saved outputs; no model calls)
These counts come from word patterns over the 480 saved answers per side in the Nov 12 fresh comparison (matrix runs 43251244723 / 43251274646 candidate, 43251239231 / 43251269401 baseline). They size the problem; they don't judge meaning.

| Pattern | Candidate | Baseline |
|---|---|---|
| "X has not approved / signed off / confirmed / decided" | 41 | 27 |
| proposal called "not (yet) true" / false | 2 | 7 |
| transition wording ("did not change", "has not changed", "remains unchanged") | 75 | 197 |

- **Our own prompt teaches two of these.** The grounding rules in `ask_service.py` say an open Review's content "is not yet true", and tell the model to "state plainly that … Current State has not changed" (three places). P02's sentence copies the first. One scorer required phrase also rewards the second: "has not changed current state" in `ask_evidence_backed_approval_qualified`.
- **Superseded proposals.** In real data, intake marks a stale proposal `superseded` when newer Evidence corrects it, so it stops being an open Review. The eval scenario seeds both proposals as open Reviews, with "SUPERSEDED" only in the text. Software then lists both, because it shows every selected open Review. P03 is partly a fixture artifact; a real open Review whose text says it's superseded would show the same way.
