/**
 * THE BUILD CONTRACT.
 *
 * Part 1  constants shared by backend and frontend (real exports; safe to import anywhere, no Forge imports)
 * Part 2  object typedefs (PRODUCT §2–3.5, SPEC §2)
 * Part 3  view typedefs returned to the frontend and to actions
 * Part 4  module map: for every file in SPEC §4, the exact exports with parameter and return types
 * Part 5  resolver `invoke` names with request / response shapes
 * Part 6  action inputs / outputs
 *
 * Rules for builders
 * - Implement the stub that already exists at the path named here. Do not rename exports, do not change shapes.
 *   If a shape must change, ask Main; the skeleton owner edits this file.
 * - Relative imports carry the `.js` extension (`import { x } from '../domain/seal.js'`), so `node --test` can load them.
 * - `src/domain/**` imports nothing from `@forge/*`, `src/data`, `src/clients`, `src/services`. Only `node:crypto`,
 *   `../contract.js` and `../lib/*.js`.
 * - All times are `IsoTime`: UTC, to the second, `YYYY-MM-DDTHH:MM:SSZ`. All dates are `IsoDate`: `YYYY-MM-DD`.
 *   Use `lib/format.js` (`nowIso`, `toIso`) to make them. They sort correctly as strings; SQL stores them as strings.
 * - People cross module boundaries as `Person` objects. They are stored (SQL, payload) as `Person.id` only.
 * - User-facing sentences come from PRODUCT §8 verbatim, with CLM / ClaimPoint names from DOMAIN §4.
 * - Nothing may `fetch` an external host. No `@forge/llm`. No web trigger.
 */

// ───────────────────────────────────────────── Part 1: constants ─────────────────────────────────────────────

export const RECORD_SCHEMA = 'countersign.record/1';

/** Issue property key on a case issue. Value: `{ case: true, requirementKey: string }`. SQL table `cases` is the lookup truth. */
export const ISSUE_PROPERTY_KEY = 'countersign';
/** Confluence page property key holding `PageSealProperty`. */
export const PAGE_PROPERTY_KEY = 'countersign-seal';
/** Label put on every case issue the app creates or marks (helps humans and JQL; never read by rules). */
export const CASE_LABEL = 'acceptance-case';
/** Label put on the Jira task the app creates for a sign-off request (the approver's task). */
export const SIGN_OFF_LABEL = 'acceptance-sign-off';
/** Prefix of a sample person id, e.g. `sample:P5`. `kind` is 'sample' exactly when the id starts with it. */
export const SAMPLE_PERSON_PREFIX = 'sample:';
/** The PREFERRED sample key. If CLM is taken the loader uses CLM2…CLM5: always read the real key from SampleStatus.projectKey. */
export const SAMPLE_PROJECT_KEY = 'CLM';

export const CASE_STATE = Object.freeze({
  NOT_RUN: 'not_run',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  PASSED_THEN_CHANGED: 'passed_then_changed',
  PASSED: 'passed',
});
/** A requirement with zero cases. Not a CaseState; used for RequirementView.state and OpenItem.kind. */
export const NO_CASE = 'no_case';

/** Lozenge text and UI Kit appearance per state (PRODUCT §3.1, §8.3). */
export const CASE_STATE_LOZENGE = Object.freeze({
  not_run: { text: 'Not run', appearance: 'default' },
  failed: { text: 'Failed', appearance: 'removed' },
  blocked: { text: 'Blocked', appearance: 'removed' },
  passed_then_changed: { text: 'Passed, then changed', appearance: 'moved' },
  passed: { text: 'Passed', appearance: 'success' },
  no_case: { text: 'No case', appearance: 'default' },
});

export const RUN_RESULT = Object.freeze({ PASSED: 'passed', FAILED: 'failed', BLOCKED: 'blocked' });
export const STALE_CODE = Object.freeze({ S1: 'S1', S2: 'S2', S3: 'S3', S4: 'S4', S5: 'S5', S6: 'S6' });
export const DUTY_CODE = Object.freeze({ D1: 'D1', D2: 'D2', D3: 'D3', D4: 'D4' });
export const OUTCOME = Object.freeze({
  ACCEPTED: 'accepted',
  ACCEPTED_WITH_CONDITIONS: 'accepted_with_conditions',
  REJECTED: 'rejected',
});
export const OUTCOME_LOZENGE = Object.freeze({
  accepted: { text: 'Accepted', appearance: 'success' },
  accepted_with_conditions: { text: 'Accepted with conditions', appearance: 'moved' },
  rejected: { text: 'Rejected', appearance: 'removed' },
});
export const REQUEST_STATE = Object.freeze({ OPEN: 'open', DECIDED: 'decided', WITHDRAWN: 'withdrawn' });
export const CONDITION_STATE = Object.freeze({ OPEN: 'open', MET: 'met', OVERDUE: 'overdue' });
export const VERIFY_RESULT = Object.freeze({
  INTACT: 'intact',
  BROKEN: 'broken',
  INTACT_EVIDENCE_MISSING: 'intact_evidence_missing',
  NOT_FULLY_CHECKED: 'not_fully_checked', // nothing differs, but at least one check could not run: never shown as intact
});
export const VERIFY_RESULT_TEXT = Object.freeze({
  intact: 'Seal intact',
  broken: 'Seal broken',
  intact_evidence_missing: 'Seal intact, evidence missing',
  not_fully_checked: 'Not fully checked',
});
/** The ONE wording of the four counts, on every screen, on the record page and in the agent. The keys are internal. */
export const COUNT_LABEL = Object.freeze({
  proven: Object.freeze({ label: 'Passed', hint: 'nothing changed since' }),
  stale: Object.freeze({ label: 'Passed, then changed', hint: 'the pass no longer counts' }),
  failing: Object.freeze({ label: 'Failed', hint: 'failed or blocked' }),
  unproven: Object.freeze({ label: 'Not tested', hint: 'not run, or no case' }),
});
/** A waiver recorded by the person who signs: allowed (settings), never hidden. Brief, record view and record page. */
export const WAIVER_NOT_INDEPENDENT = 'Not independent';
export const WAIVER_SELF_LINE =
  'Recorded by the approver, the same person who signs. This project allows it (Settings, "The approver may record their own waiver") because some teams have one approver; it is printed here so that a reader can judge it.';
/** Label of the Jira comment that carries the seal, written as the signer (check V5). The app cannot rewrite its time or author. */
export const ANCHOR_MARK = 'Acceptance seal';
/** Evidence files larger than this are not downloaded for hashing; they are compared by id, name and size only. */
export const EVIDENCE_HASH_MAX_BYTES = 20 * 1024 * 1024;
export const RELEASE_STATUS = Object.freeze({
  NOT_READY: 'not_ready',
  READY: 'ready',
  AWAITING_DECISION: 'awaiting_decision',
  ACCEPTED: 'accepted',
  ACCEPTED_WITH_CONDITIONS: 'accepted_with_conditions',
  REJECTED: 'rejected',
});
export const HISTORY_KIND = Object.freeze({ TEXT: 'text', STATUS: 'status', ASSIGNEE: 'assignee', OTHER: 'other' });
export const STATUS_CATEGORY = Object.freeze({ TODO: 'todo', IN_PROGRESS: 'in_progress', DONE: 'done' });
/** Defect priorities, most serious first. A defect blocks when its index <= index of settings.rules.defectBlockPriority. */
export const PRIORITY_ORDER = Object.freeze(['Highest', 'High', 'Medium', 'Low', 'Lowest']);

/** Error codes a resolver or action may return in `{ ok:false, code }`. `error` is always a finished sentence from PRODUCT §8.6. */
export const ERROR = Object.freeze({
  NOT_IMPLEMENTED: 'not_implemented',
  INVALID: 'invalid', //            a field failed validation; `details.field` names it
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden', //        no permission in Jira
  B1_NOT_APPROVER: 'B1',
  B2_BRIEF_CHANGED: 'B2', //        `details.brief` holds the fresh Brief
  B3_NOT_AFFIRMED: 'B3',
  NOT_SIGNABLE: 'not_signable', //  plain accept with open items, or coverage incomplete; `details.uncovered`
  REQUEST_OPEN: 'request_open', //  there is already an open request for this release
  HISTORY_UNREADABLE: 'history_unreadable',
  SAMPLE_LOADED: 'sample_loaded',
  SAMPLE_FAILED: 'sample_failed',
  CONFLUENCE: 'confluence', //      page could not be written / found
  FAILED: 'failed', //              generic: "That did not work, and nothing was changed."
});

/**
 * Every resolver name. The frontend calls `invoke(INVOKE.x, payload)` and nothing else.
 * Shapes: see Part 5 (`InvokeMap`).
 */
export const INVOKE = Object.freeze({
  getBootstrap: 'getBootstrap',
  loadSample: 'loadSample',
  removeSample: 'removeSample',
  getReadiness: 'getReadiness',
  setBuild: 'setBuild',
  getPanel: 'getPanel',
  markCase: 'markCase',
  addCase: 'addCase',
  recordRun: 'recordRun',
  checkApprover: 'checkApprover',
  requestSignoff: 'requestSignoff',
  withdrawRequest: 'withdrawRequest',
  getBrief: 'getBrief',
  saveCondition: 'saveCondition',
  deleteCondition: 'deleteCondition',
  saveWaiver: 'saveWaiver',
  deleteWaiver: 'deleteWaiver',
  sign: 'sign',
  listRecords: 'listRecords',
  getRecord: 'getRecord',
  verifyRecord: 'verifyRecord',
  verifyAll: 'verifyAll',
  verifyPage: 'verifyPage',
  publishPage: 'publishPage',
  restorePage: 'restorePage',
  confirmConditionMet: 'confirmConditionMet',
  getSettings: 'getSettings',
  saveSettings: 'saveSettings',
  listSpaces: 'listSpaces',
  testConnection: 'testConnection',
  finishSigning: 'finishSigning',
  getStart: 'getStart',
});

/** @type {Settings} Defaults that make the settings page unnecessary on a clean, single-user site (SPEC §3.5). */
export const DEFAULT_SETTINGS = Object.freeze({
  people: Object.freeze({
    approvers: Object.freeze([]), //           empty = anyone who can see the project
    waiverAuthorities: Object.freeze([]), //   empty = anyone who can see the project
    approverMayRecordOwnWaiver: true, //       single-user sites need it; such a waiver is printed as "Not independent"
  }),
  rules: Object.freeze({
    staleBlocks: true,
    unprovenBlocks: true, //                   failed, blocked, not run, no case
    approverMustNotBuild: true, //             D1
    approverMustNotTest: true, //              D2
    noSelfTest: true, //                       D3
    overdueConditionBlocks: false,
    passNeedsEvidence: true,
    defectBlockPriority: 'High',
    defectBlockPriorityId: null, //            Jira priority id; null = the priority named above, else the site's second
  }),
  whatCounts: Object.freeze({
    requirementTypes: Object.freeze(['Story', 'Task', 'Feature']),
    defectTypes: Object.freeze(['Bug']),
    requirementTypeIds: Object.freeze([]), //   Jira issue type ids; empty = match by (untranslated) name above
    defectTypeIds: Object.freeze([]),
    criteriaField: null, //                    Jira field id, or null = description only
    environments: Object.freeze(['UAT', 'Staging', 'Production-like', 'Other']),
  }),
  records: Object.freeze({
    spaceKey: null, //                         null = the app creates / reuses its own space on first publish
    createTask: true,
  }),
});

/** KVS keys (data/settings.js is the only module that touches KVS). */
export const KVS_KEY = Object.freeze({
  settings: (projectKey) => `settings:${projectKey}`,
  sample: 'sample', //                 SampleStatus
  recordsSpace: 'records-space', //    { spaceId, spaceKey, parentPageId }
  migratedAt: 'migrated-at', //        IsoTime of the last successful migration run
});

// ───────────────────────────────────────────── Part 2: objects ─────────────────────────────────────────────

/** @typedef {string} IsoTime  UTC `YYYY-MM-DDTHH:MM:SSZ` */
/** @typedef {string} IsoDate  `YYYY-MM-DD` */
/** @typedef {string} Sha256   64 lowercase hex characters */
/** @typedef {'not_run'|'failed'|'blocked'|'passed_then_changed'|'passed'} CaseState */
/** @typedef {'passed'|'failed'|'blocked'} RunResult */
/** @typedef {'todo'|'in_progress'|'done'} StatusCategory  Jira `new` → todo, `indeterminate` → in_progress, `done` → done */
/** @typedef {'accepted'|'accepted_with_conditions'|'rejected'} Outcome */

/**
 * @typedef {Object} Person
 * @property {string} id                 Jira accountId, or `sample:P<n>` for a sample person
 * @property {string} name               display name
 * @property {'jira'|'sample'} kind      sample people are shown with a "Sample" tag everywhere
 */

/**
 * One normalised fact from an issue's history (SPEC §2.3). Both the Jira changelog and the sample ledger produce these.
 * @typedef {Object} HistoryEvent
 * @property {string} issueKey
 * @property {'text'|'status'|'assignee'|'other'} kind
 *   text      summary, description or the configured criteria field changed
 *   status    status changed; `from`/`to` are StatusCategory values, `fromText`/`toText` the status names
 *   assignee  assignee changed; `from`/`to` are Person ids (null = unassigned), `fromPerson`/`toPerson` the people
 *   other     anything else (kept for "changed since signing"; never a stale trigger)
 * @property {string} field              'summary' | 'description' | 'status' | 'assignee' | a Jira field id or name
 * @property {string|null} from
 * @property {string|null} to
 * @property {string|null} [fromText]    display form of `from` (text bodies may be absent: Jira does not always carry them)
 * @property {string|null} [toText]
 * @property {Person|null} [fromPerson]  assignee events only
 * @property {Person|null} [toPerson]    assignee events only
 * @property {IsoTime} at
 * @property {Person} actor
 * @property {'jira'|'sample'} source
 * @property {boolean} [baseline]        true for the two synthetic events the provider emits at the issue's creation time:
 *                                       {kind:'status', from:null, to:<first category>} and {kind:'assignee', from:null, to:<first assignee|null>}.
 *                                       Baselines give duties a starting state; they are never stale triggers.
 * @property {boolean} [byApp]           true when the Jira author accountType is 'app' (excluded from duties and staleness)
 */

/**
 * @typedef {Object} Release  A Jira fix version plus the build under acceptance.
 * @property {string} id                 Jira version id
 * @property {string} name               e.g. '2.4'
 * @property {string} projectKey
 * @property {string} projectId
 * @property {boolean} released
 * @property {IsoDate|null} releaseDate
 * @property {string|null} build         build under acceptance; null = none set, S5 does not apply (SPEC §2.11)
 * @property {IsoTime|null} buildSetAt
 * @property {Person|null} buildSetBy
 */

/**
 * @typedef {Object} IssueLink
 * @property {string} type               link type name, e.g. 'Relates', 'Blocks'
 * @property {'inward'|'outward'} direction
 * @property {string} key                the other issue
 */
/**
 * @typedef {Object} Attachment
 * @property {string} id
 * @property {string} filename
 * @property {number} size               bytes (integer)
 * @property {IsoTime} created
 */
/**
 * A Jira issue as returned by clients/jira.js. Rich text is flattened to plain text.
 * @typedef {Object} Issue
 * @property {string} id
 * @property {string} key
 * @property {string} projectKey
 * @property {string} summary
 * @property {string} description        plain text ('' when empty)
 * @property {string} criteria           plain text of the configured criteria field ('' when none)
 * @property {string} type               issue type name
 * @property {{name: string, category: StatusCategory}} status
 * @property {string|null} priority      priority name
 * @property {Person|null} assignee
 * @property {Person|null} reporter
 * @property {{id: string, name: string}[]} fixVersions
 * @property {string[]} labels
 * @property {IssueLink[]} links
 * @property {Attachment[]} attachments
 * @property {IsoTime} created
 * @property {IsoTime} updated
 */

/**
 * @typedef {Object} Requirement  An issue in the release whose type is in settings.whatCounts.requirementTypes
 *                                AND which is not marked as a case (a case is never a requirement, whatever its type)
 *                                AND which is not one of the app's own issues (a condition issue, a sign-off issue:
 *                                domain/whatCounts.requirementIssues).
 * @property {string} id
 * @property {string} key
 * @property {string} summary
 * @property {string} text               summary + '\n' + description + ('\n' + criteria when a criteria field is set)
 * @property {Sha256} textHash           domain/seal.js textHash(text)
 * @property {{name: string, category: StatusCategory}} status
 * @property {string} type
 * @property {string} url                `/browse/KEY`
 */

/**
 * @typedef {Object} Case  An issue marked as an acceptance case and tied to exactly one requirement.
 * @property {string} id
 * @property {string} key
 * @property {string} summary
 * @property {string} text               summary + '\n' + description
 * @property {Sha256} textHash
 * @property {string} requirementKey
 * @property {string} url
 */

/**
 * @typedef {Object} Evidence
 * @property {string} attachmentId
 * @property {string} filename
 * @property {number} size               bytes (integer)
 * @property {Sha256|null} sha256        null = "not captured" (bytes could not be read). Never invented (SPEC §2.10).
 */

/**
 * @typedef {Object} RunSnapshot  What the requirement and the case said at the moment of the run.
 * @property {string} requirementText
 * @property {Sha256} requirementTextHash
 * @property {string} caseText
 * @property {Sha256} caseTextHash
 */

/**
 * @typedef {Object} Run  Never edited or deleted. Only the latest run of a case counts (latest executedAt, then highest id).
 * @property {string} id
 * @property {string} projectKey
 * @property {string} releaseId
 * @property {string} caseKey
 * @property {string} requirementKey
 * @property {RunResult} result
 * @property {string} notes              '' when none
 * @property {string} build
 * @property {string} environment
 * @property {IsoTime} executedAt
 * @property {Person} executedBy
 * @property {Evidence[]} evidence
 * @property {RunSnapshot} snapshot
 * @property {boolean} sample            written by the sample loader
 */

/**
 * @typedef {Object} StaleReason
 * @property {'S1'|'S2'|'S3'|'S4'|'S5'|'S6'} code
 * @property {string} issueKey           the requirement (S1, S3), the case (S2, S6), the defect (S4), the case (S5)
 * @property {IsoTime|null} at           when the trigger happened; null for S5 without a build time and for S6
 * @property {Person|null} by
 * @property {string} sentence           finished line from PRODUCT §3.2, e.g. "Requirement edited by Leo Marchetti on 3 Dec, after this test."
 * @property {string|null} before        S1/S2: text in the run's snapshot; S5: tested build; else null
 * @property {string|null} after         S1/S2: live text; S5: current build; else null
 */

/**
 * @typedef {Object} DutyFact  One reason a person counts as builder or tester of a requirement.
 * @property {Person} person
 * @property {string} requirementKey
 * @property {string} issueKey           the issue the fact rests on (the requirement itself, a linked defect, or the case)
 * @property {'assignee_in_progress'|'moved_to_done'|'recorded_run'} basis
 * @property {string} fact               e.g. "Assignee while In Progress, 24 Nov–1 Dec" / "Recorded 2 runs, latest 3 Dec"
 * @property {IsoTime|null} from
 * @property {IsoTime|null} to
 */

/**
 * @typedef {Object} DutyConflict
 * @property {string} id                 stable: `conflict:<code>:<person.id>:<item>`; this is the OpenItem id a waiver covers
 * @property {'D1'|'D2'|'D3'|'D4'} code
 * @property {Person} person
 * @property {string} item               requirement key (D1–D3); '' for D4
 * @property {string} fact               the changelog / run fact it rests on
 * @property {string} sentence           PRODUCT §8.5 "Who did what" line, third person (this is what a waiver and the record print)
 * @property {string|null} youSentence   D1, D2, D4: the same line in the second person, shown when `person` is the viewer; null for D3
 * @property {boolean} blocking          false for D4, and false when the matching rule is switched off
 * @property {string|null} historyUrl    link to the issue
 */

/**
 * @typedef {Object} Duties
 * @property {DutyFact[]} builders
 * @property {DutyFact[]} testers
 * @property {DutyConflict[]} conflicts
 */

/**
 * @typedef {Object} Request  "Please decide on Release 2.4". At most one open request per release.
 * @property {string} id
 * @property {string} projectKey
 * @property {string} releaseId
 * @property {string} releaseName
 * @property {Person} requestedBy
 * @property {IsoTime} requestedAt
 * @property {Person} approver
 * @property {IsoDate} dueDate
 * @property {string} note
 * @property {'open'|'decided'|'withdrawn'} state
 * @property {string|null} taskKey       Jira task created for the approver, when asked for
 * @property {string|null} recordId      set when decided
 */

/**
 * @typedef {Object} Decision
 * @property {Outcome} outcome
 * @property {string} statement
 * @property {Person} decidedBy
 * @property {IsoTime} decidedAt
 */

/**
 * @typedef {Object} Condition  A promise attached to a decision. A draft until the request is signed (recordId null).
 * @property {string} id
 * @property {string} projectKey
 * @property {string|null} requestId
 * @property {string|null} recordId      null while a draft
 * @property {number|null} recordNumber
 * @property {string|null} releaseName   release of the record it belongs to
 * @property {string} text               what must be done
 * @property {Person} owner
 * @property {IsoDate} dueDate
 * @property {string[]} covers           OpenItem ids
 * @property {string|null} linkedIssue   Jira issue that does the work
 * @property {'open'|'met'} status       stored
 * @property {'open'|'met'|'overdue'} state   computed: open and dueDate < today (UTC) → overdue
 * @property {IsoTime|null} metAt
 * @property {Person|null} metBy
 * @property {boolean} sample            written by the sample loader: Record 1's conditions, and the draft the sample test
 *                                       lead proposes on the sample request (services/brief `proposed`). An edit keeps it.
 */

/**
 * @typedef {Object} Waiver  Valid for one decision only. A draft until the request is signed (recordId null).
 * @property {string} id
 * @property {string} projectKey
 * @property {string|null} requestId
 * @property {string|null} recordId
 * @property {string} covers             ONE OpenItem id whose `needs` is 'waiver' (a conflict or an overdue condition)
 * @property {string} coversLabel        the open item's label at the time, e.g. "Conflict: … built and tested CLM-9"
 * @property {string} reason             at least 20 characters
 * @property {Person|null} authorisedBy  a person on the site …
 * @property {string|null} authorisedByName   … or a name and title when they are outside Jira. Exactly one of the two is set.
 * @property {string} reference          document number or link ('' when none)
 * @property {Person} recordedBy         a sample person on the draft the sample test lead proposes; else whoever saved it
 * @property {IsoTime} recordedAt
 * @property {boolean} selfRecorded      recordedBy is the approver → printed as "Not independent"
 */

/**
 * The sealed document (PRODUCT §3.5). People are ids. No floats. No undefined (use null). Arrays sorted as stated.
 * @typedef {Object} RecordPayload
 * @property {'countersign.record/1'} schema
 * @property {string} site               cloud id
 * @property {{id: string, key: string}} project
 * @property {{id: string, name: string}} release
 * @property {string|null} build
 * @property {number} recordNumber
 * @property {{id: string, requestedBy: string, requestedAt: IsoTime, approver: string, dueDate: IsoDate}} request
 * @property {{outcome: Outcome, statement: string, decidedBy: string, decidedAt: IsoTime}} decision
 * @property {Counts} counts
 * @property {PayloadItem[]} items       one per requirement, sorted by key (natural order: CLM-7 before CLM-10)
 * @property {{key: string, summary: string, status: string, priority: string|null}[]} defects   open defects at signing, sorted by key
 * @property {{builders: {person: string, requirementKey: string, fact: string}[], testers: {person: string, requirementKey: string, fact: string}[], conflicts: {code: string, person: string, item: string, fact: string}[]}} duties
 * @property {{id: string, text: string, owner: string, dueDate: IsoDate, covers: string[], linkedIssue: string|null}[]} conditions
 * @property {{id: string, covers: string, coversLabel: string, reason: string, authorisedBy: string|null, authorisedByName: string|null, reference: string, recordedBy: string, recordedAt: IsoTime, selfRecorded: boolean}[]} waivers
 * @property {{id: string, fromRecord: number, text: string, state: 'open'|'met'|'overdue'}[]} carriedConditions
 * @property {Settings['rules']} rules   the rules in force
 * @property {Sha256} prevSeal           64 zeros for Record 1
 */
/**
 * @typedef {Object} PayloadItem
 * @property {{id: string, key: string, summary: string, textHash: Sha256, status: string}} requirement
 * @property {PayloadCase[]} cases       sorted by key (natural order)
 */
/**
 * @typedef {Object} PayloadCase
 * @property {string} id
 * @property {string} key
 * @property {string} summary
 * @property {CaseState} state
 * @property {{code: string, at: IsoTime|null, by: string|null}[]} staleReasons
 * @property {{id: string, result: RunResult, executedAt: IsoTime, executedBy: string, build: string, environment: string, notesHash: Sha256, evidence: Evidence[], snapshot: {requirementTextHash: Sha256, caseTextHash: Sha256}}|null} run
 */

/**
 * @typedef {Object} AcceptanceRecord  The stored record. `payload` is the truth; the page is the readable copy.
 * @property {string} id
 * @property {string} projectKey
 * @property {number} number             1, 2, 3 … per project
 * @property {string} releaseId
 * @property {string} releaseName
 * @property {Outcome} outcome
 * @property {Person} decidedBy
 * @property {IsoTime} decidedAt
 * @property {Sha256} seal
 * @property {Sha256} prevSeal
 * @property {RecordPayload} payload
 * @property {string} payloadJson        the canonical JSON exactly as sealed (V1 hashes THIS string, not a re-serialisation of `payload`)
 * @property {string|null} pageId
 * @property {string|null} pageUrl       `/wiki/spaces/<key>/pages/<id>`
 * @property {'published'|'failed'|'none'} pageStatus
 * @property {string|null} pageError
 * @property {boolean} sample
 */

/**
 * @typedef {Object} PageSealProperty  Value of the Confluence page property `countersign-seal`.
 * @property {string} recordId
 * @property {number} recordNumber
 * @property {string} projectKey
 * @property {Sha256} seal
 * @property {Sha256} prevSeal
 * @property {number} sealedVersion      page version number the app wrote last (a higher live version = edited by someone)
 */

/**
 * @typedef {Object} Check  One of V1–V4.
 * @property {boolean|null} ok           null = could not be checked / does not apply (no page published, Confluence absent)
 * @property {string} message            e.g. "Stored record matches its seal" / "Confluence page differs in 1 place"
 * @property {number} [compared]         V2: values compared; V4: files checked
 */
/**
 * @typedef {Object} Difference
 * @property {'snapshot'|'page'|'chain'|'evidence'} check
 * @property {string} where              "Evidence table · Case CLM-18 · State at signing"
 * @property {string|null} sealed        value in the sealed record
 * @property {string|null} found         value found now
 * @property {Person|null} editedBy      V2: last editor of the page
 * @property {IsoTime|null} editedAt
 * @property {number|null} version       V2: page version
 */
/**
 * @typedef {Object} VerifyResult
 * @property {'intact'|'broken'|'intact_evidence_missing'} result
 * @property {string} recordId
 * @property {number} recordNumber
 * @property {string} releaseName
 * @property {Sha256} seal
 * @property {IsoTime} sealedAt
 * @property {{snapshot: Check, page: Check, chain: Check, evidence: Check}} checks
 * @property {Difference[]} differences
 * @property {{issueKey: string, sentence: string, at: IsoTime}[]} changedSinceSigning   never makes the result 'broken'
 * @property {string|null} pageUrl
 * @property {boolean} canRestore        a page exists and the caller may restore it
 * @property {IsoTime} checkedAt
 */

/**
 * @typedef {Object} Settings  Per project, KVS `settings:<projectKey>`. Missing keys fall back to DEFAULT_SETTINGS.
 * @property {{approvers: string[], waiverAuthorities: string[], approverMayRecordOwnWaiver: boolean}} people   account ids
 * @property {{staleBlocks: boolean, unprovenBlocks: boolean, approverMustNotBuild: boolean, approverMustNotTest: boolean, noSelfTest: boolean, overdueConditionBlocks: boolean, passNeedsEvidence: boolean, defectBlockPriority: string}} rules
 * @property {{requirementTypes: string[], defectTypes: string[], criteriaField: string|null, environments: string[]}} whatCounts
 * @property {{spaceKey: string|null, createTask: boolean}} records
 */

// ───────────────────────────────────────────── Part 3: views ─────────────────────────────────────────────

/**
 * @typedef {Object} Counts  proven = passed; stale = passed_then_changed; failing = failed + blocked;
 *                           unproven = not_run cases + requirements with no case (1 each). Integers.
 * @property {number} proven
 * @property {number} stale
 * @property {number} failing
 * @property {number} unproven
 */

/**
 * @typedef {Object} CaseView
 * @property {string} id
 * @property {string} key
 * @property {string} summary
 * @property {string} url
 * @property {string} requirementKey
 * @property {Sha256} textHash
 * @property {CaseState} state
 * @property {Run|null} latestRun
 * @property {number} runCount
 * @property {StaleReason[]} staleReasons   non-empty only when state is passed_then_changed
 * @property {StaleReason[]} notes          changes after a failed/blocked run: shown underneath, not a state
 */
/**
 * @typedef {Object} RequirementView
 * @property {string} id
 * @property {string} key
 * @property {string} summary
 * @property {string} url
 * @property {string} type
 * @property {{name: string, category: StatusCategory}} status
 * @property {Sha256} textHash
 * @property {CaseView[]} cases             sorted by key (natural order)
 * @property {'no_case'|'all_passed'|'attention'} state   attention = any case not `passed`; drives the collapsed/open default
 * @property {string[]} defectKeys          defects linked to the requirement or one of its cases (open or closed)
 */
/**
 * @typedef {Object} Defect
 * @property {string} key
 * @property {string} summary
 * @property {string} url
 * @property {{name: string, category: StatusCategory}} status
 * @property {string|null} priority
 * @property {boolean} open                 status category is not done
 * @property {boolean} blocking             open and at or above settings.rules.defectBlockPriority
 * @property {string[]} linkedTo            requirement / case keys in the release
 */
/**
 * @typedef {Object} RecordSummary
 * @property {string} id
 * @property {number} number
 * @property {string} releaseId
 * @property {string} releaseName
 * @property {Outcome} outcome
 * @property {Person} decidedBy
 * @property {IsoTime} decidedAt
 * @property {Sha256} seal
 * @property {Sha256} prevSeal
 * @property {string|null} pageUrl
 * @property {'published'|'failed'|'none'} pageStatus
 * @property {{open: number, met: number, overdue: number}} conditions
 * @property {boolean} sample
 */
/**
 * @typedef {Object} CarriedGroup  Conditions of one earlier record, shown in Readiness and in brief section 5.
 * @property {RecordSummary} record
 * @property {string} sentence              "Release 2.3 was accepted with 2 conditions on 18 Sep by Grace Whitlock."
 * @property {(Condition & {line: string, linkedIssueStatus: string|null, daysLate: number|null})[]} conditions
 */
/**
 * An item that stops plain acceptance (PRODUCT §3.4). `needs` says what can cover it.
 * id forms:  `case:<caseKey>:stale|failed|blocked|not_run` · `req:<reqKey>:no_case` · `defect:<key>` ·
 *            `conflict:<code>:<personId>:<item>` · `overdue:<conditionId>`
 * @typedef {Object} OpenItem
 * @property {string} id
 * @property {'stale'|'failed'|'blocked'|'not_run'|'no_case'|'defect'|'conflict'|'overdue_condition'} kind
 * @property {string} item                  issue key, or '' for an overdue condition
 * @property {string} label                 "CLM-15 passed, then changed" / "Conflict: … built and tested CLM-9" / "Overdue: Deliver CLM-6 (Record 1)"
 * @property {'condition'|'waiver'} needs   conflict and overdue_condition need a waiver; everything else a condition
 * @property {{by: 'condition'|'waiver', id: string}|null} coveredBy
 */
/**
 * @typedef {Object} Availability  Per outcome: may the approver choose it now, and if not, why (short phrases: "3 stale", "1 conflict").
 * @property {{allowed: boolean, reasons: string[]}} accepted
 * @property {{allowed: boolean, reasons: string[], covered: number, total: number}} accepted_with_conditions
 * @property {{allowed: boolean, reasons: string[]}} rejected
 */

/**
 * Everything computed about one release. Readiness is this; Brief extends it.
 * @typedef {Object} Readiness
 * @property {{id: string, key: string, name: string}} project
 * @property {Release} release
 * @property {Release[]} releases           all versions of the project, unreleased first (for the picker)
 * @property {Person} viewer
 * @property {Counts} counts
 * @property {{requirements: number, cases: number}} totals
 * @property {'not_ready'|'ready'|'awaiting_decision'|'accepted'|'accepted_with_conditions'|'rejected'} status
 * @property {string} verdict               PRODUCT §8.4 sentence
 * @property {string|null} usualSheet       "The usual sheet would show 11 passes. 3 of those are no longer true." — only when something is stale
 * @property {{caseKey: string, sentence: string}[]} staleLines
 * @property {RequirementView[]} requirements   sorted by key (natural order)
 * @property {Defect[]} defects             all defects of the release; filter on `open` for the open list
 * @property {Duties} duties                computed with approver = the open request's approver, else the viewer ("If you are named as approver…")
 * @property {boolean} approverNamed         false = nobody has been asked yet, so D1, D2 and D4 are about the viewer and do not count in the verdict
 * @property {CarriedGroup[]} carried       earlier records of the project that still have conditions, newest first
 * @property {OpenItem[]} openItems
 * @property {Request|null} request         the open request, if any
 * @property {RecordSummary|null} decided   the record that decided THIS release, if any
 * @property {number} recordCount
 * @property {string} headline              first line of Readiness: the usual-sheet sentence while it applies, else the verdict
 * @property {string|null} carriedLine       second line (domain/carried.js): the newest earlier record that has conditions, a single
 *                                           condition in the words it was signed with, then older records that still have one not met.
 *                                           'Last time (Release 2.4, Record 2): 1 condition, due 18 Nov, open: "…" Record 1 (Release 2.3) still has 1 condition 9 days overdue.'
 * @property {number} carriedOverdue         overdue conditions of all earlier records
 * @property {boolean} carriedOwn            the newest of those records was signed by the viewer: the brief repeats the line at its top
 * @property {boolean} sample               the project holds the sample release
 * @property {string|null} historyError     set when Jira history could not be read: signing is blocked, never "no conflicts"
 * @property {IsoTime} assembledAt
 */

/**
 * @typedef {Object} BriefChange  One stale case in section 2, "What changed since testing".
 * @property {string} caseKey
 * @property {string} caseSummary
 * @property {string} requirementKey
 * @property {string} passedLine            "passed 2 Dec on 2.4.0-rc2"
 * @property {StaleReason[]} reasons
 * @property {string} url
 */
/**
 * @typedef {Object} LinkedWork  One thing the Teamwork Graph links to a work item of the release. Context, never a blocker.
 * @property {string} issueKey               the work item of the release that was asked about
 * @property {string} issueUrl               lib/links.js issuePath(issueKey)
 * @property {'work_item'|'deployment'|'pull_request'|'branch'|'commit'|'build'} kind
 * @property {string} title                  work_item: the linked issue's summary
 * @property {string|null} url               work_item: lib/links.js issuePath(relatedKey), never the graph's `webUrl`
 * @property {IsoTime|null} at               work_item: null
 * @property {string|null} relatedKey        work_item: the linked issue's key; null for development work
 * @property {string[]} [linkedTo]           only on rows of GraphContext.items of kind work_item: every release item it is linked to
 */
/**
 * @typedef {Object} GraphAnswer  What clients/graph.js linkedWork returns.
 * @property {'ok'|'empty'|'failed'} state   ok = rows; empty = answered with no rows (also what a missing or
 *                                           switched-off scope gives: never read it as "the site has none"); failed = no answer, or errors and no data
 * @property {LinkedWork[]} items
 * @property {number} asked                  work items asked about (at most 20)
 * @property {number} answered               of those, how many got an answer
 */
/**
 * @typedef {Object} GraphContext  Brief.graph: what the approver reads about the Teamwork Graph, a sub-block of section 3.
 * @property {'off'|'ok'|'empty'|'failed'} state   off = not asked (signing and drafts do not ask)
 * @property {string} line                   "The Teamwork Graph links 14 work items to the 4 requirements of this release." or the neutral empty / failed sentence; '' when off
 * @property {number} linkedCount            distinct linked work items
 * @property {string|null} note              "Nothing is linked to these requirements from outside this release." / "CLM-31 is not in this release."
 * @property {string|null} sentence          one line for the agent; null unless something is linked from outside the release or development work exists
 * @property {LinkedWork[]} items            ONLY linked work items outside the release (with `linkedTo`), then development work
 */
/**
 * @typedef {Readiness & BriefExtra} Brief
 * @typedef {Object} BriefExtra
 * @property {Sha256} fingerprint           domain/briefFingerprint.js over the facts, the drafts and the rules; sent back on `sign` (B2)
 * @property {boolean} viewerIsApprover
 * @property {string} intro                 "Grace, you are asked to accept Release 2.4 of ClaimPoint by 18 Dec 2026. Requested by … on 9 Dec."
 * @property {BriefChange[]} changes        section 2
 * @property {{state: CaseState|'no_case', key: string, summary: string, line: string, url: string}[]} open   section 3: failed, blocked, not run, no case
 * @property {string} selfLine              section 4: "You have not built or tested anything in this release." or the viewer's own conflict
 * @property {Availability} availability    section 6
 * @property {{conditions: Condition[], waivers: Waiver[]}} draft   drafts saved on the open request
 * @property {{by: Person, line: string}|null} proposed   drafts that came with a sample request: 'Priya Raman (Sample) proposed 1 condition and 1 waiver with this request. Keep, edit or remove each one: the decision is yours.'
 * @property {boolean} viewerMayWaive       the viewer may record a waiver on this request
 * @property {number} nextRecordNumber
 * @property {GraphContext} graph            what the Teamwork Graph links to the release; shown at the end of section 3
 */

/**
 * @typedef {Object} Panel  Issue panel (PRODUCT §4.2).
 * @property {'case'|'requirement'|'other'|'no_release'} mode
 * @property {{key: string, summary: string}} issue
 * @property {Person} viewer
 * @property {Release|null} release
 * @property {CaseView|null} caseView               mode 'case'
 * @property {{key: string, summary: string, url: string}|null} requirement   mode 'case'
 * @property {Run[]} runs                           mode 'case': all runs, newest first
 * @property {Attachment[]} attachments             mode 'case': the issue's attachments, for the evidence tick list
 * @property {string[]} environments
 * @property {boolean} passNeedsEvidence
 * @property {RequirementView|null} requirementView mode 'requirement'
 * @property {string|null} teachLine                mode 'requirement': "Editing this requirement's summary, description or acceptance criteria will mark its 1 fresh pass as stale."
 * @property {{key: string, summary: string}[]} candidates   mode 'other': requirements of the issue's release, for "Tests requirement"
 */

/**
 * @typedef {Object} SampleStatus  KVS `sample`. Stored and returned whole by data/settings.
 * @property {boolean} loaded             false with projectKey set = a load is in flight or resumable
 * @property {string|null} projectKey     the real key: CLM, or CLM2…CLM5 when CLM was taken. Never hard-code CLM.
 * @property {string|null} projectId
 * @property {IsoTime|null} loadedAt
 * @property {Person|null} loadedBy
 * @property {IsoDate|null} d0             the day the dataset's day zero was mapped to (the load day)
 * @property {string[]} issueKeys
 * @property {string[]} versionIds
 * @property {string[]} recordIds
 * @property {string[]} pageIds
 *   The four below are the loader's checkpoint. They exist only while `loaded` is false and are removed by the last
 *   write of a finished load (sample/loader.js `load`), so a loaded sample never carries them.
 * @property {SampleProgress} [progress]  what the first-run screen shows while loading
 * @property {number} [phase]             how many of the loader's phases are finished (0…9); the next call starts there
 * @property {Record<string, {id: string, name: string, released: boolean, releaseDate: IsoDate}>} [versions]   by version name ('2.3', '2.4', '2.5'), from phase 1
 * @property {Record<string, string>} [issueIds]   issue key → Jira issue id, from phase 2
 *
 * @typedef {{step: 1|2|3|4, of: 4, label: string}} SampleProgress   `label` is one of sample/loader.js SAMPLE_STEPS
 *
 * What one call of loadSample answers. A load takes several calls (Forge stops a function at 25 s): while `pending`
 * is true the frontend calls loadSample again and shows `progress.label`; the last call answers `pending: false`.
 * projectKey and projectId are null only when another call holds the loader lock and no project exists yet.
 * @typedef {{pending: true, projectKey: string|null, projectId: string|null, progress: SampleProgress}
 *   | {pending: false, projectKey: string, projectId: string, releaseId: string, url: string, issues: number, flag: string}} SampleLoadResult
 *   releaseId = the unreleased sample version (2.4); url = full address of the app's page in the sample project
 *   (site-relative when the site address is unknown); issues = number of sample issues created.
 */

/**
 * @typedef {Object} Bootstrap
 * @property {string} brand
 * @property {Person} viewer
 * @property {{id: string, key: string, name: string}|null} project   from the extension context (Jira project page / settings / panel)
 * @property {Release[]} releases
 * @property {string|null} defaultReleaseId   earliest unreleased version that has cases and is not yet decided, else
 *   earliest with cases, else earliest unreleased, else null (domain/carried.defaultReleaseId; "decided" = its newest
 *   record accepted it, with or without conditions, and no request is open)
 * @property {SampleStatus} sample
 * @property {string|null} sampleUrl   site-relative address of the Acceptance page of the sample project; null when no sample
 * @property {{available: boolean, spaceKey: string|null}} confluence
 * @property {Settings} settings
 * @property {number} recordCount
 */

/**
 * Passed to every service, client call and action. Built by resolvers/index.js from the Forge request context.
 * @typedef {Object} Ctx
 * @property {string|null} accountId     the signed-in person; null in triggers
 * @property {string} cloudId
 * @property {string} siteUrl            'https://<site>.atlassian.net', '' when unknown (then links stay relative)
 * @property {'jira'|'confluence'|'rovo'|'trigger'} surface
 * @property {string|null} projectKey    from the extension context
 * @property {string|null} projectId
 * @property {string|null} issueKey
 * @property {string|null} contentId     Confluence page id (macro)
 */

/**
 * @template T
 * @typedef {{ok: true, data: T} | {ok: false, code: string, error: string, details?: any}} Result
 *   Every resolver returns this. `error` is a finished PRODUCT §8.6 sentence the UI can show as is.
 *   Build with lib/result.js `ok(data)` / `fail(code, error, details)`. Services THROW `AppError` (lib/result.js); the
 *   resolver wrapper turns it into `fail`. Unknown exceptions become ERROR.FAILED with the generic sentence.
 */

// ───────────────────────────────────────────── Part 4: module map ─────────────────────────────────────────────
// Each typedef below is the export list of one file. `Promise<…>` = async. Owner slice in brackets (docs/BUILD.md).

/**
 * src/domain/caseState.js  [A]
 * @typedef {Object} DomainCaseState
 * @property {(runs: Run[]) => Run|null} latestRun
 *   Latest by executedAt, ties by numeric id. [] → null.
 * @property {(latest: Run|null, staleReasons: StaleReason[]) => CaseState} caseState
 *   PRODUCT §3.1, first match wins. staleReasons are only looked at when latest.result is 'passed'.
 * @property {(requirements: {cases: {state: CaseState}[]}[]) => Counts} countStates
 * @property {(cases: {state: CaseState}[]) => 'no_case'|'all_passed'|'attention'} requirementState
 * @property {(input: {counts: Counts, totalCases: number, blockingConflicts: number, overdueConditions: number, request: Request|null, decided: {outcome: Outcome, decidedByName: string, decidedAt: IsoTime, number: number, conditionCount: number, openConditionCount: number}|null, now: IsoTime}) => {status: Readiness['status'], verdict: string, usualSheet: string|null}} verdict
 *   PRODUCT §4.1 precedence (failing → stale → unproven → conflicts → overdue → ready) and §8.4 wording.
 *   decided wins over request; an open request with nothing decided → 'awaiting_decision'.
 */

/**
 * src/domain/staleness.js  [A]
 * @typedef {Object} StaleInput
 * @property {Run} run                        the case's latest run (any result)
 * @property {HistoryEvent[]} requirementEvents
 * @property {HistoryEvent[]} caseEvents
 * @property {Record<string, HistoryEvent[]>} defectEvents   by defect key: defects linked to the requirement or the case
 * @property {string|null} criteriaField      settings.whatCounts.criteriaField
 * @property {string|null} currentBuild       release.build; null → S5 never fires
 * @property {IsoTime|null} buildSetAt
 * @property {Evidence[]|null} liveEvidence   the case issue's attachments now, hashed where possible; null = not checked → S6 never fires
 * @property {{requirementText: string, caseText: string}} live   for before/after
 * @property {IsoTime} now                    for date wording
 *
 * @typedef {Object} DomainStaleness
 * @property {(input: StaleInput) => StaleReason[]} staleReasons
 *   PRODUCT §3.2. T = run.executedAt; an event counts when event.at > T (strictly), is not `baseline`, is not `byApp`.
 *   S1 requirement 'text' events on summary / description / criteriaField. S2 case 'text' events on summary / description.
 *   S3 requirement status done → todo|in_progress. S4 a defect that was `done` at T (replay its status events up to T)
 *   and has a later done → not-done event. S5 currentBuild set and !== run.build. S6 a run.evidence attachmentId absent
 *   from liveEvidence, or present with a different non-null sha256.
 *   At most one reason per (code, issueKey): the earliest qualifying event. Sorted by code, then at.
 *   Returns reasons whatever run.result is; the caller uses them as stale reasons (passed) or notes (failed/blocked).
 */

/**
 * src/domain/duties.js  [A]
 * @typedef {Object} DutiesInput
 * @property {{key: string, caseKeys: string[], defectKeys: string[]}[]} requirements
 * @property {Record<string, HistoryEvent[]>} history   by issue key: every requirement and every linked defect, events sorted by `at`
 * @property {Run[]} runs                     every run on the release's cases (not only the latest)
 * @property {Person|null} approver
 * @property {Person|null} requester
 * @property {Settings['rules']} rules
 * @property {IsoTime} now
 *
 * @typedef {Object} DomainDuties
 * @property {(issueKey: string, events: HistoryEvent[], now: IsoTime) => Omit<DutyFact, 'requirementKey'>[]} buildersOfIssue
 *   PRODUCT §3.3: assignee at any moment the status category was in_progress (replay assignee × status events, baselines
 *   included), or the actor of a transition into `done`. `byApp` actors never count. One fact per (person, basis).
 * @property {(input: DutiesInput) => Duties} computeDuties
 *   Builders of a requirement = buildersOfIssue(requirement) ∪ buildersOfIssue(each linked defect).
 *   Testers = executedBy of any run on its cases. Conflicts D1–D4 with `blocking` from rules (D4 never blocks).
 *   People are compared by `id`. One conflict per (code, person, item).
 */

/**
 * src/domain/signingRules.js  [A]
 * @typedef {Object} DomainSigningRules
 * @property {(condition: {status: 'open'|'met', dueDate: IsoDate}, now: IsoTime) => 'open'|'met'|'overdue'} conditionState
 * @property {(input: {requirements: RequirementView[], defects: Defect[], conflicts: DutyConflict[], carried: Condition[], rules: Settings['rules']}) => OpenItem[]} openItems
 *   What stops plain acceptance, in brief order: stale, failed, blocked, not_run, no_case, blocking defects,
 *   blocking conflicts, overdue conditions (only when rules.overdueConditionBlocks). coveredBy is null here.
 *   A rule switched off removes the item from this list, never from the facts.
 * @property {(items: OpenItem[], conditions: Condition[], waivers: Waiver[]) => OpenItem[]} applyCoverage
 *   Fills coveredBy: a condition covers ids in its `covers` whose needs is 'condition'; a waiver covers its one id whose needs is 'waiver'.
 * @property {(items: OpenItem[]) => Availability} availability
 * @property {(input: {request: Request|null, actorId: string|null, outcome: Outcome, statement: string, affirmed: boolean, fingerprint: string, currentFingerprint: string, items: OpenItem[]}) => {ok: true} | {ok: false, code: string, error: string, details?: any}} validateDecision
 *   Order: B1, B3, statement, B2, then the outcome's bar (PRODUCT §3.4). Sentences from §8.6.
 * @property {(input: {covers: string, reason: string, authorisedById: string|null, authorisedByName: string|null, actorId: string, approverId: string, items: OpenItem[], settings: Settings}) => {ok: true} | {ok: false, code: string, error: string, details?: any}} validateWaiver
 * @property {(input: {text: string, ownerId: string|null, dueDate: IsoDate|null, covers: string[], items: OpenItem[]}) => {ok: true} | {ok: false, code: string, error: string, details?: any}} validateCondition
 * @property {(input: {result: string|null, build: string, notes: string, evidenceCount: number, rules: Settings['rules']}) => {ok: true} | {ok: false, code: string, error: string, details?: any}} validateRun
 */

/**
 * src/domain/canonicalJson.js  [A]
 * @typedef {Object} DomainCanonicalJson
 * @property {(value: any) => string} canonicalize
 *   RFC 8785: keys sorted by UTF-16 code units, no whitespace, ECMAScript string escaping. Integers only: throws
 *   TypeError on a non-integer number, on undefined, on a function, on NaN/Infinity.
 */

/**
 * src/domain/seal.js  [A]
 * @typedef {Object} DomainSeal
 * @property {Sha256} ZERO_SEAL               64 zeros
 * @property {(data: string|Uint8Array) => Sha256} sha256Hex
 * @property {(text: string) => Sha256} textHash
 *   sha256Hex of the text with CRLF → LF and trailing whitespace trimmed.
 * @property {(payload: RecordPayload) => {seal: Sha256, json: string}} sealPayload
 *   json = canonicalize(payload); seal = sha256Hex(json).
 * @property {(input: {site: string, project: {id: string, key: string}, release: Release, recordNumber: number, request: Request, decision: Decision, counts: Counts, requirements: RequirementView[], defects: Defect[], duties: Duties, conditions: Condition[], waivers: Waiver[], carried: Condition[], rules: Settings['rules'], prevSeal: Sha256}) => RecordPayload} buildPayload
 *   Pure assembly of PRODUCT §3.5: people → ids, texts → hashes, arrays sorted, null for absent values.
 */

/**
 * src/domain/verify.js  [A]
 * @typedef {Object} SealedValue  One value the record page prints and V2 compares.
 * @property {string} path                    stable id, e.g. 'decision.outcome', 'case.CLM-18.state', 'case.CLM-18.evidence.0.sha256', 'condition.3.text', 'seal'
 * @property {string} where                   human place: "Evidence table · Case CLM-18 · State at signing"
 * @property {string} value                   exactly the text printed in the page cell (ids, not display names, are never compared: names are not sealed)
 *
 * @typedef {Object} DomainVerify
 * @property {(payloadJson: string, seal: Sha256) => Check} verifySnapshot                                  V1
 * @property {(payload: RecordPayload, seal: Sha256) => SealedValue[]} sealedValues
 *   The full list for V2: decision outcome and statement; counts; per case: state, run result, executedAt, executedBy id,
 *   build, each evidence filename and sha256; each condition (text, owner id, dueDate); each waiver (coversLabel, reason,
 *   reference); seal; prevSeal. Values are plain strings; states and outcomes use the lozenge texts of this file.
 * @property {(expected: SealedValue[], found: Record<string, string>|null, page: {editedBy: Person|null, editedAt: IsoTime|null, version: number|null}|null) => {check: Check, differences: Difference[]}} comparePage   V2
 *   found = path → text read from the page; null = no page (check.ok null). A missing path is a difference with found null.
 * @property {(record: {number: number, seal: Sha256, prevSeal: Sha256}, previous: {number: number, seal: Sha256}|null, next: {number: number, prevSeal: Sha256}|null) => {check: Check, differences: Difference[]}} verifyChain   V3
 *   previous null is right only for number 1 with prevSeal = ZERO_SEAL.
 * @property {(payload: RecordPayload, live: Record<string, Evidence[]>|null) => {check: Check, differences: Difference[]}} verifyEvidence   V4
 *   live = case key → attachments now; null = not checked (check.ok null). A sealed sha256 of null is compared by id only.
 * @property {(checks: {snapshot: Check, page: Check, chain: Check, evidence: Check}) => 'intact'|'broken'|'intact_evidence_missing'} overallResult
 *   broken if any of V1–V3 has ok === false; else intact_evidence_missing if V4 ok === false; else intact. null never breaks.
 */

/**
 * src/domain/briefFingerprint.js  [A]
 * @typedef {Object} DomainBriefFingerprint
 * @property {(facts: {release: {id: string, build: string|null}, requestId: string|null, approverId: string|null, counts: Counts, requirements: RequirementView[], defects: Defect[], conflicts: DutyConflict[], carried: Condition[], drafts?: {conditions: Condition[], waivers: Waiver[]}, rules?: Settings['rules']}) => Sha256} briefFingerprint
 *   sha256 of canonical JSON of: release id + build, request id, approver id, counts, per requirement {key, textHash,
 *   cases: [{key, state, runId, staleCodes}]}, open defects {key, status, priority}, conflict ids, carried {id, state},
 *   the draft conditions and waivers of the request, and the rules in force. Nothing time-of-assembly dependent.
 */

/**
 * src/data/schema.js  [skeleton]  — the single source of the SQL schema.
 * @typedef {Object} DataSchema
 * @property {{id: string, sql: string}[]} MIGRATIONS   applied in order; ids never change; add new ones at the end
 * @property {string[]} TABLES
 */

/**
 * src/data/db.js  [B]
 * @typedef {Object} DataDb
 * @property {() => Promise<string[]>} migrate           scheduled-trigger handler and direct call; returns applied migration ids
 * @property {() => Promise<void>} ensureMigrated        once per warm container; every repo function awaits it first
 * @property {(sql: string, params?: any[]) => Promise<any[]>} query        SELECT → rows
 * @property {(sql: string, params?: any[]) => Promise<{insertId: string|null, affectedRows: number}>} execute
 */

/**
 * src/data/people.js  [B]   table `people`
 * @typedef {Object} DataPeople
 * @property {(people: (Person & {title?: string|null})[]) => Promise<void>} upsertPeople
 * @property {(ids: string[]) => Promise<Record<string, Person>>} getPeople
 *   Ids not in the table: sample ids → {id, name: id, kind: 'sample'}; others are left out (the caller asks clients/jira getUsers and upserts).
 * @property {(kind: 'jira'|'sample') => Promise<Person[]>} listPeople
 * @property {() => Promise<number>} deleteSamplePeople
 */

/**
 * src/data/cases.js  [B]   table `cases`
 * @typedef {Object} DataCases
 * @property {(c: {caseKey: string, caseId: string, projectKey: string, requirementKey: string, markedBy: string, markedAt: IsoTime, sample: boolean}) => Promise<void>} upsertCase
 * @property {(caseKey: string) => Promise<{caseKey: string, caseId: string, projectKey: string, requirementKey: string}|null>} getCase
 * @property {(projectKey: string) => Promise<{caseKey: string, caseId: string, projectKey: string, requirementKey: string}[]>} listCases
 * @property {(requirementKeys: string[]) => Promise<{caseKey: string, caseId: string, projectKey: string, requirementKey: string}[]>} listCasesForRequirements
 * @property {(projectKey: string) => Promise<number>} deleteCasesOfProject
 */

/**
 * src/data/builds.js  [B]   table `builds` (append-only; the current build is the latest row of a release)
 * @typedef {Object} DataBuilds
 * @property {(b: {projectKey: string, releaseId: string, build: string, setBy: string, setAt: IsoTime}) => Promise<void>} addBuild
 * @property {(releaseIds: string[]) => Promise<Record<string, {build: string, setBy: string, setAt: IsoTime}>>} currentBuilds
 * @property {(projectKey: string) => Promise<number>} deleteBuildsOfProject
 */

/**
 * src/data/runs.js  [B]   tables `runs` + `evidence`
 * @typedef {Object} NewRun
 * @property {string} projectKey
 * @property {string} releaseId
 * @property {string} caseKey
 * @property {string} requirementKey
 * @property {RunResult} result
 * @property {string} notes
 * @property {string} build
 * @property {string} environment
 * @property {IsoTime} executedAt
 * @property {string} executedBy            Person id
 * @property {Evidence[]} evidence
 * @property {RunSnapshot} snapshot
 * @property {boolean} sample
 *
 * @typedef {Object} DataRuns
 * @property {(run: NewRun) => Promise<string>} insertRun                       returns the run id
 * @property {(caseKeys: string[]) => Promise<Run[]>} listRunsForCases          every run, evidence and people resolved (data/people getPeople), oldest first
 * @property {(runId: string) => Promise<Run|null>} getRun
 * @property {(projectKey: string) => Promise<number>} deleteRunsOfProject      sample remover only
 */

/**
 * src/data/requests.js  [B]   table `requests`
 * @typedef {Object} DataRequests
 * @property {(r: {projectKey: string, releaseId: string, releaseName: string, requestedBy: string, requestedAt: IsoTime, approver: string, dueDate: IsoDate, note: string, taskKey: string|null, sample: boolean}) => Promise<string>} insertRequest
 * @property {(id: string) => Promise<Request|null>} getRequest
 * @property {(projectKey: string, releaseId: string) => Promise<Request|null>} getOpenRequest
 * @property {(projectKey: string) => Promise<Request[]>} listRequests
 * @property {(id: string, patch: {state: 'decided'|'withdrawn', recordId?: string|null, closedAt: IsoTime}) => Promise<void>} closeRequest
 * @property {(projectKey: string) => Promise<number>} deleteRequestsOfProject
 */

/**
 * src/data/records.js  [B]   table `records`
 * @typedef {Object} DataRecords
 * @property {(r: {projectKey: string, number: number, releaseId: string, releaseName: string, outcome: Outcome, decidedBy: string, decidedAt: IsoTime, seal: Sha256, prevSeal: Sha256, payloadJson: string, sample: boolean}) => Promise<string>} insertRecord
 *   Fails (throws) when (projectKey, number) already exists: that is the guard against two people sealing at once.
 * @property {(id: string) => Promise<AcceptanceRecord|null>} getRecord
 * @property {(projectKey: string, number: number) => Promise<AcceptanceRecord|null>} getRecordByNumber
 * @property {(pageId: string) => Promise<AcceptanceRecord|null>} getRecordByPage
 * @property {(projectKey: string) => Promise<AcceptanceRecord[]>} listRecords     ascending by number
 * @property {(projectKey: string) => Promise<AcceptanceRecord|null>} latestRecord
 * @property {(id: string, page: {pageId: string|null, pageUrl: string|null, pageStatus: 'published'|'failed'|'none', pageError: string|null}) => Promise<void>} setRecordPage
 *   The ONLY update allowed on a record row. payload_json, seal and prev_seal are never updated.
 * @property {(projectKey: string) => Promise<number>} deleteRecordsOfProject
 */

/**
 * src/data/conditions.js  [B]   table `conditions`
 * @typedef {Object} DataConditions
 * @property {(c: {id?: string, projectKey: string, requestId: string|null, recordId?: string|null, recordNumber?: number|null, releaseName?: string|null, text: string, owner: string, dueDate: IsoDate, covers: string[], linkedIssue: string|null, status?: 'open'|'met', metAt?: IsoTime|null, metBy?: string|null, sample?: boolean}) => Promise<string>} saveCondition
 *   Insert, or update a DRAFT (record_id IS NULL) when id is given. Returns the id.
 * @property {(id: string) => Promise<Condition|null>} getCondition
 * @property {(requestId: string) => Promise<Condition[]>} listDraftConditions
 * @property {(id: string) => Promise<void>} deleteDraftCondition                  no-op once sealed
 * @property {(requestId: string, record: {recordId: string, recordNumber: number, releaseName: string}) => Promise<void>} attachConditionsToRecord
 * @property {(recordId: string) => Promise<Condition[]>} listConditionsOfRecord
 * @property {(projectKey: string) => Promise<Condition[]>} listSealedConditions   every sealed condition of the project, by record number then id
 * @property {(id: string, met: {metAt: IsoTime, metBy: string}) => Promise<void>} markConditionMet
 * @property {(id: string, linkedIssue: string) => Promise<void>} setConditionIssue
 * @property {(projectKey: string) => Promise<number>} deleteConditionsOfProject
 *   `state` on returned Conditions is computed with domain/signingRules conditionState and lib/format nowIso().
 */

/**
 * src/data/waivers.js  [B]   table `waivers`
 * @typedef {Object} DataWaivers
 * @property {(w: {id?: string, projectKey: string, requestId: string|null, recordId?: string|null, covers: string, coversLabel: string, reason: string, authorisedBy: string|null, authorisedByName: string|null, reference: string, recordedBy: string, recordedAt: IsoTime, selfRecorded: boolean}) => Promise<string>} saveWaiver
 * @property {(id: string) => Promise<Waiver|null>} getWaiver
 * @property {(requestId: string) => Promise<Waiver[]>} listDraftWaivers
 * @property {(id: string) => Promise<void>} deleteDraftWaiver
 * @property {(requestId: string, recordId: string) => Promise<void>} attachWaiversToRecord
 * @property {(recordId: string) => Promise<Waiver[]>} listWaiversOfRecord
 * @property {(projectKey: string) => Promise<number>} deleteWaiversOfProject
 */

/**
 * src/data/ledger.js  [B]   table `ledger` (sample history) and table `issue_changes` (what the product-event trigger saw)
 * @typedef {Object} DataLedger
 * @property {(projectKey: string, events: HistoryEvent[]) => Promise<void>} insertLedgerEvents     source is forced to 'sample'
 * @property {(issueKeys: string[]) => Promise<HistoryEvent[]>} listLedgerEvents                    people resolved, sorted by at
 * @property {(projectKey: string) => Promise<number>} deleteLedgerOfProject
 * @property {(c: {projectKey: string, issueKey: string, changedAt: IsoTime, actor: string|null, fields: string[]}) => Promise<void>} insertIssueChange
 * @property {(issueKeys: string[], since?: IsoTime) => Promise<{issueKey: string, changedAt: IsoTime, actor: string|null, fields: string[]}[]>} listIssueChanges
 */

/**
 * src/data/settings.js  [B]   KVS only
 * @typedef {Object} DataSettings
 * @property {(projectKey: string) => Promise<Settings>} getSettings                 deep-merged over DEFAULT_SETTINGS
 * @property {(projectKey: string, settings: Settings, by: string) => Promise<Settings>} saveSettings   also appends {by, at, from, to} per changed rule to `settings-log:<projectKey>`
 * @property {() => Promise<SampleStatus>} getSampleStatus                           {loaded:false, …nulls, []} when absent
 * @property {(status: SampleStatus) => Promise<void>} setSampleStatus
 * @property {() => Promise<{spaceId: string, spaceKey: string, parentPageId: string|null}|null>} getRecordsSpace
 * @property {(space: {spaceId: string, spaceKey: string, parentPageId: string|null}|null) => Promise<void>} setRecordsSpace
 */

/**
 * src/clients/jira.js  [B]
 * Reads run `asApp()` unless `opts.asUser` is true. Writes a person is responsible for (create case, mark case, create
 * task, the loader's "your own history" step) pass `{asUser: true}` so Jira's changelog names the person.
 * Every function throws `AppError(ERROR.FORBIDDEN | ERROR.NOT_FOUND | ERROR.FAILED, sentence)` on a non-2xx answer.
 * @typedef {{asUser?: boolean}} CallOpts
 * @typedef {Object} RawChange  One Jira changelog entry, untouched.
 * @property {IsoTime} at
 * @property {{accountId: string, displayName: string, accountType: string}} author
 * @property {{field: string, fieldId: string|null, from: string|null, to: string|null, fromString: string|null, toString: string|null}[]} items
 *
 * @typedef {Object} ClientJira
 * @property {() => Promise<Person>} getMyself                                       always as the user
 * @property {(accountIds: string[]) => Promise<Person[]>} getUsers                  unknown ids are skipped
 * @property {(keyOrId: string) => Promise<{id: string, key: string, name: string}|null>} getProject   null when absent
 * @property {(p: {key: string, name: string, leadAccountId: string}) => Promise<{id: string, key: string}>} createProject   TECH §3(4) template
 * @property {(keyOrId: string) => Promise<void>} deleteProject
 * @property {(projectKey: string) => Promise<{id: string, name: string, projectId: string, released: boolean, releaseDate: IsoDate|null}[]>} listVersions
 * @property {(v: {projectId: string, name: string, released?: boolean, releaseDate?: IsoDate|null}) => Promise<{id: string, name: string}>} createVersion
 * @property {(projectKey: string) => Promise<Record<string, StatusCategory>>} getStatusCategories   status id AND status name → category
 * @property {(jql: string, opts?: CallOpts & {criteriaField?: string|null}) => Promise<Issue[]>} searchIssues   follows nextPageToken to the end
 * @property {(keys: string[], opts?: CallOpts & {criteriaField?: string|null}) => Promise<Issue[]>} getIssues   missing keys are skipped
 * @property {(key: string, opts?: CallOpts & {criteriaField?: string|null}) => Promise<Issue|null>} getIssue
 * @property {(issues: {projectKey: string, type: string, summary: string, description?: string, fixVersion?: string|null, labels?: string[], priority?: string|null, assigneeId?: string|null}[], opts?: CallOpts) => Promise<{id: string, key: string}[]>} createIssues   bulk, in the given order (keys are sequential in a new project)
 * @property {(key: string, fields: {summary?: string, description?: string, assigneeId?: string|null, fixVersion?: string|null, labels?: string[]}, opts?: CallOpts) => Promise<void>} updateIssue
 * @property {(key: string, category: StatusCategory, opts?: CallOpts) => Promise<boolean>} transitionTo   first available transition into that category; false when none
 * @property {(link: {type: string, inwardKey: string, outwardKey: string}, opts?: CallOpts) => Promise<void>} linkIssues
 * @property {() => Promise<string[]>} listLinkTypes                                 link type names on the site
 * @property {(keys: string[]) => Promise<Record<string, RawChange[]>>} getChangelogs   bulk fetch, all pages, oldest first per issue; throws AppError(ERROR.HISTORY_UNREADABLE) on failure
 * @property {(key: string) => Promise<{case: boolean, requirementKey: string}|null>} getCaseProperty
 * @property {(key: string, value: {case: boolean, requirementKey: string}) => Promise<void>} setCaseProperty
 * @property {(issueKey: string, filename: string, content: string, mime: string) => Promise<Attachment|null>} addAttachment   loader only; null when the upload is not possible
 * @property {(attachmentId: string) => Promise<Sha256|null>} hashAttachment         reads the bytes and hashes them; null when they cannot be read (SPEC §2.10)
 * @property {(keys: string[]) => Promise<Record<string, Evidence[]>>} liveEvidence  per issue: its attachments now, each hashed with hashAttachment
 */

/**
 * src/clients/confluence.js  [B]   REST v2, as the app (TECH §3(2)). Every function returns null / false / [] instead of
 * throwing when Confluence is not installed or answers 401/403/404; other failures throw AppError(ERROR.CONFLUENCE, reason).
 * @typedef {Object} ConfluencePage
 * @property {string} id
 * @property {string} title
 * @property {string} spaceId
 * @property {string} storage                body in storage format
 * @property {number} version
 * @property {string|null} versionAuthorId
 * @property {IsoTime|null} versionAt
 * @property {string} url                    `/wiki/spaces/<key>/pages/<id>` or the `_links.webui` path prefixed with /wiki
 *
 * @typedef {Object} ClientConfluence
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => Promise<{id: string, key: string, name: string}[]>} listSpaces
 * @property {(key: string) => Promise<{id: string, key: string, name: string, homepageId: string|null}|null>} getSpaceByKey
 * @property {(s: {key: string, name: string}) => Promise<{id: string, key: string, name: string, homepageId: string|null}|null>} createSpace
 * @property {(spaceId: string, title: string) => Promise<ConfluencePage|null>} findPageByTitle
 * @property {(p: {spaceId: string, parentId?: string|null, title: string, storage: string}) => Promise<ConfluencePage|null>} createPage
 * @property {(pageId: string) => Promise<ConfluencePage|null>} getPage
 * @property {(pageId: string, p: {title: string, storage: string, version: number, message?: string}) => Promise<ConfluencePage|null>} updatePage   version = the NEW version number
 * @property {(pageId: string) => Promise<PageSealProperty|null>} getSealProperty
 * @property {(pageId: string, value: PageSealProperty) => Promise<boolean>} setSealProperty   creates or updates
 * @property {(pageId: string) => Promise<boolean>} setFullWidth   shows the page full width (view and editor); never throws
 * @property {(pageId: string) => Promise<boolean>} deletePage   DELETE /wiki/api/v2/pages/{id} (moves it to the trash); false when absent or refused. Sample remover only.
 */

/**
 * src/clients/graph.js  [B]   Teamwork Graph, curated queries only, always as the user (TECH §3(9)).
 * NEVER throws. Operation names look like `faircopy_linkedwork`. Only scope: read:graph:issue:jira.
 * @typedef {Object} ClientGraph
 * @property {(cloudId: string, issues: {id: string, key: string}[], request?: (query: string, variables: {id: string}) => Promise<any>) => Promise<GraphAnswer>} linkedWork
 *   jiraWorkItemHierarchy (issue links, outward only) + jiraWorkItemLinkedExternalDeployments +
 *   jiraWorkItemDevelopmentArtifacts per issue (capped at 20 issues). Errors and no data → 'failed'.
 * @property {(body: any) => Record<string, any>|null} dataOf    pure: the data of one answer body, null when it is a failure
 * @property {(issue: {key: string}, data: Record<string, any>) => LinkedWork[]} rowsOf    pure: one answer → rows
 * @property {(answer: GraphAnswer|null, release: {requirementKeys: string[], releaseKeys: string[]}) => GraphContext} graphContext
 *   pure: rows → the line, the note, the agent's sentence and the rows worth showing (outside the release, development work)
 */

/**
 * src/history/provider.js  [B]
 * @typedef {Object} HistoryProvider
 * @property {(issues: Issue[], opts?: {criteriaField?: string|null}) => Promise<Record<string, HistoryEvent[]>>} getHistory
 *   For each issue: baseline events + normalised Jira changelog + sample ledger rows, merged and sorted by `at`
 *   (ties: baseline first, then ledger, then Jira). Every issue key is present in the result ([] when nothing).
 *   Throws AppError(ERROR.HISTORY_UNREADABLE, "We could not read the history of {key}, …") when the changelog call fails.
 * @property {(issue: Issue, changes: RawChange[], categories: Record<string, StatusCategory>, criteriaField?: string|null) => HistoryEvent[]} normaliseChangelog
 *   Pure. Emits the two baselines (first status category / first assignee, derived from the first change's `from`, else
 *   the issue's current value) at issue.created, then one event per changelog item. `byApp` = author.accountType === 'app'.
 */

/**
 * src/services/readiness.js  [D]
 * @typedef {Object} ServiceReadiness
 * @property {(ctx: Ctx) => Promise<Bootstrap>} getBootstrap
 * @property {(ctx: Ctx, q: {projectKey: string, releaseId?: string|null, releaseName?: string|null, approverId?: string|null}) => Promise<Readiness>} getReadiness
 *   The one place that loads Jira issues, cases, runs, history, builds, conditions and requests and runs the domain rules.
 *   releaseId and releaseName both empty → Bootstrap.defaultReleaseId. approverId overrides whose duties are checked.
 * @property {(ctx: Ctx, q: {projectKey: string, releaseId: string, build: string}) => Promise<{release: string, previousBuild: string|null, build: string, nowStale: string[]}>} setBuild
 */

/**
 * src/services/cases.js  [D]   issue panel
 * @typedef {Object} ServiceCases
 * @property {(ctx: Ctx, q: {issueKey: string}) => Promise<Panel>} getPanel
 * @property {(ctx: Ctx, q: {issueKey: string, requirementKey: string}) => Promise<Panel>} markCase
 *   Writes table `cases`, the issue property and the `acceptance-case` label; links the two issues when a 'Relates' type exists.
 * @property {(ctx: Ctx, q: {projectKey: string, releaseId: string, requirementKey: string, summary: string, steps: string}) => Promise<{caseKey: string}>} addCase
 * @property {(ctx: Ctx, q: {caseKey: string, result: RunResult, build: string, environment: string, notes: string, attachmentIds: string[]}) => Promise<{run: Run, state: CaseState, flag: string, builderWarning: string|null}>} recordRun
 *   executedBy is ctx.accountId, never an input. Snapshot and evidence hashes are taken here. flag: "Run recorded. CLM-22 is now Passed."
 */

/**
 * src/services/requests.js  [D]
 * @typedef {Object} ServiceRequests
 * @property {(ctx: Ctx, q: {projectKey: string, releaseId: string, approverId: string}) => Promise<{conflicts: DutyConflict[]}>} checkApprover
 * @property {(ctx: Ctx, q: {projectKey: string, releaseId: string, approverId: string, dueDate: IsoDate, note: string, createTask: boolean}) => Promise<Request>} requestSignoff
 * @property {(ctx: Ctx, q: {requestId: string}) => Promise<Request>} withdrawRequest
 */

/**
 * src/services/brief.js  [D]
 * @typedef {Object} ServiceBrief
 * @property {(ctx: Ctx, q: {projectKey: string, releaseId?: string|null, releaseName?: string|null}) => Promise<Brief>} getBrief
 *   getReadiness + sections + fingerprint + drafts + graph enrichment (clients/graph, silent on failure).
 */

/**
 * src/services/signing.js  [D]
 * @typedef {Object} ServiceSigning
 * @property {(ctx: Ctx, q: {requestId: string, id?: string|null, text: string, covers: string[], ownerId: string, dueDate: IsoDate, createIssue: boolean}) => Promise<Condition>} saveCondition
 * @property {(ctx: Ctx, q: {requestId: string, id: string}) => Promise<void>} deleteCondition
 * @property {(ctx: Ctx, q: {requestId: string, id?: string|null, covers: string, reason: string, authorisedById?: string|null, authorisedByName?: string|null, reference?: string}) => Promise<Waiver>} saveWaiver
 * @property {(ctx: Ctx, q: {requestId: string, id: string}) => Promise<void>} deleteWaiver
 * @property {(ctx: Ctx, q: {requestId: string, outcome: Outcome, statement: string, affirmed: boolean, fingerprint: string}) => Promise<{record: RecordSummary, flag: string}>} sign
 *   Rebuilds the brief, validateDecision, buildPayload, sealPayload, insertRecord, attach drafts, close the request,
 *   create condition issues when asked, then records.publishPage (a page failure never undoes the seal).
 *   Throws AppError(ERROR.B2_BRIEF_CHANGED, …, {brief}) when the fingerprint differs.
 */

/**
 * src/services/records.js  [D]
 * @typedef {Object} ServiceRecords
 * @property {(ctx: Ctx, q: {projectKey: string}) => Promise<{records: RecordSummary[], chainLine: string}>} listRecords   newest first; "Record 2 → Record 1 → start."
 * @property {(ctx: Ctx, q: {recordId: string}) => Promise<{record: AcceptanceRecord, summary: RecordSummary, people: Record<string, Person>, conditions: Condition[], waivers: Waiver[]}>} getRecord
 * @property {(ctx: Ctx, q: {recordId: string}) => Promise<RecordSummary>} publishPage
 *   Creates (or re-creates) the page under "Acceptance records" in the records space (settings.records.spaceKey, else the
 *   app's own space, created on first use), writes the seal page property, stores page id/status on the record.
 *   Never throws for Confluence trouble: stores pageStatus 'failed' + pageError and returns.
 * @property {(ctx: Ctx, q: {recordId: string}) => Promise<RecordSummary>} restorePage   new page version from the payload; history keeps the edited one
 * @property {(record: AcceptanceRecord, people: Record<string, Person>, sealedValues: SealedValue[]) => string} renderRecordPage
 *   Pure. Storage-format body (PRODUCT §4.4) with the seal macro at the top. Every SealedValue is printed in an element
 *   that extractPageValues can find again by its path.
 * @property {(storage: string) => {values: Record<string, string>, hasSealPanel: boolean}} extractPageValues
 *   Pure. The inverse of renderRecordPage: path → text now on the page.
 */

/**
 * src/services/verify.js  [D]
 * @typedef {Object} ServiceVerify
 * @property {(ctx: Ctx, q: {recordId?: string|null, projectKey?: string|null, recordNumber?: number|null, pageId?: string|null}) => Promise<VerifyResult>} verifyRecord
 *   Identify the record by recordId, or projectKey (+ recordNumber, default latest), or pageId. V1–V4 + changedSinceSigning.
 * @property {(ctx: Ctx, q: {projectKey: string}) => Promise<VerifyResult[]>} verifyAll   every record, ascending
 */

/**
 * src/services/conditions.js  [D]
 * @typedef {Object} ServiceConditions
 * @property {(ctx: Ctx, q: {projectKey: string, beforeNumber?: number|null}) => Promise<CarriedGroup[]>} listCarried
 * @property {(ctx: Ctx, q: {conditionId: string}) => Promise<Condition>} confirmConditionMet
 * @property {(ctx: Ctx, q: {projectKey: string, state?: 'open'|'met'|'overdue'|'all'}) => Promise<Condition[]>} listConditions
 */

/**
 * src/services/settings.js  [D]
 * @typedef {Object} ServiceSettings
 * @property {(ctx: Ctx, q: {projectKey: string}) => Promise<{settings: Settings, sample: SampleStatus, confluence: {available: boolean, spaceKey: string|null}}>} getSettings
 * @property {(ctx: Ctx, q: {projectKey: string, settings: Settings}) => Promise<Settings>} saveSettings
 * @property {(ctx: Ctx) => Promise<{key: string, name: string}[]>} listSpaces
 * @property {(ctx: Ctx, q: {spaceKey: string|null}) => Promise<{ok: boolean, message: string}>} testConnection
 */

/**
 * src/sample/dataset.js  [C]   DOMAIN §4 verbatim, as data. Dates are offsets in whole days from day zero plus a UTC time.
 * @typedef {Object} SampleDataset
 * @property {IsoDate} d0                                 '2026-12-09'
 * @property {{key: string, name: string}} project        CLM / ClaimPoint
 * @property {{key: string, name: string}} space          CLMACC / ClaimPoint Acceptance
 * @property {{id: string, name: string, title: string}[]} people          id = 'sample:P1' … 'sample:P10'
 * @property {{name: string, released: boolean, releaseDay: number}[]} versions
 * @property {{ref: number, role: 'requirement'|'case'|'defect'|'followup', type: string, summary: string, description: string, version: string|null, status: StatusCategory, priority: string|null, tests: number|null, links: {type: string, to: number}[]}[]} issues   ref n → CLM-n, in creation order
 * @property {{ref: number, kind: HistoryEvent['kind'], field: string, from: string|null, to: string|null, fromText?: string|null, toText?: string|null, day: number, time: string, actor: string}[]} ledger   reporter, assignee, status and text history of every issue
 * @property {{id: string, caseRef: number, day: number, time: string, tester: string, build: string, environment: string, result: RunResult, file: string, note: string, requirementText?: string}[]} runs   R-01 … R-14, the 2.3 runs and R-2.5-1; `file` is the test log attached as evidence (dataset.evidenceLog)
 * @property {{release: string, outcome: Outcome, day: number, time: string, approver: string, requestedBy: string, statement: string, conditions: {text: string, owner: string, dueDay: number, linkedRef: number|null, met: {day: number, by: string, note?: string}|null}[]}} record1
 * @property {{release: string, requestedBy: string, day: number, time: string, dueDay: number, note: string, drafts: {proposedBy: string, condition: {text: string, owner: string, dueDay: number, coversRefs: number[]}, waiver: {code: string, itemRef: number, reason: string, recordedBy: string, authorisedBy: string}}}} request   the open request for 2.4 and what the test lead proposes with it (dataset.sampleDrafts)
 * @property {{counts: Counts, usualSheetPasses: number, stale: Record<string, string>, openDefects: string[], conflictPerson: string}} oracle   DOMAIN §4.5: {proven: 8, stale: 3, failing: 0, unproven: 1}
 *
 * src/sample/loader.js  [C]
 * @typedef {Object} SampleLoader
 * @property {(ctx: Ctx) => Promise<SampleLoadResult>} loadSample
 *   Runs in phases over several calls (see SampleLoadResult); each call writes the checkpoint to SampleStatus. In order:
 *   1 create project CLM (lead = ctx.accountId) or throw AppError(ERROR.SAMPLE_LOADED) · 2 versions 2.3 (released), 2.4 and 2.5
 *   · 3 issues in order (so keys are CLM-1…CLM-29; 2.5 is CLM-25…CLM-29), links, statuses · 4 people, cases, runs (with snapshots and small test
 *   logs as evidence files attached to the case issues, hashed), ledger — every dataset day is shifted so that d0 = TODAY (UTC)
 *   · 5 Record 1 for 2.3 (approver Grace Whitlock; request, decision, 2 conditions: one met, one open and overdue) sealed
 *   with domain/seal and published with services/records.publishPage · 6 "your own history": assign CLM-24 to ctx.accountId
 *   and move it to In Progress AS THE USER, so the installing person is a builder of CLM-9 from real Jira history and gets
 *   one D1 conflict when named approver · 7 an open sign-off request for 2.4 from the sample test lead to ctx.accountId
 *   (its Jira task is CLM-30) · 8 the drafts the test lead proposes on that request: one condition covering the open cases
 *   and one waiver for the approver's own conflict, recorded by the test lead and authorised by the quality officer
 *   (dataset.sampleDrafts over the brief's own open items; a failure here is logged and the load goes on)
 *   · 9 setSampleStatus with loaded: true. Every text is written with the real project key (dataset.rekey / rekeyDeep).
 *   Writes to Jira go a few at a time (status changes two at a time). A phase that Jira refuses with a 5xx or a 429 is
 *   not the end: the call answers pending and the phase runs again in the next call; the load is given up when the same
 *   phase was refused three times, or on any other failure (sample/retry.js). Giving up: removeSample, then throw
 *   AppError(ERROR.SAMPLE_FAILED, sentence) where the sentence is "Jira refused a change. It does this now and then on
 *   a site that was created a few minutes ago. Nothing was left behind. Try again." or "The sample could not be loaded:
 *   {the app's own reason}. Anything created has been removed." — never the raw answer of Jira (that is logged).
 *   Each call starts a new phase only in its first 9 s (a function is stopped at 25 s): bulk create, no per-issue
 *   changelog reads. One loader at a time (data/locks): a call made while another runs answers pending with the progress.
 *
 * src/sample/remover.js  [C]
 * @typedef {Object} SampleRemover
 * @property {(ctx: Ctx) => Promise<{issues: number, releases: number, records: number, flag: string}>} removeSample
 *   Deletes project CLM and every app row of that project (runs, evidence, cases, builds, requests, records, conditions,
 *   waivers, ledger, sample people), clears the KVS flag. Deletes every Confluence page in SampleStatus.pageIds with
 *   clients/confluence deletePage (scope delete:page:confluence); a page that cannot be deleted is skipped, never fatal.
 *   flag: "Sample data removed. {n} issues, 2 releases and 1 record deleted."
 */

/**
 * src/events.js  [D]
 * @typedef {Object} Events
 * @property {(event: {issue: {id: string, key: string, fields?: any}, changelog?: {items: {field: string, fieldId?: string, fromString?: string|null, toString?: string|null}[]}, atlassianId?: string}, context: any) => Promise<void>} onIssueChanged
 *   avi:jira:updated:issue. Stores one `issue_changes` row (data/ledger insertIssueChange) for issues in a project that has
 *   cases. Never throws. The changelog stays the source of truth; this only makes staleness visible within seconds.
 */

// ───────────────────────────────────────────── Part 5: resolvers ─────────────────────────────────────────────

/**
 * invoke name → [request payload, response data]. Every response is wrapped: `Result<data>`.
 * src/resolvers/index.js [D] defines exactly these names; src/frontend [E] calls exactly these names.
 *
 * @typedef {Object} InvokeMap
 * @property {[{}, Bootstrap]} getBootstrap
 * @property {[{}, SampleLoadResult]} loadSample
 * @property {[{}, {issues: number, releases: number, records: number, flag: string}]} removeSample
 * @property {[{projectKey: string, releaseId?: string|null}, Readiness]} getReadiness
 * @property {[{projectKey: string, releaseId: string, build: string}, {release: string, previousBuild: string|null, build: string, nowStale: string[]}]} setBuild
 * @property {[{issueKey: string}, Panel]} getPanel
 * @property {[{issueKey: string, requirementKey: string}, Panel]} markCase
 * @property {[{projectKey: string, releaseId: string, requirementKey: string, summary: string, steps: string}, {caseKey: string}]} addCase
 * @property {[{caseKey: string, result: RunResult, build: string, environment: string, notes: string, attachmentIds: string[]}, {run: Run, state: CaseState, flag: string, builderWarning: string|null}]} recordRun
 * @property {[{projectKey: string, releaseId: string, approverId: string}, {conflicts: DutyConflict[]}]} checkApprover
 * @property {[{projectKey: string, releaseId: string, approverId: string, dueDate: IsoDate, note: string, createTask: boolean}, Request]} requestSignoff
 * @property {[{requestId: string}, Request]} withdrawRequest
 * @property {[{projectKey: string, releaseId?: string|null}, Brief]} getBrief
 * @property {[{requestId: string, id?: string|null, text: string, covers: string[], ownerId: string, dueDate: IsoDate, createIssue: boolean}, Condition]} saveCondition
 * @property {[{requestId: string, id: string}, {}]} deleteCondition
 * @property {[{requestId: string, id?: string|null, covers: string, reason: string, authorisedById?: string|null, authorisedByName?: string|null, reference?: string}, Waiver]} saveWaiver
 * @property {[{requestId: string, id: string}, {}]} deleteWaiver
 * @property {[{requestId: string, outcome: Outcome, statement: string, affirmed: boolean, fingerprint: string}, {record: RecordSummary, flag: string}]} sign
 *   errors: B1, B2 (details.brief = fresh Brief), B3, invalid, not_signable (details.uncovered = OpenItem[])
 * @property {[{projectKey: string}, {records: RecordSummary[], chainLine: string}]} listRecords
 * @property {[{recordId: string}, {record: AcceptanceRecord, summary: RecordSummary, people: Record<string, Person>, conditions: Condition[], waivers: Waiver[]}]} getRecord
 * @property {[{recordId: string}, VerifyResult]} verifyRecord
 * @property {[{projectKey: string}, VerifyResult[]]} verifyAll
 * @property {[{pageId?: string|null}, VerifyResult]} verifyPage
 *   Confluence macro: pageId defaults to the page the macro sits on (ctx.contentId). not_found when the page is no record.
 * @property {[{recordId: string}, RecordSummary]} publishPage
 * @property {[{recordId: string}, RecordSummary]} restorePage
 * @property {[{conditionId: string}, Condition]} confirmConditionMet
 * @property {[{projectKey: string}, {settings: Settings, sample: SampleStatus, confluence: {available: boolean, spaceKey: string|null}}]} getSettings
 * @property {[{projectKey: string, settings: Settings}, Settings]} saveSettings
 * @property {[{}, {key: string, name: string}[]]} listSpaces
 * @property {[{spaceKey: string|null}, {ok: boolean, message: string}]} testConnection
 */

// ───────────────────────────────────────────── Part 6: actions ─────────────────────────────────────────────

/**
 * src/actions.js  [F]   Rovo agent, rovo:skill and rovo:mcp all call these three. Read-only. They call services with a
 * Ctx built from the action context (surface 'rovo'); the caller's account comes from the context, never from an input.
 * On any error return `{error: sentence}` — never throw, never invent data.
 *
 * @typedef {{label: string, url: string}} Citation
 *
 * @typedef {Object} ActionStatusInput      action key `get-acceptance-status` → export `status`
 * @property {string} projectKey
 * @property {string} [release]             version name; empty = Bootstrap.defaultReleaseId (earliest unreleased version
 *                                          that has cases and is not yet decided)
 * @typedef {Object} ActionStatusOutput
 * @property {string} release
 * @property {string|null} releaseChosenLine   null when the caller named the release; else one ready sentence: which
 *   release was chosen and, when an earlier unreleased release is already decided, that it is
 * @property {string|null} build
 * @property {string|null} [decidedLine]    the whole first line when verdict is 'signed' ("Already decided. …"), else null
 * @property {'ready'|'not_ready'|'signed'} verdict
 * @property {boolean} accepted             true only when a sealed decision for this release is accepted or accepted with conditions
 * @property {boolean} signable             plain acceptance is available now
 * @property {Counts} counts
 * @property {number} blockerCount         every open item, also one with a condition or a waiver proposed for it (a
 *                                          proposal is not a decision); `coveredCount` says how many have one proposed
 * @property {string} sentence              the Readiness verdict sentence, then `openLine` when something is open
 * @property {string|null} [openLine]       "5 things are open; a condition or a waiver is proposed for each; it can be
 *                                          accepted with conditions by Sangnan Wu, or rejected."; null when nothing is open or once decided
 * @property {boolean} [canAcceptWithConditions]   undecided, and every open item has a condition or a waiver proposed
 * @property {string|null} [lastDecisionLine]   "Release 2.3 was accepted with conditions by Grace Whitlock on 21 Aug 2026 (Record 1): 2 conditions, 1 met, 1 overdue."
 * @property {{state: string, approver: string, dueDate: IsoDate}|null} request
 * @property {{outcome: Outcome, decidedAt: IsoTime, recordNumber: number, seal: Sha256, openConditions: number}|null} lastDecision
 * @property {Citation[]} citations
 *   Ready words beside the raw fields (optional, see the header of src/actions.js): lastDecision.outcomeInWords,
 *   .decidedAtInWords; request.dueDateInWords, .requestedAtInWords; earlierConditions[].dueDateInWords, .stateInWords.
 *
 * @typedef {Object} ActionBlockersInput    action key `list-blockers` → export `blockers`
 * @property {string} projectKey
 * @property {string} [release]
 * @typedef {Object} ActionBlockersOutput
 * @property {string} release
 * @property {string|null} releaseChosenLine   as in ActionStatusOutput
 * @property {{code: string, kind: OpenItem['kind'], item: string, sentence: string, since: IsoTime|null, coveredBy: string|null, citation: Citation}[]} blockers
 *   Every open item, covered or not. code: S1–S6 for stale, D1–D4 for conflicts, else the kind in capitals.
 *   coveredBy: null, or the condition or waiver proposed for it in the brief, in words. It stays a blocker until signed.
 * @property {number} [count]               all open items · [coveredCount] how many have something proposed
 * @property {string|null} [countLine]      "5 things block sign-off."; null once decided · [openLine], [canAcceptWithConditions] as in ActionStatusOutput
 * @property {{state: 'off'|'ok'|'empty'|'failed', sentence: string|null, linked: {issueKey: string, kind: LinkedWork['kind'], relatedKey: string|null, title: string, url: string|null, at: IsoTime|null}[]}} teamworkGraph
 *   sentence is null and linked is [] unless the graph links a work item from outside the release, or development work.
 *   Ready words (optional): per blocker sinceInWords, tested.atInWords, changes[].atInWords.
 *
 * @typedef {Object} ActionVerifyInput      action key `verify-seal` → export `verify`
 * @property {string} projectKey
 * @property {number} [recordNumber]        default: the latest record
 * @property {boolean} [wholeChain]         default false
 * @typedef {Object} ActionVerifyOutput
 * @property {'intact'|'broken'|'intact_evidence_missing'} result    with wholeChain: the worst result of the chain
 * @property {number} recordNumber
 * @property {Sha256} seal
 * @property {{snapshot: boolean|null, page: boolean|null, chain: boolean|null, evidence: boolean|null}} checks
 * @property {{where: string, sealed: string|null, found: string|null, editedBy: string|null, editedAt: IsoTime|null}[]} differences
 * @property {{issueKey: string, sentence: string, at: IsoTime, url: string}[]} changedSinceSigning   url is absolute
 * @property {{recordNumber: number, result: string, release?: string, sealShort?: string, resultInWords?: string}[]} [chain]     only with wholeChain
 * @property {string} [firstLine]           the whole first line of an answer: "Yes. Seal intact. Record 1 · release 2.3 · seal f3dc45da…01a5"
 * @property {string|null} [restoreLine]    the ready restore sentence; null unless the seal is broken by the page and the page can be restored
 * @property {string|null} [pageDiffersLine]   "The sealed record itself is unchanged; only the readable page differs."; null unless
 *   the seal is broken by the page while the stored record still matches its seal. Both are null for an intact record.
 *   Ready words (optional): resultInWords, sealedAtInWords, checkedAtInWords; per difference editedAtInWords;
 *   changedSinceSigning[].atInWords.
 * @property {Citation[]} citations
 *
 * @typedef {Object} Actions
 * @property {(payload: ActionStatusInput & {context?: any}, context?: any) => Promise<ActionStatusOutput | {error: string}>} status
 * @property {(payload: ActionBlockersInput & {context?: any}, context?: any) => Promise<ActionBlockersOutput | {error: string}>} blockers
 * @property {(payload: ActionVerifyInput & {context?: any}, context?: any) => Promise<ActionVerifyOutput | {error: string}>} verify
 */
