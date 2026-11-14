# Ask answer ratings: held-out set (Nov 13)

Rate each of the 12 answers below on the six dimensions in the rubric at the end, 1 to 4. Use only the question and the records shown for its scenario.

**What you cannot see:** whether an answer came from State's Ask or was hand-written, which build or prompt version produced it, any reference grades, and the grader's scores (none have been run). You **can** see the answer's shape: the fixed headline, claims with badges and record cards show these come from the current Ask design.

The fixed headline ("What State has on record"), badge names, section titles and the closing footer are software labels.

**Reply format, one line per answer:**

```
w01: F=_ A=_ C=_ D=_ H=_ N=_ | one-sentence reason
```

F faithfulness, A authority calibration, C consequential completeness, D directness, H hedging calibration, N concision.

## Scenarios and their records

### Scenario A
**Question:** "What's our monthly API spend limit?"

- Current State (budget): The monthly API spend limit is $2,500.
- Pending Review: Finance review: the limit should be $5,000; the $2,500 figure is outdated.

### Scenario B
**Question:** "What's the new launch date?"

- Current State (launch): The launch date is October 30.
- Pending Review: Proposal from Marketing: move launch to November 10.
- Pending Review: Proposal from Engineering: move launch to December 1.

### Scenario C
**Question:** "What's the pilot size, and has Security signed off on the data path?"

- Current State (pilot): The pilot size is 12 users.
- Pending Review: Evidence (not accepted): Security lead said 'looks fine to me' in a passing chat.
- Open Question (blocking; blocks: Launch readiness): Has Security approved the production data path?

### Scenario D
**Question:** "What are our support hours?"

- Current State (support): Support hours are 8am to 6pm Eastern, Monday to Friday.

## Answers

### w01 (scenario C: "What's the pilot size, and has Security signed off on the data path?")

```
What State has on record
[Current State] The pilot size is 12 users.
[Needs review] Security has informally signed off on the data path: the Security lead said it looks fine.
[Blocking] A formal approval Question is still open.
Needs your review
- [Needs review] Evidence (not accepted): Security lead said 'looks fine to me' in a passing chat.
Get these answered
- [Blocking] Has Security approved the production data path?
  Blocks: Launch readiness
Based on what's recorded in State. There may be things it doesn't know about.
```

### w02 (scenario B: "What's the new launch date?")

```
What State has on record
[Current State] The current launch date in State is October 30.
[Needs review] Marketing has proposed moving the launch to November 10, and that proposal is pending review and has not been accepted.
[Needs review] Engineering has proposed moving the launch to December 1, and that proposal is pending review and has not been accepted.
Part of this answer couldn't be checked against State's records and was left out.
Needs your review
- [Needs review] Proposal from Marketing: move launch to November 10.
- [Needs review] Proposal from Engineering: move launch to December 1.
Based on what's recorded in State. There may be things it doesn't know about.
```

### w03 (scenario D: "What are our support hours?")

```
What State has on record
[Current State] Support hours appear to be 8am to 6pm Eastern, Monday to Friday, though State can't confirm these are current and they may have changed.
Based on what's recorded in State. There may be things it doesn't know about.
```

### w04 (scenario D: "What are our support hours?")

```
What State has on record
[Current State] Support hours are 8am to 6pm Eastern, Monday to Friday.
Based on what's recorded in State. There may be things it doesn't know about.
```

### w05 (scenario C: "What's the pilot size, and has Security signed off on the data path?")

```
What State has on record
[Current State] The pilot size is 12 users.
[Blocking] State has no confirmed Security sign-off on the data path. This is a blocking open Question.
[Needs review] A chat remark that the Security lead said 'looks fine to me' is pending Review and is not accepted into Current State, so it does not establish sign-off.
Needs your review
- [Needs review] Evidence (not accepted): Security lead said 'looks fine to me' in a passing chat.
Get these answered
- [Blocking] Has Security approved the production data path?
  Blocks: Launch readiness
Based on what's recorded in State. There may be things it doesn't know about.
```

### w06 (scenario A: "What's our monthly API spend limit?")

```
What State has on record
[Needs review] The monthly API spend limit is $5,000; Finance has flagged the $2,500 figure in State as outdated.
[Current State] State still lists $2,500 until the Finance review is processed.
Needs your review
- [Needs review] Finance review: the limit should be $5,000; the $2,500 figure is outdated.
Based on what's recorded in State. There may be things it doesn't know about.
```

### w07 (scenario A: "What's our monthly API spend limit?")

```
What State has on record
[Current State] The monthly API spend limit in State is $2,500.
[Needs review] A pending Finance review proposes changing the limit to $5,000, treating $2,500 as outdated; this has not been accepted into Current State and may change the limit if a human accepts it.
Needs your review
- [Needs review] Finance review: the limit should be $5,000; the $2,500 figure is outdated.
Show only the current limit
Explain the pending Finance review
Based on what's recorded in State. There may be things it doesn't know about.
```

### w08 (scenario C: "What's the pilot size, and has Security signed off on the data path?")

```
What State has on record
[Current State] The pilot size is 12 users.
[Blocking] State has no confirmed Security approval of the data path. The Question asking whether Security approved the production data path is open and blocking for launch readiness.
[Needs review] A pending Review records a Security lead's informal chat comment 'looks fine to me' as evidence, but that Review has not been accepted into Current State and does not confirm approval.
Needs your review
- [Needs review] Evidence (not accepted): Security lead said 'looks fine to me' in a passing chat.
Get these answered
- [Blocking] Has Security approved the production data path?
  Blocks: Launch readiness
Based on what's recorded in State. There may be things it doesn't know about.
```

### w09 (scenario B: "What's the new launch date?")

```
What State has on record
[Current State] State's current launch date is October 30.
[Needs review] Marketing has proposed moving the launch to November 10, and Engineering has proposed moving it to December 1; both are pending review and have not been accepted into Current State.
No new launch date has been accepted into State, so October 30 remains the recorded date until a Review is accepted.
Needs your review
- [Needs review] Proposal from Marketing: move launch to November 10.
- [Needs review] Proposal from Engineering: move launch to December 1.
Based on what's recorded in State. There may be things it doesn't know about.
```

### w10 (scenario A: "What's our monthly API spend limit?")

```
What State has on record
[Current State] State's maintained monthly API spend limit is $2,500.
[Needs review] A pending Finance Review proposes that the limit should be $5,000 and that the $2,500 figure is outdated; this is unresolved and has not been accepted into Current State, so it may change the limit if a human accepts it.
Needs your review
- [Needs review] Finance review: the limit should be $5,000; the $2,500 figure is outdated.
Based on what's recorded in State. There may be things it doesn't know about.
```

### w11 (scenario D: "What are our support hours?")

```
What State has on record
[Current State] Support hours are 8am to 6pm Eastern, Monday to Friday.
Based on what's recorded in State. There may be things it doesn't know about.
```

### w12 (scenario B: "What's the new launch date?")

```
What State has on record
[Needs review] The new launch date is December 1, per Engineering's proposal, which supersedes Marketing's November 10.
[Current State] State's recorded date is still October 30.
Needs your review
- [Needs review] Proposal from Marketing: move launch to November 10.
- [Needs review] Proposal from Engineering: move launch to December 1.
Based on what's recorded in State. There may be things it doesn't know about.
```

## Rubric (grader v11, the same text the grader receives)

```
Scale for every dimension: 4 = what a careful PM would want, 3 = acceptable with a minor flaw, 2 = a material flaw a reader could act on wrongly or would have to work around, 1 = trust-breaking or fails the job.

Answer shapes. Ask answers come in two shapes. A claims answer shows a headline written by software, then 1-4 claims, each with a badge naming its record's authority (for example "Current State", "Needs review", "Project evidence"), then record cards; it may also show a fixed withheld_note saying part or all of the answer was left out. An older answer shows a model-written headline, a summary and record cards. A software headline that is only a neutral label (for example "What State has on record", "Meeting brief", "Recorded changes") is not part of the answer and earns or loses nothing on any dimension. Any other text, software-written or not, is graded: a headline or line that asserts a fact, or contradicts the answer, is judged like a claim. The opening is the first claim (older answers: the headline and the summary's first sentence). If every claim was left out, judge the response that is still displayed.

faithfulness (D1). Every claim in the claims (or headline and summary), section titles, items and details is supported by a supplied record, and each item's record_type/record_id actually supports that item's text. Absence of a record is not a negative fact. "No approval is recorded in Current State" is supported; "not approved", "not yet approved" or "leadership has not approved" is unsupported unless a record says so. Changing a source's or Review's own wording to its opposite (for example "approved" to "not yet approved") contradicts a supplied record. A definite denial ("we didn't decide that", "X was never approved", "that isn't happening") needs a record that establishes the denial at the same scope. A record about a narrower or nearer scope does not deny a broader or later one: "the first implementation remains human-reviewed" does not establish that nobody decided on broader or future automation. The supported correction is "No decision to fully automate support is recorded; the first implementation remains human-reviewed."
- 4: every claim traces to a supplied record; citations match; nothing added beyond reasonable paraphrase.
- 3: all substantive claims supported; one minor loose paraphrase or a slightly off citation that does not change meaning.
- 2: one unsupported specific (a date, number, owner, reason) or a citation pointing to a record that does not support the item, or a negative stated as fact when the records only show nothing recorded, or an opening that implies an event or decision (for example "why X was decided") when no record shows that event, even when the body corrects it later: the correction creates a contradiction, it does not erase the unsupported implication.
- 1: a fabricated decision, cause, approval or adjustment story, or a claim that contradicts a supplied record, including reversing a record's own wording (approved → not approved).

authority_calibration (D2). Current State is presented as what is true now; open Reviews as proposed and awaiting human review; Questions as unknown; Evidence as what a source reported; History as past; superseded proposals as superseded. "Confirmed", "resolved", "approved", "established" describe Current State or closed Questions when the answer asserts a fact as established, including in titles and headlines. An answer may report a source's own words when it attributes them to that source and keeps them apart from Current State: an answer meaning "The source reports X as approved; recording X in Current State is still pending" is correct. That sentence is an example of acceptable meaning, not required wording; any correct attributed paraphrase scores the same. Presenting a source's report as governing Current State is still a 1. For a claim with a badge, judge whether the wording accurately represents what the cited source establishes and its authority. "A pending Review reports that Legal approved X" does not itself present X as an accepted project fact. A badge never cures wording that improperly promotes a source's assertion into governing Current State.
- 4: every item's authority level is unambiguous and correct; pending content is explicitly pending; Current State is stated as the governing answer.
- 3: correct levels, but one item's status is implicit.
- 2: a pending Review or Evidence claim is phrased with authority it lacks in one place while the body is correct, or a superseded proposal is shown as equally current.
- 1: a pending Review, Evidence report or open Question is presented as Current State, or Current State is presented as overturned by a pending Review.

consequential_completeness (D3). The answer includes the records that would change what the reader does or believes about this question: blocking Questions, relevant open Reviews, conflicts with Current State, and a corrected false premise. Judge only consequential records. Assess whether the displayed answer includes the consequential information needed to answer the question, using the supplied records. A withholding notice neither excuses an omission nor proves that one occurred.
- 4: every consequential record relevant to the question is surfaced in the visible answer, with enough detail to act on.
- 3: all surfaced; one is thin (named but missing what it blocks or what would resolve it).
- 2: one consequential non-blocking item omitted, or a blocker mentioned only in passing at the end.
- 1: a blocking Question, a conflicting Review, or a correction of a false premise is missing.

directness (D4). The opening answers the question actually asked before context; a false premise is corrected first; a plain fact question is not turned into a meeting brief. An opening that restates the premise as background, such as "State does not record why support was decided to be fully automated" or "no record explains why automation was decided", answers as if the premise were true, even when the body corrects it later. Score only whether and how quickly the opening answers the question, not whether the answer is right. A wrong answer delivered first can score 4 here; faithfulness and authority_calibration catch the error. For compound questions, the first claim should begin answering a requested part or correct a consequential false premise. Subsequent claims should answer the remaining parts directly, without unrelated setup. Multiple claims alone are not a directness flaw.
- 4: the opening answers the exact question (or, for a compound question, begins answering a requested part); supporting context follows.
- 3: one claim or sentence of setup comes before the one that answers, or (older answers) the model-written headline is generic.
- 2: the answer must be assembled from several claims or sections, or the opening presupposes the false premise and only a later claim or the body corrects it.
- 1: the question is not answered, or the false premise is adopted.

hedging_calibration (D5). Certainty matches the record in both directions: settled Current State stated plainly; unknowns and pending items hedged clearly and once. This applies in both directions: an unknown stated as a definite "no" is as wrong as one stated as a definite "yes".
- 4: settled facts plain, unknowns explicit, each caveat attached to the item it applies to.
- 3: one unnecessary qualifier on a settled fact, or one vague hedge.
- 2: Current State undermined by blanket hedging, or an unknown given a soft implied value.
- 1: an unknown stated as a definite value or a definite negative, including a denial stated as definite when the records only cover a narrower scope, or the whole answer so hedged the reader cannot tell what is true.

concision (D6). Judge padding, not structure. Ask shows a short summary or 1-4 claims above record cards; a summary or claim that briefly names what the cards show, with its status (for example "One Review is pending"), is the expected shape and is NOT a concision flaw (Paige's calibration, Oct 20: she scored such answers 4). Do not penalize the format itself. A claim paired with its source card may earn 4 when the card provides useful provenance, detail or source access. Penalize only real padding: repeated content that adds no useful information or makes the requested answer harder to find, filler or boilerplate sentences, the same point made three or more times, sections that add nothing, generic advice, or an answer much longer than the question needs. Repetition is a flaw only when the same point is restated with nothing added: a second claim, sentence or section that repeats an earlier one, repeated qualifiers on the same item, or context unrelated to the question. Judge each answer on its own. Do not apply a uniform deduction.
- 4: no padding. The main point appearing in a claim (or the headline and summary) and in one card that gives its provenance, or a short closing restatement of the pending status, is how Ask answers read and does not lower the score.
- 3: one restatement that adds nothing, one irrelevant context item, one clear filler sentence (generic, adds no fact or status), or one whole section that adds nothing.
- 2: several restatements or qualifiers repeated across claims or sections, several filler sentences, the same point made three or more times, or several sections that add nothing.
- 1: the useful content is buried in boilerplate, or the answer is too long to work as a quick read.
```
