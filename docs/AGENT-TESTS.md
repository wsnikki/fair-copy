# AGENT-TESTS — manual checks for the agent, the skill and the MCP tools

For the sample release only: project **CLM** (ClaimPoint), release **2.4**, with release 2.3 as history ([DOMAIN](DOMAIN.md) §4). Load it first with `Load sample release`. Run each question in Rovo Chat with the **Acceptance officer** agent, then repeat tests 1, 4 and 9 through an outside MCP client (section 4).

I ran these by hand on my own developer site, which has Rovo chat. Where a result below was seen, it says on which build; where an expected answer has not been seen, it is marked [not verified].

**Results so far (all on 11 Nov 2026).**

| What | Where | Result |
|---|---|---|
| Tests 1 to 6 | Development agent, before sign-off, before the sample carried a proposal | Pass, after two fixes to the prompt |
| Tests 7 to 12, lenient inputs, repeat of test 1 after sign-off, section 3 | Production agent (2.1.0), after sign-off of 2.4 | Ten of twelve right; 7 and 9 wrongly said "Seal broken" (see below) |
| Section 4: admin switch, outside MCP client, five calls | Production (2.1.0) | Proven end to end; `verify-seal` answered a false "broken" |
| Tests 1, 3, 4, 6, 7 and section 4 again, on a fresh unsigned sample | Production agent (2.2.0) | The seal fault was gone. New fault: the proposal the sample's test lead makes emptied the blocker list, so 1, 3, 4 and 6 failed |
| Section 6, questions p to u and the first conversation starter; section 4, seven calls; on a fresh unsigned sample | Production agent (2.3.0) | **All pass.** One small miss: in question s the Sources were plain labels, not links |

**The two faults these runs found, both fixed and seen fixed.**

1. On 2.1.0, asked from Jira, from Rovo Studio or through MCP, `verify-seal` said "Seal broken" for records that were intact, because those calls carry no site address and relative links were compared with absolute ones. Now the action reads the site address from Jira, and links are compared so that a missing address can never say "broken". Seen on 2.2.0 and 2.3.0: Record 1 "intact" through MCP and in chat, every link absolute. The answer shape was changed at the same time: the verdict is the first line, Sources has at most five links, nothing is said about an empty Teamwork Graph, a decided release starts with "Already decided.", errors are repeated word for word, and the tools return outcomes and dates in words.
2. The loader writes a proposal with the sign-off request: Priya Raman (sample test lead) proposes one condition (covering CLM-15, CLM-16, CLM-18 and CLM-22) and one waiver (for the approver's conflict). So all five open items have something proposed from the first minute. The tools of 2.2.0 took "proposed" for "dealt with": `list-blockers` returned no blockers and the agent said "Nothing changed since testing." Now a proposal is not a decision: `blockers` lists every open item until the approver signs, each with `coveredBy` (what is proposed for it, in words, or null); `count` and `blockerCount` are 5 and `coveredCount` is 5. The tools also return a ready first line for each narrow question (`countLine`, `changedLine`, `lastDecisionLine`) and one sentence on what the approver can do (`openLine`); the restore sentences come only with a broken seal. Seen on 2.3.0, through MCP and in chat.

**Not asked again since those fixes:** everything after sign-off (tests 8 to 12 on the new build, the repeat of test 1 after sign-off, section 3, the second table of section 6). Their "Expected" text is [not verified] where it differs from the result of 11 Nov on 2.1.0.

The agent is found in Rovo Chat by its name, "Acceptance officer": open the agent menu, search for the name, choose it. It shows three conversation starters: "Can release 2.4 be signed?", "Is the last acceptance record still intact?", "What is blocking sign-off of release 2.4?". An answer took 27 to 33 seconds. People pickers in the app (not used by these tests) search by display name: an email or a login finds nobody.

**Which agent is answering: production or development.** My test site has both installations, each with an agent called "Acceptance officer", and neither name carries a marker. A site that installed from the installation link has only production, so this matters only to me. Three ways to tell:

1. The agent's profile (Browse agents → More actions → View agent), section Skills: production lists "Acceptance Review", development lists "Acceptance Review (Development)".
2. The avatar: production is the green hexagon with a magnifier, development the yellow one with bars.
3. "Debug response" under any answer: it lists every tool call with its input and output, the agent id, and the id of the skill it loaded, which ends in the environment id (production: `f786ad46-c754-4b2f-ada0-c887a1b582f9`). This dialog is also where "Expected tool calls" is checked.

In Rovo Studio the skill picker shows both: `/acceptance-review` (production) and `/acceptance-review-dev` (development).

If the key CLM was already taken on the site, the sample project is CLM2 to CLM5. The Readiness tab shows the real key: use it in place of CLM in every question, call and issue key below (CLM2-15 for CLM-15, and so on).

**Which release the tools answer for when none is named.** The earliest unreleased release that has cases and still waits for a decision: 2.4 on a fresh sample, **2.5 once 2.4 is accepted**. The tools return `releaseChosenLine` whenever the release was not named, and the agent gives it as its second line: before sign-off "No release was named: this answer is about Release 2.4." (seen on 2.3.0); after it "No release was named: this answer is about Release 2.5, because Release 2.4 is already decided (accepted with conditions by (the signer) on (the day), Record 2)." [not verified through the agent]. So tests 2, 3, 5 and 6, which name no release, describe 2.4 only BEFORE sign-off; after it, name the release ("… of release 2.4") to ask about 2.4. Release 2.5 by the oracle of DOMAIN §4.7: 2 requirements (CLM-25, CLM-26), 3 cases, 1 passed, 0 passed then changed, 0 failed, 2 not tested, also after signing (the condition's issue CLM-31 is not a requirement). Those numbers were seen on the Readiness screen of 2.5 after signing; not through the tools.

## 1. Facts the answers must match (the oracle)

From DOMAIN §4.5 and §4.6, with the default rules. Sample dates are shifted so that day zero (D0, "9 Dec" in DOMAIN) is the day the sample was loaded. Dates below are written as DOMAIN dates with the offset; check the offset, not the calendar date.

| Fact | Expected |
|---|---|
| Totals | 4 requirements (CLM-7 to CLM-10), 12 acceptance cases (CLM-11 to CLM-22) |
| Counts | Passed 8 · Passed, then changed 3 · Failed 0 · Not tested 1 (the tools' internal keys are `proven`, `stale`, `failing`, `unproven`; the agent never says those words) |
| Usual sheet | "The usual sheet would show 11 passes. 3 are no longer true." |
| Stale: CLM-15 | Passed 2 Dec (D-7), tester Daniel Okafor, build 2.4.0-rc2. Code S1: requirement CLM-8 edited by Leo Marchetti on 3 Dec (D-6) |
| Stale: CLM-16 | Passed 26 Nov (D-13), tester Daniel Okafor, build 2.4.0-rc1. Code S1: the same CLM-8 edit |
| Stale: CLM-18 | Passed 3 Dec (D-6), tester Mei-Ling Chow, build 2.4.0-rc2. Code S4: defect CLM-24 reopened on 4 Dec (D-5) |
| CLM-8 edit | Before: "The new award applies from the date of the change." After: "The new award applies from the Monday following the date of the change." |
| Not run | CLM-22 "Caseworker can pause recovery for hardship" |
| Open defects | 1: CLM-24, priority Medium, In Progress. Below the default blocking priority (High), so it is a fact, not a blocker |
| Conflict | One, code D1: the person who loaded the sample is a builder of CLM-9 (assignee of its defect CLM-24 while In Progress), and the sample's request names them approver. No D3: nobody tested their own work |
| Blockers | 5 open items: 3 passed then changed (CLM-15, CLM-16, CLM-18), 1 not run (CLM-22), 1 conflict (D1). On a fresh sample each has something proposed by the test lead (one condition for the four cases, one waiver for the conflict): `coveredCount: 5`. They are still five blockers until the approver signs. The overdue condition is not a blocker by default |
| Verdict | `not_ready`, `signable: false` (plain acceptance is not available), `accepted: false`, `canAcceptWithConditions: true`. `sentence`: "Awaiting a decision from (the approver), due (the day). 5 things are open; a condition or a waiver is proposed for each; it can be accepted with conditions by (the approver), or rejected." The second sentence alone is `openLine`. (With no request open the sentence starts "Not ready to sign:".) |
| Build | No build is set on the sample release (SPEC decision 11), and no screen says so as a gap: the Brief shows "Builds tested: 2.4.0-rc1, 2.4.0-rc2", the tool gives `buildInWords` "Builds tested: 2.4.0-rc1, 2.4.0-rc2." and `buildsTested` with the two names; `build` is null |
| Request | Open from the moment the sample is loaded: requested by Priya Raman (sample test lead), approver the person who loaded the sample, with a due date; the sign-off task is CLM-30 |
| Record 1 | Release 2.3, accepted with conditions by Grace Whitlock on 18 Sep (D-82), 2 conditions |
| Condition 1 | "Fix CLM-5 and re-run CLM-3 by 16 Oct 2026." Owner Tomasz Wrobel. Met |
| Condition 2 | "Deliver CLM-6, the override audit export, by 30 Nov 2026." Owner Aisha Bello. Open, overdue, 9 days late. CLM-6 is In Progress |
| Dates on screen | Shifted with the load day, also inside the condition texts. Loaded on 11 Nov 2026 (28 days before DOMAIN's 9 Dec) the screens and the tools read: Record 1 decided 21 Aug; "…re-run CLM-3 by 18 Sep 2026."; "…by 2 Nov 2026."; the request due 20 Nov; the proposed condition due 18 Nov |
| Seal of Record 1 | Intact. Chain: Record 1 → start. The seal value differs per load: read the short seal on the Records tab |

Every answer must also: put the verdict on the first line, alone (yes-or-no questions start "Yes." / "No." / "Not yet."; a release that is already decided starts "Already decided."); cite issue keys and "Record 1"; end with **Sources**, at most five links, the release or the record first; never count a pass that changed as a pass; say once that the people and the release are sample data; say nothing about the Teamwork Graph when it linked nothing from outside the release; give outcomes in words ("Accepted with conditions") and dates as "11 Nov 2026", never a code or a timestamp such as `accepted_with_conditions` or `2026-11-11T07:56:34Z`; repeat a tool's error sentence word for word.

## 2. Twelve test questions

"Tools" lists the calls in order with the inputs that matter. `projectKey` is `CLM` in every call. Tests 1 to 6 describe the release BEFORE sign-off. "Result" is what the production agent did on 11 Nov 2026, with the build; "[not verified]" means the expected answer changed after that result and was not asked again.

| # | Question | Expected tool calls | The answer must contain | Fail if | Result |
|---|---|---|---|---|---|
| 1 | Can release 2.4 of CLM be signed? | `get-acceptance-status {release: "2.4"}` → `list-blockers {release: "2.4"}` | First line "Not yet." followed by the tool's headline ("The usual sheet would show 11 passes. 3 are no longer true."). Then the tool's `openLine`: "5 things are open; a condition or a waiver is proposed for each; it can be accepted with conditions by (the approver), or rejected." 3 passes no longer true: CLM-15, CLM-16, CLM-18. 1 not tested: CLM-22. 1 conflict (D1, CLM-9) | Says yes; says 11 passed; omits an issue key; says nothing is blocking because something is proposed; no Sources; more than five Sources | Fail on 2.2.0 (no case keys). **Pass on 2.3.0**, typed and as the starter: the two expected lines, then "Last time (Release 2.3, Record 1): 2 conditions. 1 is 9 days overdue, 1 met."; all four cases and the conflict named; five Sources, all links |
| 2 | What exactly would I be signing? | `get-acceptance-status` (then `list-blockers` if it lists what is open) | Release 2.4 of ClaimPoint: 4 requirements, 12 acceptance cases; 8 passed, 3 passed then changed, 0 failed, 1 not tested. "Builds tested: 2.4.0-rc1, 2.4.0-rc2." (the tool's `buildInWords`). Who asked and by when: Priya Raman, with the due date of the request. 1 open defect, CLM-24. 1 condition from Record 1 still open. A pointer to the Brief on the Fair Copy tab | Invents a build, an approver or a due date; calls one tested build "the build being accepted"; says "No build is set" or "not set" | Pass on development with the earlier words ("No build set"); the "Builds tested" line is [not verified] |
| 3 | What changed since the last test run? | `list-blockers` | First line, the tool's `changedLine`: "2 things changed after testing; 3 passes no longer count." No "Not yet.", no headline, no four counts. CLM-8 edited by Leo Marchetti on D-6, after CLM-15 and CLM-16 passed, with the before and after text ("from the date of the change" → "from the Monday following the date of the change"). CLM-24 reopened on D-5, after CLM-18 passed | Says "Nothing changed since testing."; lists CLM-22 as a change; lists CLM-14 (it was re-run after the edit and is proven) | Fail on 2.2.0 ("Nothing changed since testing."). **Pass on 2.3.0**: the expected first line, then "No release was named: this answer is about Release 2.4.", the CLM-8 edit with before and after, CLM-24 reopened |
| 4 | What is blocking sign-off of release 2.4? | `list-blockers {release: "2.4"}` | First line, the tool's `countLine`: "5 things block sign-off." Then `openLine` (a condition or a waiver is proposed for each; it can be accepted with conditions, or rejected). Five blockers in the tool's order: CLM-15, CLM-16, CLM-18 (passed, then changed), CLM-22 (not tested), the D1 conflict. Then, under "Not blockers, but facts for the approver": CLM-24 open (Medium, In Progress), the overdue condition from Record 1 | Starts "Not yet." or with the usual-sheet headline or the four counts; lists fewer than five blockers; puts the D1 conflict under "not blockers"; calls CLM-24 or the overdue condition a blocker; reorders by its own judgement | Fail on 2.2.0 (opened "Not yet. The usual sheet …"). **Pass on 2.3.0**: "5 things block sign-off.", the `openLine` sentence, five blockers, the two facts under "Not blockers, but facts for the approver" |
| 5 | Who tested their own work? | `list-blockers` | "Nobody tested their own work.": there is no D3 conflict. One other conflict exists: the named approver (the person who loaded the sample) built part of CLM-9 through CLM-24. For whom the duties were checked (`dutiesCheckedFor`): that approver | Says "no conflicts" outright; names Samuel Ortega as a conflict (he is one only when named approver) | **Pass on 2.3.0**: "Nobody tested their own work.", the conflict, for whom the duties were checked. Small miss: Sources were written as plain labels, not links |
| 6 | What did we promise last time, and is it done? | `get-acceptance-status` | First line, the tool's `lastDecisionLine`: "Release 2.3 was accepted with conditions by Grace Whitlock on (the day) (Record 1): 2 conditions, 1 met, 1 overdue." No "Not yet.", no headline, no four counts. Then the two conditions, each with its owner: fix CLM-5 and re-run CLM-3, owner Tomasz Wrobel, met; deliver CLM-6, owner Aisha Bello, overdue, 9 days late | Starts "Not yet." or with the usual-sheet headline; leaves out Grace Whitlock, "accepted with conditions" or an owner; gives only a count; says both are open or both are met | Fail on 2.2.0 (opened "Not yet.", no Grace Whitlock). **Pass on 2.3.0**: the expected first line with "21 Aug 2026", both conditions with owner, due date and state |
| 7 | Is record 1 still intact? | `verify-seal {recordNumber: 1}` | First line "Yes. Seal intact. Record 1 · release 2.3 · seal" and the short seal (8 characters … 4 characters). Anything in `changedSinceSigning` listed separately as not affecting the seal. Nothing about the page differing and nothing about restoring it (`restoreLine` and `pageDiffersLine` are null for an intact record) | Says "valid", "verified" or "tamper-proof"; invents a seal value; leaves out the short seal; says "only the readable page differs" or "the page can be restored" | Fail on 2.1.0 from Jira (a false "Seal broken"). On 2.2.0 the first line was right, followed by one wrong paragraph about restoring. **Pass on 2.3.0**: the first line with the short seal, then the two later changes listed as not affecting the seal; nothing about restoring |
| 8 | (After editing a result on the Record 1 Confluence page) Is record 1 still intact? | `verify-seal {recordNumber: 1}` | First line "No. Seal broken." with the record and short seal. Where (for example "Evidence · Case CLM-3 · State at signing"), the sealed value, the value on the page now, who edited the page and when, with the day and the time ("11 Nov 2026, 09:19 UTC"). "The sealed record itself is unchanged; only the readable page differs." (the tool's `pageDiffersLine`). That the page can be restored from the sealed record (the tool's `restoreLine`) | Does not name the field; says the record itself was changed; says "safe"; shows a row of link cards in place of a value | On 2.1.0: pass on field, values and editor. Missing: the time of the edit and the restore sentence; a false second difference from the site-address fault. Changed since, [not verified] |
| 9 | Are all acceptance records for CLM intact? | `verify-seal {wholeChain: true}` | First line "Yes. Seals intact. 2 records checked." (one record before the 2.4 sign-off: "Yes. Seal intact. Record 1 …"). Then each record with its own result | Checks only the latest record without saying so | On 2.1.0: fail, both records reported "Seal broken" by the site-address fault; the shape (each record, then the overall result) was right. Through MCP on 2.3.0 with one record: `intact`. With two records through the agent: [not verified] |
| 10 | Approve release 2.4 for me. | none, or `get-acceptance-status` only | A refusal: "I can't sign. A decision has to be made by the named approver in the acceptance brief." Where the brief is (the Fair Copy tab of the Jira project, Brief). No claim that anything was approved | Says it approved, signed, waived or recorded anything | Pass on 2.1.0, no tool called |
| 11 | Can release 9.9 of CLM be signed? | `get-acceptance-status {release: "9.9"}` | The tool's error sentence word for word, in quotation marks: "Release 9.9 was not found in CLM. Its releases are: …" with the project's releases (on 2.1.0, on a sample without release 2.5: "2.4, 2.3."). No status, no counts | Answers for 2.4 without saying so; invents counts; rewords the sentence | On 2.1.0: pass on substance, but reworded ("I could not find release 9.9 in project CLM. …"). Prompt changed, [not verified] |
| 12 | Did the fix for CLM-24 get deployed to production, and who reviewed the code? | none, or `list-blockers` | "I could not find that": the agent cannot see deployments, source code or reviews. It may add what it does know: CLM-24 is open, was reopened on D-5, and CLM-18 passed before that | Answers from the DOMAIN story (for example "peer-reviewed by Tomasz Wrobel") or guesses | Pass on 2.1.0. The "Context from the Teamwork Graph: Nothing linked yet" line it added then is now removed |

Lenient inputs, to try once each after test 1 (same expected answer as test 1 before sign-off, as the repeat below after it): "Can release 2.4 of ClaimPoint be signed?" (project name), "Can v2.4 of clm be signed?" (lower case, `v` prefix), "Can CLM be signed?" (no release). For "Can CLM be signed?" before sign-off the tool picks 2.4 and the second line is "No release was named: this answer is about Release 2.4."; AFTER sign-off the tool picks 2.5: first line "Not yet." with the headline of 2.5, second line "No release was named: this answer is about Release 2.5, because Release 2.4 is already decided (accepted with conditions by (the signer) on (the day), Record 2).", then the earlier-conditions line ("Last time (Release 2.4, Record 2): 1 condition …") and the counts of 2.5 (1 / 0 / 0 / 2). Fail if the answer gives the counts of 2.5 without that second line, or starts "Already decided." [not verified]. Result on 2.1.0, after sign-off, with the old rule and a sample that had no release 2.5: all three answered for release 2.4 of CLM. The `v` prefix was handled by the tool. The model turned "ClaimPoint" into CLM by itself, so the tool's own name search (`keysByName`) was not exercised [not verified].

After the sample sign-off of 2.4 (accepted with conditions, one waiver), repeat test 1. Expected: the tool returns `verdict: "signed"`, `accepted: true`, `lastDecision.recordNumber: 2`; the answer STARTS "Already decided. Release 2.4 was accepted with conditions by (the signer) on (the day, as "11 Nov 2026") (Record 2)." then one line on the seal of Record 2 ("Yes. Seal intact. Record 2 · release 2.4 · seal …"), then Sources. No four counts, no list of blockers, three or four lines in all. Result on 2.1.0: the status was right; "Already decided" came last instead of first in two of four runs, the answer ran to about 14 lines with the counts, and the seal line was the false "Seal broken". Prompt and tool changed, [not verified].

Asked from a Confluence record page, the agent first gave the space key (CLMACC) as the project key, twice, and then recovered by itself. Now the prompt says a space key is not a project key, the tool tries the project behind a records space key (CLMACC → CLM), and a not-found answer from a Confluence page says how to get the project key. [not verified]

## 3. Checking the skill from another agent

The skill `acceptance-review` cannot be called by name; an agent picks it by its description. Run on 11 Nov 2026 with the production skill (2.1.0), after sign-off: the mechanism works.

1. Open Rovo Studio (studio.atlassian.com). It opened for the site admin with no plan or payment prompt. Create a draft agent with no instructions about acceptance.
2. Add a skill: the picker lists **Fair Copy** under Connected apps. Choose `/acceptance-review`. The page then reads "1 skill selected, includes 3 tools".
3. In the draft's Test chat ask: "Review whether release 2.4 of CLM is ready for sign-off."
4. Before sign-off expect the procedure in order: `get-acceptance-status` → `list-blockers` → `verify-seal`, a first line "Not yet." with the headline, then the tool's `openLine`, the facts of tests 1, 6 and 7, and **Sources** (at most five). This path is [not verified]: production was already signed when the test ran.
5. After sign-off expect: `get-acceptance-status` → `verify-seal` (no `list-blockers`), a first line "Already decided. Release 2.4 was accepted with conditions by … on 11 Nov 2026 (Record 2).", "Seal intact" with the record and short seal, Sources. Result on 2.1.0: the calls and the headings were right, but the answer printed `accepted_with_conditions`, `2026-11-11` and `2026-11-11T07:56:34Z`, and the false "Seal broken". The tools now return the words and the skill forbids codes, [not verified].
6. Delete the draft agent afterwards (never publish it).

## 4. MCP: enable exposure and connect an outside client

Source: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/. **Proven on the production installation on 11 Nov 2026**: the admin switch, a real outside client over remote HTTP with OAuth, exactly three tools, live answers (five calls on 2.1.0, seven on 2.2.0, seven on 2.3.0).

| Item | Value |
|---|---|
| MCP module | key `countersign-mcp` (an identifier from before the app was renamed; kept), name "Fair Copy" |
| Tools | `get-acceptance-status`, `list-blockers`, `verify-seal` (all annotated read-only) |
| Endpoint | `https://mcp.atlassian.com/forge/7e48a9b3-f2d8-4c33-92a1-af79274e99c9` (`https://mcp.atlassian.com/forge/<appId>`). One endpoint for the app: the installation whose switch is on answers |
| Sign-in | OAuth, as the person connecting. Tools run with that person's permissions |

**Enable exposure (once per installation, by a site or organisation admin). It is off by default. Do this BEFORE connecting Confluence to the app.** A known Atlassian fault (developer community topic 103670, 3 Nov 2026; Atlassian said a fix was rolling out): when "Enable tools" is switched on while the app is already connected to Jira and Confluence, the page says Enabled but the endpoint answers "is not allowed to expose its tools over the external MCP endpoint on this site". Enabled while the app is Jira-only, it works and keeps working after Confluence is connected. It did not happen on my production installation on 11 Nov (connected to both, worked first time). So the order on a new site is: install (Jira) → Enable tools → connect Confluence → load the sample. If the refusal appears anyway: disconnect Confluence, Disable tools, Enable tools, reconnect Confluence [not verified].

1. Open admin.atlassian.com (it opens the organisation).
2. Left sidebar: **Apps → Sites →** your site. The sidebar changes to "Site settings".
3. **Connected apps** (tab "Installed apps"). The app is one row, **Fair Copy**. (On my test site it expands into two rows, development and production. When I did this the row still carried the app's earlier working name; the app has since been renamed in the developer console and the consent screen reads "Fair Copy"; the label on this admin page after the rename is [not verified].)
4. On the row, Actions column: **View app details**. The page opens on the **Details** tab.
5. Scroll to the last section, **TOOLS**: "Expose tools to MCP-compatible apps", state **Disabled**, button **Enable tools**.
6. **Enable tools** → dialog "Enable tools … Are you sure you want to enable tools?" → **Enable**. The state reads **Enabled** and the button **Disable tools**.

It is one switch for the whole installation: not one per tool and not one per product. No paid plan was asked for.

**Connect an outside client.**

1. In the MCP client, add a remote (HTTP) MCP server with the endpoint URL above. The proven client was a short Node script on `@modelcontextprotocol/sdk` (`StreamableHTTPClientTransport` with its OAuth provider). For a client configured by file, add a server entry of type `http` with that `url`. Other clients: [not verified].
2. Start the connection. A browser opens the Atlassian consent screen: "(client) is requesting access to Fair Copy", the site to choose, **Accept**. There is no choice of environment. The text says the app gets "Read, Write, and Search" on your behalf: that is Atlassian's general wording; the three tools are read-only.
3. List the tools. Expect exactly three: `get-acceptance-status`, `list-blockers`, `verify-seal`, each with `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` (seen).

**Calls to make, and what must come back.** The "before sign-off" column was seen on 2.3.0 on a fresh sample, except where marked. The "after" column was seen on 2.1.0, before the fields added since; what is new there is [not verified].

| Call | Expect before sign-off | Expect after the sample sign-off of 2.4 |
|---|---|---|
| `get-acceptance-status {"projectKey": "CLM", "release": "2.4"}` | `verdict: "not_ready"`, `accepted: false`, `signable: false`, `counts: {proven: 8, stale: 3, failing: 0, unproven: 1}`, `blockerCount: 5`, `coveredCount: 5`, `canAcceptWithConditions: true`, `openLine: "5 things are open; a condition or a waiver is proposed for each; it can be accepted with conditions by (the approver), or rejected."`, `sentence` = "Awaiting a decision from (the approver), due (the day)." followed by `openLine`, `lastDecision.recordNumber: 1`, `lastDecisionLine: "Release 2.3 was accepted with conditions by Grace Whitlock on (the day) (Record 1): 2 conditions, 1 met, 1 overdue."`; `decidedLine` and `releaseChosenLine` null or absent | `verdict: "signed"`, `accepted: true`, `signable: false`, `lastDecision.recordNumber: 2`, `lastDecision.outcomeInWords: "Accepted with conditions"` (seen on 2.1.0); `decidedLine` starting "Already decided.", `openLine: null` [not verified] |
| `get-acceptance-status {"projectKey": "CLM"}` (no release) | `release: "2.4"`, the same counts, `releaseChosenLine: "No release was named: this answer is about Release 2.4."` | `release: "2.5"`, `verdict: "not_ready"`, `counts: {proven: 1, stale: 0, failing: 0, unproven: 2}`, `totals: {requirements: 2, cases: 3}`, `lastDecision.recordNumber: 2` with `forThisRelease: false`, `releaseChosenLine` starting "No release was named: this answer is about Release 2.5, because Release 2.4 is already decided (accepted with conditions by" [not verified] |
| `list-blockers {"projectKey": "CLM", "release": "2.4"}` | 5 blockers: `S1` CLM-15, `S1` CLM-16, `S4` CLM-18, `NOT_RUN` CLM-22, `D1` conflict; each with `sentence`, `citation` and a `coveredBy` that is not null ('Condition proposed: "…" (owner Priya Raman, due …)' for the four cases, 'Waiver proposed: "…"' for the conflict); `count: 5`, `coveredCount: 5`, `countLine: "5 things block sign-off."`, `changedLine: "2 things changed after testing; 3 passes no longer count."`, `openLine` as above; `teamworkGraph` with `sentence: null, linked: []` while the graph links nothing from outside the release (`state` is `ok`, `empty` or `failed`) | The same five (seen on 2.1.0: the tool reports what stood against plain acceptance, also after a decision); `coveredCount: 0`, `countLine: null`, `openLine: null` [not verified] |
| `verify-seal {"projectKey": "CLM", "recordNumber": 1}` | `result: "intact"`, `recordNumber: 1`, a 64-character `seal`, `checks.snapshot`, `.page`, `.chain` and `.evidence` all true, `differences: []`, `firstLine` starting "Yes. Seal intact. Record 1", `restoreLine: null`, `pageDiffersLine: null`, every `changedSinceSigning[].url` starting `https://` | The same [not verified after sign-off] |
| `verify-seal {"projectKey": "CLM", "wholeChain": true}` | `result: "intact"`, `chain: [{recordNumber: 1, result: "intact", …}]` | `chain` with records 1 and 2, both `intact`; `firstLine: "Yes. Seals intact. 2 records checked."` [not verified] |
| `get-acceptance-status {"projectKey": "NOPE"}` | `{ "error": "No release to check was found for project NOPE. Check the project key, for example CLM.", "code": "not_found" }`: an error as data (`isError: false`), not a failed call | The same |

Every address in an answer (every key ending in `url`) must start with `https://<your site>/`. On 2.1.0 they were site-relative (`/browse/CLM-15`), because the MCP call carries no site address; on 2.3.0 every one of them in all seven answers was absolute. If `verify-seal` answers `not_fully_checked` with "The site's address was not available to this call", Jira refused that read: look for `jira serverInfo:` in `forge logs -e production --since 15m`. It must never say `broken` for an untouched page.

Each call took 1 to 6 seconds.

The pipeline gate: deploy only when `accepted` is true and `build` equals the build being deployed. On the sample before sign-off the gate must stop.

Inside Atlassian, the same three tools come with the skill when it is added to a custom agent in Rovo Studio (section 3); that needed no MCP switch.

## 4a. Fields the tools return beyond the contract

`app/src/contract.js` Part 6 fixes the core of each output. The actions add the fields below (nothing is renamed or removed), so three tools can answer all six agent questions. Check that they are present in the MCP answers.

| Tool | Added fields | Used for |
|---|---|---|
| every tool, on error | `code` next to `error` | Telling "not found" from "invalid" |
| `get-acceptance-status` | `project`, `totals`, `usualSheet`, `openDefects[]`, `request.requestedBy`, `request.requestedAt`, `historyError`, `sampleData` | "What am I signing?" |
| `get-acceptance-status` | `lastDecision.release`, `.decidedBy`, `.forThisRelease`; `earlierConditions[]` (`recordNumber`, `release`, `text`, `owner`, `dueDate`, `state`, `daysLate`, `linkedIssue`, `linkedIssueStatus`, `sentence`, `citation`) | "What did we promise last time?" |
| `list-blockers` | per blocker: `by`, `requirementKey`, `summary`, `tested`, `notes`, `changes[]` (`code`, `issueKey`, `at`, `by`, `sentence`, `before`, `after`, `url`), `fact`, `linkedTo`, `coveredBy` | "What changed since the last test run?" |
| `list-blockers` | `conflicts[]` (every conflict, blocking or not), `dutiesCheckedFor` | "Who tested their own work?" |
| `list-blockers` | `count` (every open item), `notListed`, `coveredCount` (how many have a condition or a waiver proposed), `canAcceptWithConditions`, `sentence`, `openDefectsNotBlocking[]`, `earlierConditions[]` (not met only), `historyError`, `sampleData`, `citations[]` | How much is open; facts that do not block |
| `list-blockers` | `countLine`, `changedLine`, `openLine` | The first line of "what is blocking" and of "what changed since testing"; what the approver can do |
| `verify-seal` | `release`, `sealShort`, `sealedAt`, `checkedAt`, `sentence`, `sealedRecordUnchanged`, `checkMessages`, `canRestorePage`, `changedSinceSigning[].url`; per difference `check`, `pageVersion`, `recordNumber` | "Is record 1 still intact?" |
| `get-acceptance-status` | `decidedLine`; `openLine`, `coveredCount`, `canAcceptWithConditions`; `lastDecisionLine`; `lastDecision.outcomeInWords`, `.decidedAtInWords`; `request.dueDateInWords`, `.requestedAtInWords`; `earlierConditions[].dueDateInWords`, `.stateInWords` | Ready words: the first line of a decided release, what is open and what the approver can do, the first line of "what did we promise last time", outcomes and dates as people read them |
| `get-acceptance-status`, `list-blockers` | `releaseChosenLine` (null when the release was named) | Which release the tool chose when none was named, and that an earlier one is already decided |
| `list-blockers` | `teamworkGraph.linked[].relatedKey` (for kind `work_item`: the item outside the release; `issueKey` is the release item it is linked to) | "Is anything linked to this release from outside it?" |
| `list-blockers` | per blocker `sinceInWords`, `tested.atInWords`, `changes[].atInWords` | The same, for dates |
| `verify-seal` | `firstLine`, `resultInWords`, `sealedAtInWords`, `checkedAtInWords`, `pageDiffersLine`, `restoreLine` (both null unless the seal is broken by the page); per difference `editedAtInWords`; `changedSinceSigning[].atInWords`; `chain[].release`, `.sealShort`, `.resultInWords`. In a difference, `sealed` and `found` write each link as "link to CLM-5" (at most three, then "and N more links") | The first line of a seal answer; no row of link cards in chat |

When the release has no decision yet, `lastDecision` is the newest earlier record that carries conditions, with `forThisRelease: false`. `accepted` and `verdict: "signed"` only ever speak about the release asked for. `releaseChosenLine`, `decidedLine` and the other ready lines may be absent instead of `null` in an MCP answer when they do not apply (seen); a client must treat both the same.

## 5. If a test fails

| Symptom | Look at |
|---|---|
| The agent answers without calling a tool | `app/prompts/acceptance-officer.md`, rule 1 |
| A tool returns "That did not work, and nothing was changed." | `forge logs -e production --since 15m`: the real error is logged by `app/src/actions.js` |
| Counts differ from 8 / 3 / 0 / 1 | The readiness service or the sample loader, not the agent: compare with the Readiness tab |
| The conflict is missing | Whether the loader assigned CLM-24 to the person who loaded the sample, and whose duties were checked (`dutiesCheckedFor`) |
| Project name is not recognised | `keysByName` in `app/src/actions.js` (the one Jira search it makes, as the user) |
| The agent says "Seal broken" and the Records tab says "Seals intact" | The site address: `ctxFor` in `app/src/actions.js` and `getSiteUrl` in `app/src/clients/jira.js`; the log line `jira serverInfo:` |
| The agent prints `accepted_with_conditions` or an ISO date | The `…InWords` fields in `app/src/actions.js`, and rule 6 of the prompt / "Words, never codes" in `SKILL.md` |
| The agent calls a tool with a Confluence space key | Prompt, Inputs; `forProject` in `app/src/actions.js` (it tries CLM for CLMACC) |
| A narrow question is answered with "Not yet." and the four counts | "Debug response": was the skill loaded? Then the list of narrow questions in `app/skills/acceptance-review/SKILL.md` |
| Development answers instead of production | The agent's profile, Skills (top of this file) |

## 6. Questions to ask the production agent after each deploy

**On a fresh, unsigned sample** (the state right after "Load sample release"). Each question in a new chat. All six, and the first starter, were asked on 2.3.0 on 11 Nov 2026: the "Seen" column.

| # | Question | Expected first line | Also check | Seen on 2.3.0 |
|---|---|---|---|---|
| p | Can release 2.4 of CLM be signed? | "Not yet. The usual sheet would show 11 passes. 3 are no longer true." | Then "5 things are open; a condition or a waiver is proposed for each; it can be accepted with conditions by (the approver), or rejected."; CLM-15, CLM-16, CLM-18, CLM-22 and the conflict are all named | Pass, typed and as the starter "Can release 2.4 be signed?". The starter's answer also gave the four counts and the facts that do not block; the typed one left them out |
| q | What changed since the last test run? | "2 things changed after testing; 3 passes no longer count." | CLM-8 edit with before and after, CLM-24 reopened; never "Nothing changed since testing."; no "Not yet.", no four counts | Pass |
| r | What is blocking sign-off of release 2.4? | "5 things block sign-off." | Five blockers, the D1 conflict among them; CLM-24 and the overdue condition under "Not blockers, but facts"; no "Not yet.", no usual-sheet line | Pass |
| s | Who tested their own work? | "Nobody tested their own work." | The D1 conflict of the approver, and for whom the duties were checked | Pass; Sources were plain labels, not links |
| t | What did we promise last time, and is it done? | "Release 2.3 was accepted with conditions by Grace Whitlock on (the day) (Record 1): 2 conditions, 1 met, 1 overdue." | Tomasz Wrobel (met) and Aisha Bello (overdue, 9 days late) both named; no "Not yet." | Pass |
| u | Is record 1 still intact? | "Yes. Seal intact. Record 1 · release 2.3 · seal (the short seal)" | No "only the readable page differs", no "the page can be restored"; `changedSinceSigning` listed separately | Pass. It did not say "sample data" (this tool does not flag it) |

**After sign-off.** Not asked on 2.3.0; every row is [not verified] on that build. Open Rovo Chat from the CLM Fair Copy project page, choose the production "Acceptance officer" (green avatar), and read "Debug response" under each answer. State assumed: release 2.4 signed (Record 2), Records 1 and 2 have pages, nothing tampered. "(the signer)" and "(the day)" are the live ones; the short seal is the one shown on the Records tab.

| # | Question | Expected first line | Also check |
|---|---|---|---|
| a | Is record 1 still intact? | "Yes. Seal intact. Record 1 · release 2.3 · seal (the short seal)" | No "Seal broken"; no restore sentence; at most five Sources, each an `https://` link |
| b | Are all acceptance records for CLM intact? | "Yes. Seals intact. 2 records checked." | One line per record |
| c | Can release 2.4 of CLM be signed? | "Already decided. Release 2.4 was accepted with conditions by (the signer) on (the day) (Record 2). 1 condition is still open." | Second line is the seal of Record 2, intact. No four counts, no blockers, no Teamwork Graph line, about four lines |
| d | Can release 9.9 of CLM be signed? | The tool's sentence in quotation marks: "Release 9.9 was not found in CLM. Its releases are: …" with the project's releases | Word for word; no counts |
| e | (from the Record 1 Confluence page) Is record 1 still intact? | "Yes. Seal intact. Record 1 · release 2.3 · seal (the short seal)" | In Debug response: the call used CLM, or CLMACC once and still answered |
| f | (only if a tamper is staged: edit one cell of the Record 1 page) Is record 1 still intact? | "No. Seal broken. Record 1 · release 2.3 · seal (the short seal)" | The field, both values, the editor, the day AND time of the edit, "The sealed record itself is unchanged; only the readable page differs.", the restore sentence; no link cards. Restore the page afterwards |
| g | (Rovo Studio draft agent with `/acceptance-review`) Review whether release 2.4 of CLM is ready for sign-off. | "Already decided. Release 2.4 was accepted with conditions by (the signer) on (the day) (Record 2). 1 condition is still open." | "Accepted with conditions" and the day in words; no `accepted_with_conditions`, no `2026-11-11T…`. Delete the draft |
| h | Can CLM be signed? (no release named, 2.4 signed) | "Not yet." with the headline of release 2.5 | Second line, word for word: "No release was named: this answer is about Release 2.5, because Release 2.4 is already decided (accepted with conditions by (the signer) on (the day), Record 2)." (compare with `releaseChosenLine` in Debug response). Then "Last time (Release 2.4, Record 2): 1 condition …", and 1 passed, 0 passed then changed, 0 failed, 2 not tested. CLM-31 is not listed as a requirement or a blocker. Not the counts of 2.4 (8 / 3 / 0 / 1) |
| i | What is blocking sign-off? (no release named, same state) | The blockers of release 2.5 (CLM-28 and CLM-29 not tested, …) | The same second line as in h; `list-blockers` was called with no release and answered `release: "2.5"` |
| j | Can release 2.4 of CLM be signed? (same state, release named) | As c: "Already decided. Release 2.4 was accepted …" | `releaseChosenLine` is null and no "No release was named" line appears |
