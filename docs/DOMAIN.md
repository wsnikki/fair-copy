# Fair Copy — the rules it is built on, and the sample

Purpose: make the "potential impact" case specific and credible, and give the sample loader and the demo video one fictional dataset.
Rules followed: public sources only; every claim has a URL or is marked **[not verified]**; nothing from any employer or client.

Source status used below:
- **[opened]** = I opened the page or PDF on 10 Nov 2026 and read the quoted words there.
- **[paid]** = the standard's text is sold, not public. Clause numbers and titles are given from general knowledge; the wording is a paraphrase and is **[not verified]** against the paid text. Do not quote these as exact.

---

## 1. What regulators and standards actually require

Read this table as "what an approver, tester and auditor are held to", not as a list of things Fair Copy makes you compliant with (see section 5).

### 1a. Text I opened and can quote

| Framework | Clause, in a sentence | What an auditor or inspector asks to see | Fair Copy feature it maps to | Source |
|---|---|---|---|---|
| **FDA 21 CFR Part 11** (US, electronic records and signatures) | §11.10(a): "Validation of systems to ensure accuracy, reliability, consistent intended performance, and the ability to discern invalid or altered records." | Validation records; proof an altered record can be detected | Sealed record, Verify seal | [opened] https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11 |
| | §11.10(e): "secure, computer-generated, time-stamped audit trails ... Record changes shall not obscure previously recorded information." | The audit trail itself, with who/when for every create, modify, delete | Evidence table built from Jira history; seal chain | same |
| | §11.10(g): "authority checks to ensure that only authorized individuals can ... electronically sign a record" | List of who may sign, and proof others could not | Approver role check before signing | same |
| | §11.50(a): a signed record shows the signer's printed name, the date and time, and the meaning of the signature (review, approval, responsibility, authorship). | A signed record showing all three | Sign-off block on the acceptance record | same |
| | §11.70: signatures "shall be linked to their respective electronic records to ensure that the signatures cannot be excised, copied, or otherwise transferred" | Demonstration that a signature cannot be moved to another record | Signature is inside the hashed snapshot | same |
| **FDA guidance, Part 11 Scope and Application** (2003) | FDA interprets Part 11 "narrowly" and uses enforcement discretion on validation and audit-trail clauses, but "part 11 remains in effect". | n/a — context for why I must not over-claim | Vocabulary (section 5) | [opened] https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application |
| **FDA, General Principles of Software Validation** (2002) | "User site testing" covers "beta test, site validation, user acceptance test, installation verification"; it "should take place at a user's site with the actual hardware and software". | Test plan, results, and evidence the testing was done by users in the real setting | Acceptance cases with run + evidence | [opened] https://www.fda.gov/media/73141/download |
| **EU GMP Annex 11** (computerised systems) | 4.2: "Validation documentation should include change control records (if applicable) and reports on any deviations observed during the validation process." | Change records and deviation reports attached to the validation pack | Brief lists changes after test and open deviations | [opened] https://health.ec.europa.eu/system/files/2016-11/annex11_01-2011_en_0.pdf |
| | 4.4: "User requirements should be traceable throughout the life-cycle." | Traceability matrix: requirement → test → result | Requirement → case → run → defect chain | same |
| | 4.7: "Evidence of appropriate test methods and test scenarios should be demonstrated." | Test scenarios and their evidence | Evidence column per case | same |
| | 9: a system-generated audit trail of changes; "For change or deletion of GMP-relevant data the reason should be documented." | Audit trail, with reasons | Waiver and condition records carry a reason | same |
| | 10: changes "should only be made in a controlled manner in accordance with a defined procedure." | The change procedure and one worked example | The sign-off flow itself | same |
| | 14: e-signatures should "be permanently linked to their respective record" and "include the time and date that they were applied." | A signed record | Sealed record | same |
| **NIST SP 800-53 Rev. 5** (US federal baseline, used by FISMA and FedRAMP) | **CM-3**: review proposed changes and "approve or disapprove such changes"; "Document configuration change decisions"; "Retain records of configuration-controlled changes". | Change requests with approval, decision and retention | Decision memory; sealed record | [opened] https://csf.tools/reference/nist-sp-800-53/r5/cm/cm-3 (text of the NIST catalogue; original PDF: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf) |
| | **CM-3(2)**: "Test, validate, and document changes to the system before finalizing the implementation of the changes." | Test results dated before go-live, for this change | Stale-evidence check (was the pass before or after the last change?) | [opened] same |
| | **CM-5**: "Define, document, approve, and enforce physical and logical access restrictions associated with changes to the system." | Who can change, who can approve | Approver role check | [opened] NIST PDF above |
| | **AC-5**: "Identify and document [organization-defined duties of individuals requiring separation]; and Define system access authorizations to support separation of duties." | The list of incompatible duties, and proof they were held by different people | Separation of duties computed from who did what | [opened] NIST PDF above |
| | **SA-11**: require the developer to "Produce evidence of the execution of the assessment plan and the results of the testing and evaluation". **SA-11(3)**: "Require an independent agent ... to verify ... the evidence produced during testing". | Test evidence; proof the verifier was independent | Evidence table; independence check | [opened] https://csf.tools/reference/nist-sp-800-53/r5/sa/sa-11 |
| | **CA-6**: a senior "authorizing official ... before commencing operations ... Authorizes the system to operate". | A named senior official's signed authorisation, dated before go-live | Named approver sign-off | [opened] https://csf.tools/reference/nist-sp-800-53/r5/ca/ca-6 |
| **PCI DSS v4.0.1** (payment card data) | **6.5.1**: production changes follow procedures that include reason and description, "Documented change approval by authorized parties", and testing. | For a sample of changes: description, approval, test evidence | Acceptance record per release | [opened, as reproduced by a vendor responsibility matrix] https://help.mypurecloud.com/wp-content/uploads/2025/02/pci-dss-requirements-v4.0.1.pdf — official copy needs a click-through licence: https://www.pcisecuritystandards.org/document_library/ |
| | **6.5.4**: "Roles and functions are separated between production and pre-production environments to provide accountability such that only reviewed and approved changes are deployed." | Role lists; proof the deployer was not the sole reviewer | Separation of duties | same |
| | **6.2.3.1**: manual code reviews are done "by individuals other than the originating code author" and "approved by management prior to release". | Review record naming a different person | Same idea, applied to acceptance | same |
| **PCAOB AS 2201** (the audit standard behind SOX section 404 work) | .B29: an auditor may rely on an automated control without re-testing only "If general controls over program changes, access to programs, and computer operations are effective". | Evidence that program-change controls worked all year: tested, approved, by separate people | The acceptance record is that evidence, per release | [opened] https://pcaobus.org/oversight/standards/auditing-standards/details/AS2201 |
| **GAO FISCAM** (how US federal IT controls are audited; 2024 revision replaces 2009) | Five general-control categories include configuration management and segregation of duties. GAO's definition: segregation of duties are "the policies, practices, and organizational structure that prevent an individual from controlling all critical stages of a process". | Per FISCAM: policies, plus evidence the split held in practice | Separation of duties | [opened] https://www.gao.gov/products/gao-24-107026 and definitions in https://www.gao.gov/assets/690/688585.pdf |
| **UK GovS 005 Digital** (functional standard; current version dated 1 Oct 2026) | The service owner is accountable for "ensuring necessary approval processes are followed, and risks and issues are mitigated". Assurance "should be on at least three separate and defined levels", one of them "independent of operational management". Configuration management keeps assets "subject to two-way traceability" (requirement ↔ solution element). | Named service owner; approval trail; assurance independent of the delivery team; traceability | Named approver, independence check, traceability chain | [opened] https://www.gov.uk/government/publications/government-functional-standard-govs-005-digital/government-functional-standard-govs-005-digital-html |
| **UK Service Standard** (14 points) | No point says "do UAT and get sign-off". Point 14 is "Operate a reliable service"; the Service Manual says "test your service regularly as part of quality assurance". | Service assessments ask how the team tests and releases. | Honest position: the UK standard sets the expectation, not the form | [opened] https://www.gov.uk/service-manual/service-standard and https://www.gov.uk/service-manual/technology/quality-assurance-testing-your-service-regularly |
| **ITIL 4 Change enablement** | Purpose: "to maximize the number of successful service and product changes by properly assessing risks, authorizing changes to proceed, and managing the change schedule". | Change record with risk assessment and the authority who approved | Sign-off decision with named authority | [opened, as quoted by AWS from the paid practice guide] https://docs.aws.amazon.com/wellarchitected/latest/change-enablement-in-the-cloud/change-enablement-in-itil4.html |

### 1b. Paid standards — clause numbers only, wording not verified

| Framework | Clause (paraphrase, **[not verified]** against paid text) | Typical audit evidence **[not verified — general practice]** | Link |
|---|---|---|---|
| **ISPE GAMP 5, 2nd ed.** (computerised system validation in pharma) | Risk-based life cycle: requirements, specification, verification (testing), then formal acceptance and release by the process owner with quality-unit involvement. ISPE's own public summary: systems should be "fit for intended use, and compliant with applicable regulations" and the guide stresses "critical thinking". | Validation plan, traceability matrix, executed test scripts with evidence, deviation log, validation summary report with approval signatures | [opened, summary page only] https://ispe.org/publications/guidance-documents/gamp-5-guide-2nd-edition |
| **ISO/IEC 27001:2022 Annex A** | A.5.3 Segregation of duties: conflicting duties are separated. A.8.29 Security testing in development and acceptance. A.8.31 Separation of development, test and production environments. A.8.32 Change management: changes follow change-management procedures. | Change procedure, a sample of change tickets with test and approval, role matrix | [opened, summary page only; standard is paid] https://www.iso.org/standard/27001 |
| **COBIT 2019** | BAI06 Managed IT Changes; BAI07 Managed IT Change Acceptance and Transitioning; BAI07.05 Perform acceptance tests (a third-party summary says changes are "tested independently, following the defined test plan"). | Acceptance test plan and results, business sign-off, post-implementation review | [opened, overview only] https://www.isaca.org/resources/cobit ; BAI07.05 summary seen only as a search result, not opened: https://compliance.theartofservice.com/controls/cobit-2019/bai07-05 |
| **SOX section 404 / IT general controls** | The statute requires management to assess internal control over financial reporting; "ITGC: change management and segregation of duties" is audit practice built on it, not statute wording. | Population of changes for the year; for a sample: request, test evidence, approval before deployment, developer ≠ deployer | Statute text **[not verified — not opened]**; the audit standard is AS 2201 in table 1a |
| **FedRAMP / FISMA authorization** | A cloud service needs an independent assessment and an authorizing official's Authority to Operate; controls come from NIST SP 800-53 (CA-6, CM-3, SA-11 above). | Security assessment report by an independent assessor; signed ATO letter; significant-change records | FedRAMP pages did not return readable text **[not verified]**: https://www.fedramp.gov/docs/rev5/playbook/agency/authorization/authorization ; the NIST controls are verified in 1a |

### 1c. The pattern across all of them

Five things recur. They are exactly the five things Fair Copy shows on one page:

1. **Traceability** — requirement to test to result (Annex 11 4.4, GovS 005).
2. **Tested before the change went live, and tested against the thing that went live** (CM-3(2), PCI 6.5.1).
3. **A named, authorised person approved** (CA-6, Part 11 §11.10(g), PCI 6.5.1, ITIL).
4. **That person was independent of the work** (AC-5, SA-11(3), PCI 6.5.4, GovS 005 assurance levels).
5. **The record cannot be quietly altered afterwards** (Part 11 §11.10(e), §11.70, Annex 11 9 and 14).

None of the opened texts tells a team *how* to check item 2 or 4. That gap is the product.

---

## 2. Evidence of the pain

### 2a. Published findings and incidents

| Case | What went wrong (source's words where quoted) | Numbers | Source |
|---|---|---|---|
| **US medical device recalls**, FDA analysis | Defects "introduced when changes were made to the software after its initial production and distribution". | 3,140 recalls 1992–1998; 242 (7.7%) due to software; **192 of those (79%)** from changes after first release | [opened] https://www.fda.gov/media/73141/download (section 2.4) |
| **US federal agencies**, GAO-17-549 | "Most of the 24 ... agencies had weaknesses in five control areas—access controls, configuration management controls, segregation of duties ...". One example: a person performed an activity "at the same time that the person reviewed that activity". | FY2016: segregation-of-duties weaknesses at **22 of 24** agencies (49 weaknesses); configuration management at **23 of 24** | [opened] https://www.gao.gov/assets/690/688585.pdf ; summary https://www.gao.gov/products/gao-17-549 |
| **Canada, Phoenix pay system** (public sector), Auditor General 2018, as quoted by the House of Commons Public Accounts Committee | The department "could not show that the Phoenix functions ... were fully tested before implementation". Of the functions that failed, "The Department did not retest the functions that failed the original testing." Executives "cancelled the pilot ... They decided that rather than delaying Phoenix, there would be no pilot." Departments were not given "a chance to review or approve the functions". | 984 functions needed; auditors reviewed 111; 30 were missing at go-live; of the other 81, **20% did not pass testing** and were not retested | [opened] https://www.ourcommons.ca/DocumentViewer/en/42-1/PACP/report-53/page-18 ; Auditor General's report (PDF did not download here, **[not verified directly]**): https://publications.gc.ca/collections/collection_2018/bvg-oag/FA1-27-2018-1-1-eng.pdf |
| **Knight Capital**, SEC order 2013 | A technician "did not copy the new code to one of the eight ... servers. Knight did not have a second technician review this deployment ... Knight had no written procedures that required such a review." | "lost over **$460 million**" in "approximately forty-five minutes"; $12 million penalty | [opened] https://www.sec.gov/litigation/admin/2013/34-70694.pdf ; https://www.sec.gov/news/press-release/2013-222 |
| **TSB Bank IT migration**, FCA/PRA 2022 | Regulators found TSB "failed to organise and control the IT migration programme adequately". TSB's own statement shows what the approvers had in front of them: the board's go-live decision rested on "attestations from the Executive and written and oral assurances from third party suppliers"; "Despite extensive testing, this configuration issue was not identified prior to migration." | Fine **£48.65m**; "a significant proportion of its 5.2 million customers" affected; £32.7m redress | [opened] https://www.fca.org.uk/news/press-releases/tsb-fined-48m-operational-resilience-failings ; https://www.tsb.co.uk/news-releases/slaughter-and-may.html |

How to use these honestly: Phoenix and TSB are the closest to my story (approvers relied on attestations; failed tests were not re-run). Knight is the cleanest "no second person" example. The FDA number is about medical devices in the 1990s; say so when quoting it.

### 2b. Time spent assembling sign-off packs

- **No public figure found for UAT sign-off packs specifically.** I searched for surveys on time to assemble UAT or release sign-off evidence and found none with a method I could check. I do not state a number for this. I describe my own experience only in general terms, with no employer detail.
- Nearest public proxy (compliance evidence in general, vendor survey, so treat as indicative): RegScale's survey of 253 security leaders (Sept–Oct 2025) found "53% assigned the equivalent of one full-time employee to evidence collection" and "83% of organisations experienced moderate or major delays linked to manual compliance work". [opened, press report of the survey] https://securitybrief.co.uk/story/manual-compliance-strain-fuels-automation-push-survey
- A second vendor survey (StrongDM, financial institutions) is reported as "49.3% still spend over 10 hours monthly preparing audit evidence". **[not verified — seen in a search result only, page not opened]** https://www.prnewswire.com/news-releases/88-of-financial-institutions-feel-audit-ready-yet-49-still-struggle-with-privileged-access-and-manual-compliance-new-survey-by-strongdm-finds-302499636.html

---

## 3. The users and their words

Role descriptions and wording here are **[not verified — written from general industry practice, not from a cited source]**. They are consistent with the duties in section 1.

| Role | Their question, in their words | What they need on one page | What they fear |
|---|---|---|---|
| **Test lead** (UAT lead, test manager) | "Are we ready to go to sign-off, and what will the approver ask me?" | Every case with its latest run, who ran it, when, and the evidence link. Cases not run. Passes that no longer count and why. Open defects by severity. A list of what to re-run. | Being asked in the meeting about a change nobody told them about. Rebuilding the pack by hand the night before. |
| **Business owner / approver** (service owner, product owner, head of operations) | "What exactly am I signing, and what could come back on me?" | A two-minute read: what is in the release, what was tested, what changed after testing, what is still open, what I accepted last time and whether it was done. Three choices: accept, accept with conditions, reject. | Signing on someone's verbal "it's all green". Their name on a failure. |
| **QA / compliance officer** (quality assurance, quality unit, internal control) | "Was the process followed, and can I prove it later?" | Independence check: who built, who tested, who approves. Any waiver with a named authoriser and a reason. Deviations from the plan. The sealed record and its verification status. | A conflicted approver found by the auditor, not by them. A record that was edited after signing. |
| **Auditor** (internal audit, external audit, inspector) — read-only | "Show me the evidence for this release, as it was on the day it was signed." | The acceptance record as signed, with date, names and meaning of each signature. Proof it has not changed since. The trail from one requirement to its test, result and defect. Conditions and whether they were closed. | Evidence rebuilt after the fact. Screenshots with no date or author. |

Design consequence: one page, four readings. The approver reads the top (decision and exceptions). The test lead reads the middle (cases). Compliance reads the independence panel. The auditor reads the sealed record.

---

## 4. Fictional scenario and full sample dataset

Everything in this section is invented. "Esterhaven" is a made-up place; a web search on 10 Nov 2026 found the name only in a hobby fiction-writing site, no real agency or company. All people are invented.

### 4.1 Setting

- **Organisation:** Esterhaven Social Support Agency (ESSA), the benefits agency of the fictional Province of Esterhaven.
- **System:** ClaimPoint, the online benefits claims portal used by claimants and caseworkers.
- **Jira project:** name `ClaimPoint`, key `CLM`. **Confluence space:** name `ClaimPoint Acceptance`, key `CLMACC`.
- **Release under review:** `2.4`, planned go-live Mon 14 Dec 2026. Previous release `2.3` went live Mon 21 Sep 2026. **Next release:** `2.5`, planned go-live Mon 25 Jan 2027, not yet asked for sign-off (section 4.7).
- **Day zero (D0)** = sign-off meeting, **Wed 9 Dec 2026**. Every date below also has an offset from D0, so the loader can either use the fixed dates or shift them so D0 = the day the sample is loaded.

### 4.2 People

A judge's clean site has one real user, so these are personas the app must store itself (display name + role), not Jira accounts.

| ID | Name | Role | Duty in release 2.4 |
|---|---|---|---|
| P1 | Priya Raman | Test lead | Wrote the acceptance cases, runs the UAT, prepares the brief |
| P2 | Leo Marchetti | Business analyst | Wrote the requirements; edited CLM-8 after testing |
| P3 | Tomasz Wrobel | Developer | Built CLM-7, CLM-8; fixed CLM-23 |
| P4 | Aisha Bello | Developer | Built CLM-9, CLM-10; owns carried condition CLM-6 |
| P5 | Daniel Okafor | Business tester (claims operations) | Ran cases for CLM-7, CLM-8 |
| P6 | Mei-Ling Chow | Business tester (payments team) | Ran cases for CLM-9, CLM-10 |
| P7 | Grace Whitlock | Head of Claims Operations — **business approver** | Signs for the business. No conflict. |
| P8 | Samuel Ortega | Service Delivery Manager — **technical approver** | Signs for IT. **Also fixed defect CLM-24 → conflict.** |
| P9 | Ingrid Solberg | Quality and compliance officer | Checks independence; may authorise a waiver |
| P10 | Hannah Reyes | Internal auditor | Read-only; verifies the seal |

### 4.3 Issues

Create in this order so a new project gives these keys. "Type": Requirement = Jira Story, Acceptance case = Jira Task with label `acceptance-case`, Defect = Jira Bug, Follow-up = Jira Task (adjust to whatever issue-type model the app design fixes). Statuses use the default To Do / In Progress / Done. The issues of release 2.5 (section 4.7) are created after CLM-24, as CLM-25 to CLM-29, so no key below moves. What the app creates afterwards takes the next keys: the approver's sign-off task is CLM-30, and the Jira issue of the condition signed for 2.4 is CLM-31.

**Release 2.3 (history, already signed)**

| Key | Type | Summary | Fix version | Status | Reporter | Assignee | Created | Links |
|---|---|---|---|---|---|---|---|---|
| CLM-1 | Requirement | Claimant can track the status of a claim online | 2.3 | Done | Leo Marchetti | Tomasz Wrobel | 3 Aug 2026 | — |
| CLM-2 | Requirement | Caseworker can override a weekly award and must give a reason | 2.3 | Done | Leo Marchetti | Aisha Bello | 3 Aug 2026 | — |
| CLM-3 | Acceptance case | Claimant sees the correct status and date for a submitted claim | 2.3 | Done | Priya Raman | Daniel Okafor | 10 Aug 2026 | tests CLM-1 |
| CLM-4 | Acceptance case | Override is refused without a reason and saved with one | 2.3 | Done | Priya Raman | Mei-Ling Chow | 10 Aug 2026 | tests CLM-2 |
| CLM-5 | Defect | Status tracker shows the wrong date format for claims older than 12 months | 2.3 | Done (resolved 9 Oct 2026) | Daniel Okafor | Tomasz Wrobel | 8 Sep 2026 | found by CLM-3; relates to CLM-1 |
| CLM-6 | Follow-up | Override audit report can be exported to CSV for the quarterly audit | none (unscheduled) | **In Progress** | Ingrid Solberg | Aisha Bello | 18 Sep 2026 | relates to CLM-2 |

**Release 2.4 — requirements**

| Key | Type | Summary | Fix version | Status | Reporter | Assignee (built by) | Created (offset) | Last edited |
|---|---|---|---|---|---|---|---|---|
| CLM-7 | Requirement | Claimant can upload supporting documents to an open claim | 2.4 | Done | Leo Marchetti | Tomasz Wrobel | 2 Nov 2026 (D-37) | 16 Nov 2026 (D-23) |
| CLM-8 | Requirement | Caseworker can record a change of circumstances and the weekly award is recalculated | 2.4 | Done | Leo Marchetti | Tomasz Wrobel | 2 Nov 2026 (D-37) | **3 Dec 2026 15:40 (D-6)** by Leo Marchetti — see 4.6 |
| CLM-9 | Requirement | Claimant is notified by email and SMS when the claim status changes | 2.4 | Done | Leo Marchetti | Aisha Bello | 2 Nov 2026 (D-37) | 16 Nov 2026 (D-23) |
| CLM-10 | Requirement | Caseworker can set an overpayment recovery plan capped at 15% of the weekly award | 2.4 | Done | Leo Marchetti | Aisha Bello | 2 Nov 2026 (D-37) | 16 Nov 2026 (D-23) |

Acceptance criteria (issue description text):
- CLM-7: PDF, JPG or PNG up to 10 MB is accepted; anything else is refused with a clear message; the caseworker sees the file within one minute.
- CLM-8 (as tested until 3 Dec): the new award applies **from the date of the change**; a past date creates arrears; an audit note is saved.
- CLM-8 (after the 3 Dec edit): the new award applies **from the Monday following the date of the change**; rest unchanged.
- CLM-9: email and SMS are sent on every status change; a claimant who opted out gets neither.
- CLM-10: the plan cannot exceed 15% of the weekly award; the claimant can see the schedule; a caseworker can pause recovery for hardship.

**Release 2.4 — acceptance cases** (all: type Acceptance case, fix version 2.4, reporter Priya Raman, created 17 Nov 2026 (D-22))

| Key | Summary | Tests | Assignee (tester) | Jira status |
|---|---|---|---|---|
| CLM-11 | Upload a 4 MB PDF to an open claim | CLM-7 | Daniel Okafor | Done |
| CLM-12 | Upload of a 12 MB file or a .exe is refused with a clear message | CLM-7 | Daniel Okafor | Done |
| CLM-13 | Uploaded document appears on the caseworker screen within one minute | CLM-7 | Daniel Okafor | Done |
| CLM-14 | Award is recalculated when household size changes | CLM-8 | Daniel Okafor | Done |
| CLM-15 | A change dated in the past creates the correct arrears payment | CLM-8 | Daniel Okafor | Done |
| CLM-16 | An audit note records who made the change and why | CLM-8 | Daniel Okafor | Done |
| CLM-17 | Email is sent when the claim status changes | CLM-9 | Mei-Ling Chow | Done |
| CLM-18 | SMS is sent when the claim status changes | CLM-9 | Mei-Ling Chow | Done |
| CLM-19 | A claimant who opted out receives no email or SMS | CLM-9 | Mei-Ling Chow | Done |
| CLM-20 | A recovery plan above 15% of the weekly award is refused | CLM-10 | Mei-Ling Chow | Done |
| CLM-21 | Claimant can see the repayment schedule | CLM-10 | Mei-Ling Chow | Done |
| CLM-22 | Caseworker can pause recovery for hardship | CLM-10 | Mei-Ling Chow | **To Do** (not run) |

**Release 2.4 — defects**

| Key | Summary | Priority | Fix version | Reporter | Fixed by (assignee) | Created | Status history | Links |
|---|---|---|---|---|---|---|---|---|
| CLM-23 | Arrears are rounded per week, not per period, so the claimant is underpaid by a few cents | High | 2.4 | Daniel Okafor | Tomasz Wrobel | 26 Nov 2026 (D-13) | To Do → In Progress 27 Nov → Done 30 Nov (D-9); never reopened | found by CLM-15; relates to CLM-8 |
| CLM-24 | SMS is not sent when the phone number has a country prefix or spaces | Medium | 2.4 | Mei-Ling Chow | **Samuel Ortega** | 25 Nov 2026 (D-14) | To Do → In Progress 30 Nov → Done 1 Dec (D-8) → **reopened to In Progress 4 Dec 2026 11:20 (D-5) by Mei-Ling Chow**: "prefix now works; numbers typed with spaces still fail" | found by CLM-18; relates to CLM-9 |

Why Samuel fixed CLM-24: Aisha Bello was on leave 30 Nov–1 Dec and Samuel, a former developer, made the fix himself (comment on the issue, 30 Nov).

### 4.4 Test runs (the app's own records)

Environment for all: UAT. Build `2.4.0-rc1` deployed 23 Nov 2026 (D-16); build `2.4.0-rc2` (fixes for CLM-23 and CLM-24) deployed 1 Dec 2026 (D-8).

No build is set on release 2.4 (SPEC decision 11: a set build would turn the rc1 passes into "passed, then changed"). The app never prints that as a gap. Wherever a build would be named it says what was tested, from the latest run of each case: "Builds tested: 2.4.0-rc1, 2.4.0-rc2" on the brief, on Readiness, on the sealed record and its Confluence page, and in the tools' `buildInWords` ("Build tested: X" for one build; nothing when no case has a run). Only Readiness, beside "Choose a build", adds: "No single build is set for this release; each pass names the build it was tested on." When a build is set the words are "Build X" / "Build being accepted: X". The words are in `app/src/domain/buildWords.js`.

Each evidence file is a short test log (plain text, 12 to 14 lines): a header with the run, case, build, tester and start time, the steps with a `[+mm:ss]` offset, what was expected, for a failed run what happened instead, and the result. Claim references (`ES-2026-…`), test accounts (`UAT-C-…`, `UAT-W-…`) and amounts in them are invented. The words are in `app/src/sample/dataset.js` (`LOGS`, `evidenceLog`).

| Run | Case | Date and time (offset) | Tester | Build | Result | Evidence file | Note |
|---|---|---|---|---|---|---|---|
| R-01 | CLM-11 | 24 Nov 2026 10:05 (D-15) | Daniel Okafor | rc1 | Pass | CLM-11-upload-run.log | — |
| R-02 | CLM-12 | 24 Nov 2026 10:30 (D-15) | Daniel Okafor | rc1 | Pass | CLM-12-refused-upload-run.log | — |
| R-03 | CLM-13 | 24 Nov 2026 11:10 (D-15) | Daniel Okafor | rc1 | Pass | CLM-13-caseworker-view-run.log | Seen after 20 seconds |
| R-04 | CLM-17 | 25 Nov 2026 09:40 (D-14) | Mei-Ling Chow | rc1 | Pass | CLM-17-email-run.log | — |
| R-05 | CLM-18 | 25 Nov 2026 10:15 (D-14) | Mei-Ling Chow | rc1 | **Fail** | CLM-18-sms-run-failed.log | No SMS for +prefix number; raised CLM-24 |
| R-06 | CLM-19 | 25 Nov 2026 11:00 (D-14) | Mei-Ling Chow | rc1 | Pass | CLM-19-opt-out-run.log | — |
| R-07 | CLM-14 | 26 Nov 2026 09:50 (D-13) | Daniel Okafor | rc1 | Pass | CLM-14-recalc-run.log | — |
| R-08 | CLM-15 | 26 Nov 2026 10:40 (D-13) | Daniel Okafor | rc1 | **Fail** | CLM-15-arrears-run-failed.log | Arrears 0.04 short; raised CLM-23 |
| R-09 | CLM-16 | 26 Nov 2026 11:20 (D-13) | Daniel Okafor | rc1 | Pass | CLM-16-audit-note-run.log | — |
| R-10 | CLM-20 | 27 Nov 2026 10:00 (D-12) | Mei-Ling Chow | rc1 | Pass | CLM-20-cap-run.log | — |
| R-11 | CLM-21 | 27 Nov 2026 10:45 (D-12) | Mei-Ling Chow | rc1 | Pass | CLM-21-schedule-run.log | — |
| R-12 | CLM-15 | 2 Dec 2026 14:10 (D-7) | Daniel Okafor | rc2 | Pass | CLM-15-arrears-retest.log | Retest of CLM-23 fix |
| R-13 | CLM-18 | 3 Dec 2026 10:20 (D-6) | Mei-Ling Chow | rc2 | Pass | CLM-18-sms-retest.log | Retest of CLM-24 fix, +prefix number only |
| R-14 | CLM-14 | 4 Dec 2026 09:30 (D-5) | Daniel Okafor | rc2 | Pass | CLM-14-recalc-monday-run.log | Re-run against the edited CLM-8 |
| — | CLM-22 | not run | — | — | — | — | No hardship test claimant was available in UAT |

Release 2.3 runs (history): CLM-3 — fail 8 Sep 2026 (raised CLM-5), Daniel Okafor; CLM-4 — pass 9 Sep 2026, Mei-Ling Chow. CLM-3 was not re-run before the 2.3 sign-off; that is why condition C-2.3-1 existed.

### 4.5 What the brief must show for 2.4 on D0 (expected results — use as the test oracle)

| Case | Latest run | Counts as | Reason |
|---|---|---|---|
| CLM-11, 12, 13 | Pass 24 Nov | **Pass, current** | Nothing changed since |
| CLM-14 | Pass 4 Dec (R-14) | **Pass, current** | Re-run after the CLM-8 edit |
| CLM-15 | Pass 2 Dec (R-12) | **Passed, then changed** | CLM-8 edited 3 Dec, after the run |
| CLM-16 | Pass 26 Nov (R-09) | **Passed, then changed** | CLM-8 edited 3 Dec, after the run |
| CLM-17, 19 | Pass 25 Nov | **Pass, current** | Nothing changed since |
| CLM-18 | Pass 3 Dec (R-13) | **Passed, then changed** | Linked defect CLM-24 reopened 4 Dec, after the run |
| CLM-20, 21 | Pass 27 Nov | **Pass, current** | Nothing changed since |
| CLM-22 | none | **Not run** | — |

Headline: **12 cases — 8 pass with current evidence, 3 passed then changed, 1 not run.** A plain test report would say "11 of 12 passed (92%)". The honest figure is 8 of 12 (67%). This contrast is the demo's first beat.

Note for the staleness rule: these three are the only intended stale results. If "new deployment after the run" is applied to every case, the rc2 deployment on 1 Dec would also mark all rc1 passes stale. Scope the deployment rule to cases linked to the issues in that deployment (here CLM-23 and CLM-24, whose cases were re-run anyway), or the dataset's expected results change.

Other items on the brief:
- **Open defects:** 1 — CLM-24 (Medium, reopened 4 Dec). CLM-23 is closed and its case passed afterwards.
- **Separation of duties:** Grace Whitlock — independent (built nothing, tested nothing). Samuel Ortega — **conflict: fixed CLM-24, which is in the release he is approving.** No tester built what they tested. No developer tested their own work.
- **Decision memory:** release 2.3 was accepted with 2 conditions; 1 is still open and is 9 days overdue (see 4.6).

### 4.6 Events and decisions

**Requirement change (drives stale evidence).** CLM-8, description edited by Leo Marchetti, 3 Dec 2026 15:40 (D-6). Old text: "The new award applies from the date of the change." New text: "The new award applies from the Monday following the date of the change." Comment: "Policy team clarified the effective-date rule."

**Release 2.3 acceptance record (previous link in the seal chain).**

| Field | Value |
|---|---|
| Decision | Accepted with conditions |
| Signed | Fri 18 Sep 2026 16:10 |
| Approvers | Grace Whitlock (business), Samuel Ortega (technical) — no conflicts |
| Result at signing | 2 cases: 1 pass, 1 fail with defect CLM-5 open |
| Condition C-2.3-1 | "Fix CLM-5 and re-run CLM-3 by 16 Oct 2026." Owner Tomasz Wrobel. **Met** — CLM-5 resolved 9 Oct 2026, CLM-3 re-run pass 12 Oct 2026 by Daniel Okafor. |
| Condition C-2.3-2 | "Deliver CLM-6, the override audit export, by 30 Nov 2026." Owner Aisha Bello. **Open** — CLM-6 still In Progress; overdue on D0. |

**Release 2.4 — the decision the demo should reach on D0 (Wed 9 Dec 2026).**

1. Brief opens: 8 / 3 / 1, one open defect, one conflict, one overdue condition. Signing is blocked by the conflict.
2. Priya has Daniel re-run CLM-15 and CLM-16 live (both pass against the edited CLM-8) → 10 current, 1 changed, 1 not run.
3. Ingrid Solberg records a waiver for Samuel Ortega: "No other technical approver is available before go-live. The CLM-24 fix was peer-reviewed by Tomasz Wrobel. Waiver applies to release 2.4 only." (Alternative path to show instead: replace Samuel with another approver.)
4. Grace Whitlock and Samuel Ortega sign **Accepted with conditions**:
   - C-2.4-1: "Fix CLM-24 for numbers with spaces and re-run CLM-18 by 18 Dec 2026." Owner Aisha Bello.
   - C-2.4-2: "Run CLM-22 with a hardship test claimant by 18 Dec 2026." Owner Mei-Ling Chow.
   - C-2.4-3 (carried from C-2.3-2): "Deliver CLM-6 by 15 Jan 2027." Owner Aisha Bello.
5. The acceptance record is written to Confluence and sealed, chained to the 2.3 record.
6. Hannah Reyes clicks Verify seal: valid. Someone then changes run R-13 from Pass to Fail; Verify seal now fails and names the changed row.

**What the sample loads instead of steps 3 and 4 (so that the person who loads it decides).** A clean site has one real user. The loader therefore makes that person the approver of 2.4: it assigns CLM-24 to them and moves it to In Progress under their own name, so the one conflict is theirs and comes from real Jira history. Priya Raman then asks them to decide (request dated D-1 16:30, decide by 18 Dec, sign-off task CLM-30) and proposes two **drafts** on the request. The approver can keep, edit or remove each one; nothing is decided for them, and the statement is never filled in.

| Draft | Text | People | Covers |
|---|---|---|---|
| Condition | "Re-run CLM-15, CLM-16 and CLM-18, and run CLM-22 with a hardship test claimant, by 16 Dec 2026." (due 7 days after the load day) | Owner Priya Raman | The four open cases: CLM-15, CLM-16, CLM-18 (passed, then changed) and CLM-22 (not run) |
| Waiver | "No other approver is available before the go-live board. The approver took over CLM-24 only after it was reopened, and Tomasz Wrobel will review the fix. This waiver applies to Release 2.4 only." | Recorded by Priya Raman, authorised by Ingrid Solberg | The approver's own conflict (assignee of CLM-24 while it was in progress) |

Because the waiver is recorded by the test lead and authorised by the quality and compliance officer, it is not the approver's own and is not marked "Not independent". A waiver the approver records for themself (also after editing this one) still is. The drafts are fitted to the open items the brief really has: if the conflict is not there, no waiver is proposed.

### 4.7 Release 2.5 — where the condition comes back

Release 2.5 exists so that what is signed for 2.4 is seen again. It is small, not signed, and nobody has been asked. All invented, same portal.

| Key | Type | Summary | Status | Reporter | Assignee | Created |
|---|---|---|---|---|---|---|
| CLM-25 | Requirement | Claimant can withdraw a claim online before a decision is made | Done (built 24 Nov–3 Dec) | Leo Marchetti | Tomasz Wrobel | 23 Nov 2026 (D-16) |
| CLM-26 | Requirement | Caseworker can find a claim by its claim reference | **In Progress** since 2 Dec | Leo Marchetti | Aisha Bello | 23 Nov 2026 (D-16) |
| CLM-27 | Acceptance case | Claimant withdraws a claim that has no decision yet (tests CLM-25) | Done | Priya Raman | Daniel Okafor | 4 Dec 2026 (D-5) |
| CLM-28 | Acceptance case | A claim that has a decision cannot be withdrawn (tests CLM-25) | To Do (not run) | Priya Raman | Daniel Okafor | 4 Dec 2026 (D-5) |
| CLM-29 | Acceptance case | A full claim reference opens the right claim (tests CLM-26) | To Do (not run) | Priya Raman | Mei-Ling Chow | 4 Dec 2026 (D-5) |

Acceptance criteria:
- CLM-25: a claim that has no decision yet can be withdrawn by the claimant, who gives a reason; a claim that has a decision cannot; the caseworker sees the claim as withdrawn.
- CLM-26: a full claim reference opens that claim; a partial reference of at least four characters lists the matching claims.

One run: R-2.5-1, CLM-27, 7 Dec 2026 10:15 (D-2), Daniel Okafor, build `2.5.0-rc1`, Pass, evidence `CLM-27-withdraw-run.log`.

**Oracle for 2.5 on D0, before anything is signed:** 2 requirements, 3 cases — 1 pass with current evidence, 0 passed then changed, 0 failed, 2 not run. No defect, no conflict for the person who loads the sample, no request. Its first line is the one 2.4 has: "Last time (Release 2.3, Record 1): 2 conditions. 1 is 9 days overdue, 1 met."

**After Release 2.4 is signed as Record 2 with the proposed condition**, Readiness and the brief of 2.5 open with the signer's own promise, and Record 1's overdue condition stays behind it until it is met:

> Last time (Release 2.4, Record 2): 1 condition, due 16 Dec, open: "Re-run CLM-15, CLM-16 and CLM-18, and run CLM-22 with a hardship test claimant, by 16 Dec 2026." Record 1 (Release 2.3) still has 1 condition 9 days overdue.

The rule (`app/src/domain/carried.js`, tested in `app/test/domain/nextRelease.test.js`): the newest earlier record that has conditions comes first; one condition is quoted whole with its due date and state (open, N days overdue, met), several are counted; every older record that still has a condition open or overdue is named after it. The 2.4 oracle (4.5) does not change: 4 requirements, 12 cases, 8 / 3 / 0 / 1, one conflict, Record 1 with two conditions.

The condition's own Jira issue (CLM-31, "Condition from Record 2: …") is created at signing with fix version 2.5, so in Jira it is in release 2.5. In the app it is **not a requirement**: the app's own issues (a condition issue, a sign-off task) are never requirements, cases or candidates for a case (`app/src/domain/whatCounts.js`, tested in `app/test/domain/ownIssues.test.js`). So after signing, release 2.5 still has 2 requirements (CLM-25, CLM-26), 3 cases and 1 / 0 / 0 / 2. CLM-31 is shown where it belongs: under "What was promised last time", with its Jira status.

**Which release opens when none is named** (the project page, the agent, the MCP tools): the earliest unreleased release that has cases and still waits for a decision. On the sample that is 2.4 until 2.4 is accepted, and 2.5 afterwards. A rejected release, or one asked for again, still waits. The agent then says which release it chose: "No release was named: this answer is about Release 2.5, because Release 2.4 is already decided (accepted with conditions by … on …, Record 2)." Naming 2.4 still answers for 2.4, as "Already decided."

---

## 5. Vocabulary

### Terms to use (plain, and what I mean by each)

| Term | Meaning in Fair Copy | Also heard as |
|---|---|---|
| **Acceptance** | The business agreeing that a release does what was asked | UAT, user acceptance, business acceptance |
| **Acceptance case** | One thing a user checks, tied to a requirement | Test case, UAT scenario, test script |
| **Run** | One execution of a case, with a result, a person and a time | Execution, test result |
| **Evidence** | What proves the run happened: screenshot, file, link | Objective evidence, proof, artefact |
| **Sign-off** | A named person's recorded decision on a release | Approval, authorisation, go/no-go, release approval |
| **Approver** | The person who signs | Business owner, service owner, authorising official |
| **Condition** | Something that must be done by a date for the acceptance to stand | Caveat, proviso, "accepted subject to" |
| **Waiver** | A named person's recorded permission to proceed despite a rule not being met | Exception, dispensation |
| **Deviation** | A recorded departure from the plan (Annex 11 4.2 uses this word) | Non-conformance, exception |
| **Defect** | Something that does not work as required | Bug, issue, incident (avoid "incident" — it means a live-service event) |
| **Separation of duties** | The approver did not build or test what they approve | Segregation of duties (GAO, ISO), independence, four-eyes |
| **Conflict** | A person holding two duties that should be separate | SoD conflict, conflict of interest |
| **Passed, then changed** | A pass recorded before the tested thing changed | Stale evidence (internal term; show the plain phrase in the UI) |
| **Acceptance record** | The page written at sign-off | Sign-off pack, UAT report, release certificate |
| **Seal** | The SHA-256 fingerprint of the record | Hash, checksum |
| **Traceability** | Following a requirement to its test, result and defect | Trace matrix, RTM |

### Terms to avoid or not over-claim

| Do not say | Why | Say instead |
|---|---|---|
| "Part 11 compliant", "Annex 11 compliant", "GxP validated" | Compliance belongs to the organisation's whole system and procedures, and Part 11 needs validation of the tool itself (§11.10(a)). FDA also reads Part 11 narrowly (section 1a). | "Supports the record-keeping and independence controls that Part 11, Annex 11 and NIST SP 800-53 describe." |
| "Electronic signature", "e-signature", "legally binding" | Certified e-signatures are out of scope for this app. Part 11 §11.100 onward sets identity rules the app does not implement. | "Sign-off", "recorded approval", "named approval". |
| "Tamper-proof", "immutable" | A hash detects change; it does not prevent it. | "Tamper-evident"; "any later edit is visible". |
| "Audit trail" for the app's record | In Part 11 it is a specific system-generated log of every change. | "Acceptance record" for the app's; "Jira history" for the source. |
| "Validated", "validation" | In GAMP and FDA use it is a formal, documented life cycle. | "Checked", "verified" (for the seal only). |
| "Certified", "accredited", "audit-ready", "passes audit", "SOX/ISO/PCI compliant" | I hold no certification and cannot promise an audit result. | "Gives the auditor the evidence in one place." |
| "Guarantees", "ensures", "prevents failures" | Not provable. | "Shows", "flags", "blocks signing until". |
| "Test management" | Out of scope; judges would compare the app with test suites. | "Acceptance and sign-off". |
| "Blockchain" | The chain of hashes is not one, and the word invites doubt. | "Each record is chained to the previous one." |
| "Fraud", "violation" for a conflict | A conflict is a control gap, not an accusation. | "Conflict", "not independent". |

---

## 6. Three numbers I can honestly use in the pitch

| # | Number | Exact, safe wording | Source | Caveat to keep |
|---|---|---|---|---|
| 1 | **79%** | "When the FDA analysed 242 software-related medical device recalls, 79% came from defects introduced by changes made after the software was first released." | [opened] https://www.fda.gov/media/73141/download (section 2.4) | Medical devices, 1992–1998. It supports "change after testing is where failures come from"; do not present it as a figure for all software today. |
| 2 | **22 of 24** | "US auditors found segregation-of-duties weaknesses at 22 of the 24 largest federal agencies in a single year." | [opened] https://www.gao.gov/assets/690/688585.pdf (GAO-17-549, fiscal year 2016) | FY2016, information-security controls broadly, not only release approval. Configuration management: 23 of 24, same source. |
| 3 | **20% failed and never retested** | "Before Canada's Phoenix pay system went live, auditors found that 20% of the functions they checked had not passed testing and were not retested — and the pilot had been cancelled." | [opened] https://www.ourcommons.ca/DocumentViewer/en/42-1/PACP/report-53/page-18 (House of Commons committee quoting the Auditor General) | 20% of 81 functions the auditors reviewed, not of all 984. Cite as "Auditor General of Canada, 2018, via the Public Accounts Committee report". |

Spare, if a private-sector example is wanted: Knight Capital "lost over $460 million" in about 45 minutes after a deployment that no second person reviewed — [opened] https://www.sec.gov/litigation/admin/2013/34-70694.pdf. And TSB: £48.65m fine, where the board's go-live decision rested on "attestations" — [opened] FCA and TSB links in 2a.

Number I must not use: any figure for hours spent assembling a UAT sign-off pack. None was found (2b).
