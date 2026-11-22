# The acceptance review procedure

A review answers three questions for one release, in this order: can it be signed, what stands in the way, can earlier decisions still be trusted. Each step names the tool, the fields to read and what to say.

## Step 1. Status: `get-acceptance-status`

Input: `projectKey` (required), `release` (optional). A Confluence space key (`CLMACC`) is not a project key: on a record page the project key is the first part of the issue keys (`CLM-5` belongs to `CLM`).

Words, never codes: every date has a field ending in `InWords` beside it ("11 Nov 2026"), and an outcome has `outcomeInWords` ("Accepted with conditions"). Say those. Never print `accepted_with_conditions`, `2026-11-11` or `2026-11-11T07:56:34Z`.

| Field | Meaning | What to say |
|---|---|---|
| `release`, `build` | The release answered for and the build being accepted (`null` or absent = no single build is set; a pipeline gate then has no build to match) | Name the release |
| `buildInWords`, `buildsTested` | The build line, ready to say: "The build being accepted is 2.4.0-rc2." when a build is set; otherwise what was tested, from the latest runs: "Builds tested: 2.4.0-rc1, 2.4.0-rc2." (`buildsTested` is the same list). Absent when no run names a build | Say `buildInWords` as written; when absent, say nothing about builds. Never say a build is missing or not set, and never call a tested build the accepted one |
| `releaseChosenLine` | Only when you left `release` empty: "No release was named: this answer is about Release 2.5, because Release 2.4 is already decided (accepted with conditions by … on 11 Nov 2026, Record 2)." `list-blockers` returns it too | Give it word for word as your second line, so the numbers of one release are not taken for those of another |
| `headline` | The answer in one line | Quote it on the first line, after "Yes." / "Not yet." / "No." |
| `earlierConditionsLine` | Conditions from earlier records, in one line | Say it second when present |
| `verdict` | `ready`, `not_ready` or `signed` | The lead of your answer |
| `decidedLine` | Only when `verdict` is `signed`: "Already decided. Release 2.4 was accepted with conditions by … on 11 Nov 2026 (Record 2)." | Make it your first line, as written. Then go to step 4 and leave out the counts and the blockers |
| `signable` | Plain acceptance is available now | "Can be signed" only when true |
| `accepted` | A sealed decision for this release is accepted or accepted with conditions | The only field a deployment gate should trust |
| `countsInWords` | The four counts: Passed, Passed then changed, Failed, Not tested | Give all four in these words. Passed = nothing changed since. Passed, then changed = the pass no longer counts, never add it to Passed. Failed = failed or blocked. Not tested = not run, or a requirement with no case. The keys in `counts` are internal names: never say them |
| `totals` | Number of requirements and cases | "4 requirements and 12 acceptance cases" |
| `blockerCount`, `coveredCount` | Every item that stops plain acceptance, and how many of them have a condition or a waiver proposed. A proposal is not a decision: a covered item still counts | If `blockerCount` is above zero, do step 2 |
| `openLine` | What is open, what is proposed and what the approver can do: "5 things are open; a condition or a waiver is proposed for each; it can be accepted with conditions by …, or rejected." `null` when nothing is open or once decided | Quote it |
| `canAcceptWithConditions` | Every open item has a condition or a waiver proposed, so the approver may accept with conditions now | Never say "can be signed" for it: `signable` is plain acceptance |
| `sentence` | The verdict in words, followed by `openLine` | Quote it |
| `lastDecisionLine` | The last decision and how its conditions stand, in one line | The first line of an answer to "what did we promise last time" |
| `usualSheet` | What a plain test sheet would have shown | Quote it when present |
| `request` | The open sign-off request: approver, due date, who asked and when | "Asked by … on `requestedAtInWords`, to decide by `dueDateInWords`". `null` = nobody has been asked yet |
| `lastDecision` | The sealed decision on this release, or (when `forThisRelease` is false) the newest earlier record that carries conditions | `outcomeInWords`, `decidedBy`, `decidedAtInWords`, record number |
| `earlierConditions` | Promises from earlier records | Step 3 |
| `openDefects` | Open defects in the release, with priority and whether they block | Mention them |
| `historyError` | Set when Jira history could not be read | Say so. Signing is blocked. Do not report conflicts as absent |
| `sampleData` | True for the sample release | Say once that the people and the release are sample data |

An `error` is repeated word for word, in quotation marks; then stop. With `code: "not_found"` the asking person may have no permission in Jira: add "That project may not exist, or you may not have permission to see it."

## Step 2. Blockers: `list-blockers`

Input: the same. It returns EVERY open item, also one that has a condition or a waiver proposed for it: each stays a blocker until the approver signs. `count` is all of them, `coveredCount` how many have something proposed. `countLine` ("5 things block sign-off.") is the first line of an answer to "what is blocking"; `changedLine` ("2 things changed after testing; 3 passes no longer count.") of an answer to "what changed since testing"; `openLine` is as in step 1.

Each blocker has:

| Field | Meaning |
|---|---|
| `code` | `S1`–`S6` for a pass that changed, `D1`–`D4` for a conflict, otherwise the kind in capitals (`FAILED`, `BLOCKED`, `NOT_RUN`, `NO_CASE`, `DEFECT`, `OVERDUE_CONDITION`). See `rules.md` |
| `kind` | Internal: `stale` (say "passed, then changed"), `failed`, `blocked`, `not_run`, `no_case`, `defect`, `conflict`, `overdue_condition` |
| `item` | The issue key to cite |
| `sentence` | The reason in words. Quote it |
| `since`, `by` | When it happened and who did it, when known |
| `changes` | Passed, then changed only: each trigger with `issueKey`, `at`, `by`, `before`, `after` |
| `tested` | For a case: the latest run (result, time, tester, build) |
| `coveredBy` | `null`, or what is proposed for it in the brief, in words: 'Condition proposed: "…" (owner …, due …)' or 'Waiver proposed: "…"'. It is still a blocker |
| `citation` | The link to give as the source |

Blockers arrive most serious first: passed then changed, failed, blocked, not run, no case, defects, conflicts, overdue conditions. Keep that order.

Also returned, as facts and not blockers:

- `conflicts`: every duty conflict found, with `blocking` true or false. `dutiesCheckedFor` says whose duties were checked as approver; when `named` is false, no approver has been asked yet and the check was made for the person calling.
- `openDefectsNotBlocking`: open defects below the blocking priority.
- `earlierConditions`: conditions from earlier records that are not met.
- `teamworkGraph` (`state`, `sentence`, `linked`): only when `sentence` is not null (the graph links a work item from outside this release, or development work), add ONE line after the blockers: the `sentence`, word for word. `linked` holds the same items with links (`kind` is `work_item`, `deployment`, `pull_request`, `branch`, `commit` or `build`; for `work_item`, `relatedKey` is the outside item and `issueKey` the release item it is linked to). In every other case write nothing about the Teamwork Graph. Never invent linked work. It is never a blocker.

What each kind needs before the release can be accepted with conditions:

| Kind | Cleared by | Or covered by |
|---|---|---|
| passed, then changed | A new run of the case | A condition |
| failed, blocked, not_run | A new passing run | A condition |
| no_case | Adding a case and running it | A condition |
| defect | Closing the defect | A condition |
| conflict | Naming a different approver, or someone else re-running the case | A waiver |
| overdue_condition | The condition being confirmed as met | A waiver |

A waiver recorded by the person who signed is reported as "Not independent" (allowed by the project's settings, printed on the record).

## Step 3. Earlier promises

Read `earlierConditions` from either tool. For each: `text`, `owner`, `dueDate`, `state` (`open`, `met`, `overdue`), `daysLate`, `recordNumber`, `release`, `linkedIssue`. Quote `sentence` when present. Empty list: "No earlier conditions."

## Step 4. Seal: `verify-seal`

Input: `projectKey` (required), `recordNumber` (optional; default the latest), `wholeChain` (optional; verifies every record back to the first).

| `result` | Say | Then |
|---|---|---|
| `intact` | "Seal intact", with the record number and `sealShort` | Nothing more is needed. Say nothing about the page differing or being restored |
| `broken` | "Seal broken" | For each entry in `differences`: `where`, `sealed`, `found`, `editedBy`, `editedAtInWords` (day and time). `sealed` and `found` write a link in words ("link to CLM-5") and show at most three: repeat them as given. Then add `pageDiffersLine` (the sealed record itself is unchanged; only the readable page differs) and `restoreLine` as written, each only when it is not null. Both are null for every other result |
| `intact_evidence_missing` | "Seal intact, evidence missing" | Name the files from `differences` |
| `not_fully_checked` | "Not fully checked". Never report it as intact | Quote `sentence` and name each check that could not run, with its line from `checkMessages` |

`checks` reports the five checks separately: `snapshot` (the stored record matches its seal), `page` (every value and all other text on the Confluence page match the record), `chain` (the link to the previous and next record), `evidence` (the evidence files still exist unchanged), `signerComment` (the seal the signer posted as their own Jira comment matches). `null` means the check could not run or does not apply; `checkMessages` says which, in words.

Asked what the seal proves, say in one sentence: the record is tamper-evident; the app keeps the record and its hash, so the outside witness is the signer's Jira comment, whose author and time the app cannot change. Never say tamper-proof, immutable, cannot be edited, safe or guaranteed.

`changedSinceSigning` lists what happened in Jira after the decision. It never breaks the seal. Report it separately: "Changed since signing: … This does not affect the seal."

`firstLine` is the result as one ready line: "Yes. Seal intact." / "No. Seal broken." / "Yes, but: Seal intact, evidence missing." / "Not yet. Not fully checked.", then the record, its release and its short seal. `resultInWords` is the result alone.

With `wholeChain`, `result` is the worst result of all records and `chain` lists each record's own result (`recordNumber`, `release`, `sealShort`, `resultInWords`). When every record is intact, `firstLine` is "Yes. Seals intact. N records checked."

## Step 5. Conclude and cite

One conclusion, written as the FIRST line of the answer: "Yes. Can be signed." / "Not yet. Not as it stands." / `decidedLine` ("Already decided. …"). Then the findings, then **Sources**: at most five of the citations the tools returned, the release or the record first, then the most serious blockers; never the same link twice. If any tool returned `error`, the first line is that the review could not be completed, followed by the error sentence word for word.
