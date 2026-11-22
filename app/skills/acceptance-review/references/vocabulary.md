# Vocabulary

## Words to use

| Term | Meaning | Also heard as |
|---|---|---|
| Acceptance | The business agreeing that a release does what was asked | UAT, user acceptance, business acceptance |
| Release | A Jira fix version put forward for acceptance | Version |
| Acceptance case (case) | One thing a user checks, tied to a requirement | Test case, UAT scenario, test script |
| Run | One execution of a case, with a result, a person and a time | Execution, test result |
| Evidence | What shows the run happened: screenshot, file, link | Objective evidence, proof, artefact |
| Sign-off | A named person's recorded decision on a release | Approval, authorisation, go/no-go |
| Approver | The person who signs | Business owner, service owner, authorising official |
| Condition | Something that must be done by a date for the acceptance to stand | Caveat, proviso, "accepted subject to" |
| Waiver | A named person's recorded permission to proceed despite a rule not being met | Exception, dispensation |
| Not independent | A waiver recorded by the person who signed. The project's settings allow it; it is printed on the record | Self-approved waiver |
| Deviation | A recorded departure from the plan | Non-conformance |
| Defect | Something that does not work as required | Bug (avoid "incident": that is a live-service event) |
| Separation of duties | The approver did not build or test what they approve | Segregation of duties, independence, four-eyes |
| Conflict | A person holding two duties that should be separate | Conflict of interest |
| Passed / Passed, then changed / Failed / Not tested | The four counts of a release, always in these words (tool field `countsInWords`) | Green / amber / red |
| Passed, then changed | A pass recorded before the tested thing changed. It is never counted as passed | Outdated or invalidated pass |
| Acceptance record (record) | What is written and sealed at sign-off | Sign-off pack, UAT report, release certificate |
| Seal | The SHA-256 fingerprint of the record | Hash, checksum |
| Seal intact / Seal broken / Seal intact, evidence missing / Not fully checked | The four results of verifying a seal. "Not fully checked" is never reported as intact | Valid / invalid |
| Signer's comment | The seal the signer posted as their own Jira comment: the outside witness, whose author and time the app cannot change | Anchor |
| Teamwork Graph context | Work the Teamwork Graph links to the release. Context only, never a blocker | Related work |
| Traceability | Following a requirement to its case, result and defect | Trace matrix, RTM |

When a person uses a word from the right-hand column, understand it, and answer with the word on the left.

## Words to avoid

| Do not say | Why | Say instead |
|---|---|---|
| "Part 11 compliant", "Annex 11 compliant", "GxP validated" | Compliance belongs to an organisation's whole system and procedures, not to a tool | "Supports the record-keeping and independence controls those frameworks describe" |
| "Electronic signature", "e-signature", "legally binding" | The app does not implement signature identity rules | "Sign-off", "recorded approval", "named approval" |
| "Tamper-proof", "immutable", "cannot be edited", "safe" | A fingerprint detects change; it does not prevent it | "Tamper-evident", "any later edit is visible" |
| "Audit trail" for the record | It is a specific system-generated log in regulated use | "Acceptance record" for the record, "Jira history" for the source |
| "Validated", "validation" | A formal, documented life cycle in regulated use | "Checked", or "verified" for the seal only |
| "Certified", "accredited", "audit-ready", "passes audit" | No certification is held and no audit result can be promised | "Gives the auditor the evidence in one place" |
| "Guaranteed", "guarantees", "ensures", "prevents failures" | Not provable | "Shows", "flags", "blocks signing until" |
| "Test management" | The app is not a test suite | "Acceptance and sign-off" |
| "Blockchain" | A chain of fingerprints is not one | "Each record is chained to the previous one" |
| "Fraud", "violation" for a conflict | A conflict is a control gap, not an accusation | "Conflict", "not independent" |
| The internal count names in `counts` and `kind`, and "invalidated", "outdated" | They are field names, not words for people | "Passed", "Passed, then changed", "Failed", "Not tested" |
| "Override", "bypass" for a waiver | A waiver is a written, named exception | "Waiver" |
