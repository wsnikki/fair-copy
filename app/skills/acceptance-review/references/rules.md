# Rules summary

How the app decides what the tools report. Nobody declares anything: every rule is computed from Jira history and from the runs recorded in the app.

## State of an acceptance case

First match wins.

| If | State | Counted as |
|---|---|---|
| The case has no run | Not run | Not tested |
| The latest run failed | Failed | Failed |
| The latest run was blocked | Blocked | Failed |
| The latest run passed and something it tested changed afterwards | Passed, then changed | Passed, then changed |
| The latest run passed | Passed | Passed |

A requirement with no case is "No case" and counts as Not tested. Only the latest run of a case counts. Only a pass can become "Passed, then changed", and it is never counted as passed. It stays that way until a new run.

## What makes a pass stop counting (codes S1–S6)

| Code | Trigger after the run |
|---|---|
| S1 | The requirement's summary, description or acceptance criteria were edited |
| S2 | The case's own summary or description (the test steps) were edited |
| S3 | The requirement was reopened from Done |
| S4 | A linked defect that was closed when the case was tested has been reopened |
| S5 | The build under acceptance is no longer the build that was tested (only when a build is set on the release) |
| S6 | An evidence file recorded on the run is missing or has changed |

Not triggers: comments, moving a status forward, assignee, labels, priority, links added, a new defect being raised (that shows under open defects).

## Separation of duties (codes D1–D4)

- **Builder** of a requirement: anyone who was its assignee while it was In Progress, or who moved it to Done. The same test is applied to each linked defect.
- **Tester** of a requirement: anyone who recorded a run on one of its cases.
- **Approver**: the one person named on the sign-off request.

| Code | Conflict | Default |
|---|---|---|
| D1 | The approver built something in the release | Blocks signing |
| D2 | The approver tested something in the release | Blocks signing |
| D3 | One person built and tested the same requirement (they tested their own work) | Blocks signing |
| D4 | The person who requested sign-off is also the approver | Warning only |

A conflict is cleared when the facts change (a different approver is named; someone else re-runs the case) or when a waiver covers it. A conflict is a control gap, not an accusation.

## Three outcomes, three bars

| Outcome | Allowed when |
|---|---|
| Rejected | Always, by the named approver, with a statement |
| Accepted | Nothing Failed, Not tested or Passed, then changed; no open defect at or above the blocking priority (High by default); no uncovered conflict; no blocking overdue condition |
| Accepted with conditions | Every item that stops plain acceptance is covered: cases and defects by a **condition** (what must be done, an owner, a due date), conflicts and blocking overdue conditions by a **waiver** |

A waiver is a written exception: what it covers, a reason, who authorised it and a reference. It applies to one decision only and is printed on the record. A waiver recorded by the person who signed is marked "Not independent": the project's settings allow it, because some teams have one approver, and it is printed so that a reader can judge it.

Signing is always refused when the person is not the named approver, when the brief changed while they were reading, or when they have not confirmed that they read it.

Conditions carry over: they stay with the project and are shown again in the next release until someone confirms them as met. By default an overdue condition is shown but does not block; a project can switch that rule on.

Project rules can be switched off in the project's settings. A rule that is off removes the item from the blockers, never from the facts. Context from the Teamwork Graph is never a blocker.

The tools answer only for projects the asking person may browse in Jira. A project they cannot see answers exactly like one that does not exist.

## The seal

On sign-off the app stores one record of the decision and computes its seal: the SHA-256 fingerprint of the record's canonical JSON. Each record also holds the seal of the previous record, so the records form a chain. A readable copy is published as a Confluence page.

Verifying runs five checks:

| Check | Compares | Fails as |
|---|---|---|
| Stored record (`snapshot`) | The stored record against its seal | Seal broken |
| Confluence page (`page`) | Every value and all other text on the page against the record | Seal broken, naming the field |
| Chain (`chain`) | This record's link to the previous record, and the next record's link to this one | Seal broken |
| Evidence files (`evidence`) | Each evidence file still exists with the sealed fingerprint | Seal intact, evidence missing |
| Signer's comment (`signerComment`) | The seal the signer posted as their own Jira comment against the record's seal | Seal broken |

When nothing differs but at least one check could not run, the result is "Not fully checked". It is never reported as intact.

"Changed since signing" (a requirement edited or a defect reopened after the decision) is reported separately and never breaks the seal: the record is a photograph, and the world is allowed to move.

What the seal proves: the record is tamper-evident. The app keeps the record and its hash, so the outside witness is the signer's Jira comment, whose author and time the app cannot change. It does not prove who a person is, and it is not a legal signature.
