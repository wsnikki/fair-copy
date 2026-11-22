---
name: acceptance-review
description: Fair Copy acceptance review - review whether a Jira release (a fix version) is ready for formal acceptance sign-off - check the status, list blockers most serious first, explain passes that changed after testing and duty conflicts, check the seal of the last record, and cite every source. Use when someone asks if a release can be signed, approved, accepted or shipped.
allowed-tools: get-acceptance-status list-blockers verify-seal
---
# Acceptance review

Use this skill to answer, for one Jira release: can it be signed off, what stands in the way, and can the earlier decisions still be trusted. It works for any agent. It only reads; it never signs, waives or edits anything.

## Inputs you need

- `projectKey`: the Jira project key, for example `CLM`. A project name also works. A Confluence space key (for example `CLMACC`) is not a project key: on a record page, the project key is the first part of the issue keys on the page (`CLM-5` belongs to `CLM`).
- `release` (optional): the fix version name, for example `2.4`. Empty means the earliest unreleased release that has acceptance cases and still waits for a decision. The tools then return `releaseChosenLine`: whenever it is not null, give it word for word as your second line (it says which release was chosen and, when an earlier release is already decided, that it is).

If you do not know the project, ask for it. Do not guess one.

## Procedure

This procedure is for a whole review: can it be signed, is it ready. For a narrower question answer only that question, with the tool's ready line as your first line, word for word, and no `headline`, no "Not yet." and no four counts:

- What is blocking sign-off: `list-blockers`; first line `countLine` ("5 things block sign-off."), then `openLine`, then every blocker.
- What changed since testing: `list-blockers`; first line `changedLine`, then the blockers with codes S1 to S6.
- Who tested their own work: `list-blockers`, `conflicts`; first line "Nobody tested their own work." when no conflict has code D3.
- What was promised last time: `get-acceptance-status`; first line `lastDecisionLine`, then each of `earlierConditions` with its owner.
- Is a record intact: `verify-seal`; first line `firstLine` (step 4).

1. **Status.** Call `get-acceptance-status`. Quote `headline` first when present, then `openLine` when it is not null (how many things are open, what is proposed for them, what the approver can do), say `earlierConditionsLine` next when present, then report the release it answered for, the build line exactly as `buildInWords` gives it ("Builds tested: 2.4.0-rc1, 2.4.0-rc2." or "The build being accepted is 2.4.0-rc2."; nothing about builds when it is absent, and never that a build is missing or not set), and the four counts from `countsInWords`: Passed, Passed then changed, Failed, Not tested.
   - `verdict: "signed"`: a decision is already sealed. Your first line is `decidedLine`, exactly as written ("Already decided. Release 2.4 was accepted with conditions by … on 11 Nov 2026 (Record 2)."). Do not report the four counts or the blockers. Go to step 4.
   - `signable: true`: plain acceptance is available. Go to step 3.
   - Otherwise go to step 2.
2. **Blockers.** Call `list-blockers` with the same inputs. It returns every open item: list each blocker in the order returned, with its issue key and its `sentence`. A blocker whose `coveredBy` is not null has a condition or a waiver proposed for it; a proposal is not a decision, so it is still a blocker until the approver signs. Never leave it out and never say nothing is blocking. Then mention `conflicts`, `openDefectsNotBlocking` and `earlierConditions` as facts the approver should know, even when they do not block. Only when `teamworkGraph.sentence` is not null, add ONE line with that sentence, word for word. Otherwise write nothing about the Teamwork Graph. Never invent linked work; it is never a blocker.
3. **Earlier promises.** From `get-acceptance-status`, read `earlierConditions`. Say which are open, met or overdue (`stateInWords`), each with its owner (also when it is met), due date (`dueDateInWords`) and record number.
4. **Seal.** If `lastDecision` is not null, call `verify-seal` (add `wholeChain: true` when asked about all records). Give `firstLine` as written: it says exactly one of "Seal intact", "Seal broken", "Seal intact, evidence missing" or "Not fully checked", with the record and its short seal. For an intact seal say nothing about the page differing or being restored. For a broken seal name the field: `where`, `sealed`, `found`, `editedBy` and `editedAtInWords` (day and time); then add `pageDiffersLine` and `restoreLine` as written, each only when it is not null. "Not fully checked" is never reported as intact: name the checks that could not run, from `checkMessages`.
5. **Conclude.** The conclusion is the FIRST line of what you write, before the findings of steps 1 to 4. Exactly one of:
   - "Yes. Can be signed." Only when `signable` is true.
   - "Not yet. Not as it stands." Then `openLine` as written (it says whether the release can be accepted with conditions now, or only rejected until every blocker has a condition or a waiver), and what must be re-run, fixed, or covered.
   - `decidedLine`, which begins "Already decided." and carries the outcome in words, the person, the date and the record number.
6. **Sources.** End with at most five links from the `citation` and `citations` entries the tools returned, with their labels: the release or the record first, then the most serious blockers. Never repeat a link.

## Rules

- Every fact comes from a tool result. If a tool returns `error`, repeat the `error` sentence word for word, in quotation marks, and stop. The tools answer only for projects the asking person may browse in Jira: when `code` is `not_found`, add "That project may not exist, or you may not have permission to see it." If something is not in the results, say you could not find it.
- Words, never codes. Say an outcome as `outcomeInWords` gives it ("Accepted", "Accepted with conditions", "Rejected"), never `accepted_with_conditions`. Say a seal result as `resultInWords` gives it. Say a date as its `…InWords` field gives it ("11 Nov 2026"; with a time, "11 Nov 2026, 09:19 UTC"), never `2026-11-11` or `2026-11-11T07:56:34Z`. Every raw field has its words beside it: `decidedAt` / `decidedAtInWords`, `dueDate` / `dueDateInWords`, `requestedAt` / `requestedAtInWords`, `since` / `sinceInWords`, `at` / `atInWords`, `editedAt` / `editedAtInWords`, `sealedAt` / `sealedAtInWords`.
- In a difference, `sealed` and `found` already write a link in words ("link to CLM-5"). Repeat them as given; never rebuild a web address from them.
- The four counts are worded Passed / Passed, then changed / Failed / Not tested. The keys inside `counts` are internal names; never say them. "Passed, then changed" is never counted as passed.
- A waiver recorded by the person who signed is reported as "Not independent" (allowed by the project's settings, printed on the record).
- The record is tamper-evident. Never say tamper-proof, immutable, cannot be edited, safe or guaranteed.
- If `sampleData` is true, say once that the people and the release are sample data.
- If `historyError` is set, say the history could not be read and that signing is blocked. Never report "no conflicts" in that case.
- Cite the issue key for every case, requirement and defect, and the record number for every decision, condition and seal.
- A pipeline gate may deploy only when `accepted` is true and `build` equals the build being deployed.

## References

- `references/procedure.md`: the review step by step, with the fields to read and what to say for each result.
- `references/rules.md`: how case states, passes that changed, duty conflicts, signing bars and the seal are decided, with the codes the tools return.
- `references/vocabulary.md`: the words to use and the words to avoid.
