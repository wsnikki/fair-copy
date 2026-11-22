// [C] DOMAIN §4 verbatim, as data. Contract: typedef `SampleDataset` in src/contract.js.
// Everything here is fictional. Dates are whole-day offsets from day zero (`d0`) plus a UTC time; the loader shifts
// them so that day zero is the day the sample is loaded.
//
// Pure: imports only lib/format.js. Tests and slice A may import everything exported here.
//
// Where DOMAIN §4 gives no value, the choice made here is marked "chosen" in a comment. Those are: the day a
// requirement or defect moved to In Progress, the day the 2.3 requirements were finished, times of day that DOMAIN
// leaves out (09:00 or 10:00), the builds of the 2.3 runs, and Record 1's statement, request time and who confirmed
// its met condition. None of them changes the §4.5 oracle.
//
// Release 2.5 (DOMAIN §4.7) comes after CLM-1 … CLM-24, so no key of 2.3 or 2.4 moves. It is the release in which a
// condition signed for 2.4 is seen again.
import { addDays, daysBetween } from '../lib/format.js';

const D0 = '2026-12-09';

/** DOMAIN's fixed calendar date → whole days from day zero (9 Dec 2026). `day('2026-12-03')` is -6. */
const day = (isoDate) => daysBetween(D0, isoDate);

const P = (n) => `sample:P${n}`;
const [PRIYA, LEO, TOMASZ, AISHA, DANIEL, MEILING, GRACE, SAMUEL, INGRID] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(P);

const STATUS_NAME = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const RC1 = '2.4.0-rc1';
const RC2 = '2.4.0-rc2';
const RC_25 = '2.5.0-rc1';

// ───────────────────────────── issues (§4.3) ─────────────────────────────

const TESTS = 'tests';
const FOUND_BY = 'found by';
const RELATES = 'relates to';

const CLM8_SUMMARY = 'Caseworker can record a change of circumstances and the weekly award is recalculated';
const CLM8_BEFORE =
  'The new award applies from the date of the change; a past date creates arrears; an audit note is saved.';
const CLM8_AFTER =
  'The new award applies from the Monday following the date of the change; a past date creates arrears; an audit note is saved.';
/** Requirement.text of CLM-8 (summary + '\n' + description) as it stood until the 3 Dec edit. */
const CLM8_TEXT_BEFORE = `${CLM8_SUMMARY}\n${CLM8_BEFORE}`;

const requirement = (ref, summary, description, version, status = 'done') => ({
  ref, role: 'requirement', type: 'Story', summary, description, version, status, priority: null, tests: null, links: [],
});
const acceptanceCase = (ref, summary, tests, version, status = 'done') => ({
  ref, role: 'case', type: 'Task', summary, description: '', version, status, priority: null, tests,
  links: [{ type: TESTS, to: tests }],
});
const defect = (ref, summary, priority, version, status, foundBy, relatesTo) => ({
  ref, role: 'defect', type: 'Bug', summary, description: '', version, status, priority, tests: null,
  links: [{ type: FOUND_BY, to: foundBy }, { type: RELATES, to: relatesTo }],
});

const ISSUES = [
  // Release 2.3 (history, already signed)
  requirement(1, 'Claimant can track the status of a claim online', '', '2.3'),
  requirement(2, 'Caseworker can override a weekly award and must give a reason', '', '2.3'),
  acceptanceCase(3, 'Claimant sees the correct status and date for a submitted claim', 1, '2.3'),
  acceptanceCase(4, 'Override is refused without a reason and saved with one', 2, '2.3'),
  defect(5, 'Status tracker shows the wrong date format for claims older than 12 months', null, '2.3', 'done', 3, 1),
  {
    ref: 6, role: 'followup', type: 'Task', summary: 'Override audit report can be exported to CSV for the quarterly audit',
    description: '', version: null, status: 'in_progress', priority: null, tests: null, links: [{ type: RELATES, to: 2 }],
  },
  // Release 2.4 — requirements (description = acceptance criteria)
  requirement(
    7,
    'Claimant can upload supporting documents to an open claim',
    'PDF, JPG or PNG up to 10 MB is accepted; anything else is refused with a clear message; the caseworker sees the file within one minute.',
    '2.4',
  ),
  requirement(8, CLM8_SUMMARY, CLM8_AFTER, '2.4'),
  requirement(
    9,
    'Claimant is notified by email and SMS when the claim status changes',
    'Email and SMS are sent on every status change; a claimant who opted out gets neither.',
    '2.4',
  ),
  requirement(
    10,
    'Caseworker can set an overpayment recovery plan capped at 15% of the weekly award',
    'The plan cannot exceed 15% of the weekly award; the claimant can see the schedule; a caseworker can pause recovery for hardship.',
    '2.4',
  ),
  // Release 2.4 — acceptance cases
  acceptanceCase(11, 'Upload a 4 MB PDF to an open claim', 7, '2.4'),
  acceptanceCase(12, 'Upload of a 12 MB file or a .exe is refused with a clear message', 7, '2.4'),
  acceptanceCase(13, 'Uploaded document appears on the caseworker screen within one minute', 7, '2.4'),
  acceptanceCase(14, 'Award is recalculated when household size changes', 8, '2.4'),
  acceptanceCase(15, 'A change dated in the past creates the correct arrears payment', 8, '2.4'),
  acceptanceCase(16, 'An audit note records who made the change and why', 8, '2.4'),
  acceptanceCase(17, 'Email is sent when the claim status changes', 9, '2.4'),
  acceptanceCase(18, 'SMS is sent when the claim status changes', 9, '2.4'),
  acceptanceCase(19, 'A claimant who opted out receives no email or SMS', 9, '2.4'),
  acceptanceCase(20, 'A recovery plan above 15% of the weekly award is refused', 10, '2.4'),
  acceptanceCase(21, 'Claimant can see the repayment schedule', 10, '2.4'),
  acceptanceCase(22, 'Caseworker can pause recovery for hardship', 10, '2.4', 'todo'),
  // Release 2.4 — defects
  defect(23, 'Arrears are rounded per week, not per period, so the claimant is underpaid by a few cents', 'High', '2.4', 'done', 15, 8),
  // Reopened 4 Dec by Mei-Ling Chow: "prefix now works; numbers typed with spaces still fail". Samuel Ortega made the
  // fix himself on 30 Nov because Aisha Bello was on leave 30 Nov–1 Dec.
  defect(24, 'SMS is not sent when the phone number has a country prefix or spaces', 'Medium', '2.4', 'in_progress', 18, 9),
  // Release 2.5 — the next release (§4.7): two requirements, three cases, one run. Nobody has been asked to sign.
  requirement(
    25,
    'Claimant can withdraw a claim online before a decision is made',
    'A claim that has no decision yet can be withdrawn by the claimant, who gives a reason; a claim that has a decision cannot; the caseworker sees the claim as withdrawn.',
    '2.5',
  ),
  requirement(
    26,
    'Caseworker can find a claim by its claim reference',
    'A full claim reference opens that claim; a partial reference of at least four characters lists the matching claims.',
    '2.5',
    'in_progress',
  ),
  acceptanceCase(27, 'Claimant withdraws a claim that has no decision yet', 25, '2.5'),
  acceptanceCase(28, 'A claim that has a decision cannot be withdrawn', 25, '2.5', 'todo'),
  acceptanceCase(29, 'A full claim reference opens the right claim', 26, '2.5', 'todo'),
];

// ───────────────────────────── ledger (§4.3, §4.6) ─────────────────────────────

const NINE = '09:00:00';

/** Reporter, first status and first assignee of an issue, all at its creation time. */
const created = (ref, date, time, reporter, assignee) => [
  { ref, kind: 'other', field: 'reporter', from: null, to: reporter, day: day(date), time, actor: reporter },
  { ref, kind: 'status', field: 'status', from: null, to: 'todo', fromText: null, toText: STATUS_NAME.todo, day: day(date), time, actor: reporter },
  { ref, kind: 'assignee', field: 'assignee', from: null, to: assignee, day: day(date), time, actor: reporter },
];
const move = (ref, from, to, date, time, actor) => ({
  ref, kind: 'status', field: 'status', from, to, fromText: STATUS_NAME[from], toText: STATUS_NAME[to], day: day(date), time, actor,
});
/** created → In Progress → Done by the person who built it. */
const built = (ref, createdOn, reporter, builder, startedOn, doneOn) => [
  ...created(ref, createdOn, NINE, reporter, builder),
  move(ref, 'todo', 'in_progress', startedOn, NINE, builder),
  move(ref, 'in_progress', 'done', doneOn, NINE, builder),
];
/** A case: created by the test lead, assigned to its tester, closed by the tester at the run that passed. */
const caseHistory = (ref, createdOn, tester, passedOn, passedAt) => [
  ...created(ref, createdOn, NINE, PRIYA, tester),
  ...(passedOn ? [move(ref, 'todo', 'done', passedOn, passedAt, tester)] : []),
];

const LEDGER = [
  // 2.3. In Progress on 4 Aug and Done on 4 Sep are chosen (DOMAIN: created 3 Aug, tested 8–9 Sep).
  ...built(1, '2026-08-03', LEO, TOMASZ, '2026-08-04', '2026-09-04'),
  ...built(2, '2026-08-03', LEO, AISHA, '2026-08-04', '2026-09-04'),
  ...caseHistory(3, '2026-08-10', DANIEL, '2026-10-12', '10:00:00'),
  ...caseHistory(4, '2026-08-10', MEILING, '2026-09-09', '10:00:00'),
  // CLM-5: raised 8 Sep, resolved 9 Oct. In Progress on 9 Sep is chosen.
  ...created(5, '2026-09-08', '10:30:00', DANIEL, TOMASZ),
  move(5, 'todo', 'in_progress', '2026-09-09', NINE, TOMASZ),
  move(5, 'in_progress', 'done', '2026-10-09', NINE, TOMASZ),
  // CLM-6: the follow-up behind condition C-2.3-2, still In Progress. Start on 21 Sep is chosen.
  ...created(6, '2026-09-18', '16:30:00', INGRID, AISHA),
  move(6, 'todo', 'in_progress', '2026-09-21', NINE, AISHA),

  // 2.4 requirements: created 2 Nov (D-37), last edited 16 Nov (D-23) = the move to Done. Start on 3 Nov is chosen.
  ...built(7, '2026-11-02', LEO, TOMASZ, '2026-11-03', '2026-11-16'),
  ...built(8, '2026-11-02', LEO, TOMASZ, '2026-11-03', '2026-11-16'),
  ...built(9, '2026-11-02', LEO, AISHA, '2026-11-03', '2026-11-16'),
  ...built(10, '2026-11-02', LEO, AISHA, '2026-11-03', '2026-11-16'),
  // §4.6: the requirement change that drives stale evidence. "Policy team clarified the effective-date rule."
  { ref: 8, kind: 'text', field: 'description', from: CLM8_BEFORE, to: CLM8_AFTER, day: day('2026-12-03'), time: '15:40:00', actor: LEO },

  // 2.4 cases: created 17 Nov (D-22) by Priya Raman; Done at the passing run.
  ...caseHistory(11, '2026-11-17', DANIEL, '2026-11-24', '10:05:00'),
  ...caseHistory(12, '2026-11-17', DANIEL, '2026-11-24', '10:30:00'),
  ...caseHistory(13, '2026-11-17', DANIEL, '2026-11-24', '11:10:00'),
  ...caseHistory(14, '2026-11-17', DANIEL, '2026-11-26', '09:50:00'),
  ...caseHistory(15, '2026-11-17', DANIEL, '2026-12-02', '14:10:00'),
  ...caseHistory(16, '2026-11-17', DANIEL, '2026-11-26', '11:20:00'),
  ...caseHistory(17, '2026-11-17', MEILING, '2026-11-25', '09:40:00'),
  ...caseHistory(18, '2026-11-17', MEILING, '2026-12-03', '10:20:00'),
  ...caseHistory(19, '2026-11-17', MEILING, '2026-11-25', '11:00:00'),
  ...caseHistory(20, '2026-11-17', MEILING, '2026-11-27', '10:00:00'),
  ...caseHistory(21, '2026-11-17', MEILING, '2026-11-27', '10:45:00'),
  ...caseHistory(22, '2026-11-17', MEILING, null, null),

  // CLM-23: To Do → In Progress 27 Nov → Done 30 Nov (D-9); never reopened. Fixed by Tomasz Wrobel.
  ...created(23, '2026-11-26', '10:50:00', DANIEL, TOMASZ),
  move(23, 'todo', 'in_progress', '2026-11-27', NINE, TOMASZ),
  move(23, 'in_progress', 'done', '2026-11-30', NINE, TOMASZ),
  // CLM-24: To Do → In Progress 30 Nov → Done 1 Dec (D-8) → reopened to In Progress 4 Dec 11:20 (D-5) by Mei-Ling Chow.
  // Fixed by Samuel Ortega, who took it on 30 Nov: that is the one conflict.
  ...created(24, '2026-11-25', '10:25:00', MEILING, null),
  { ref: 24, kind: 'assignee', field: 'assignee', from: null, to: SAMUEL, day: day('2026-11-30'), time: '08:55:00', actor: SAMUEL },
  move(24, 'todo', 'in_progress', '2026-11-30', NINE, SAMUEL),
  move(24, 'in_progress', 'done', '2026-12-01', NINE, SAMUEL),
  move(24, 'done', 'in_progress', '2026-12-04', '11:20:00', MEILING),

  // 2.5 (chosen): requirements raised 23 Nov; CLM-25 built 24 Nov–3 Dec by Tomasz Wrobel, CLM-26 taken up 2 Dec by
  // Aisha Bello and not finished. Cases written 4 Dec; only CLM-27 has been run.
  ...built(25, '2026-11-23', LEO, TOMASZ, '2026-11-24', '2026-12-03'),
  ...created(26, '2026-11-23', NINE, LEO, AISHA),
  move(26, 'todo', 'in_progress', '2026-12-02', NINE, AISHA),
  ...caseHistory(27, '2026-12-04', DANIEL, '2026-12-07', '10:15:00'),
  ...caseHistory(28, '2026-12-04', DANIEL, null, null),
  ...caseHistory(29, '2026-12-04', MEILING, null, null),
];

// ───────────────────────────── runs (§4.4) ─────────────────────────────

const run = (id, caseRef, date, time, tester, build, result, file, note, requirementText) => ({
  id, caseRef, day: day(date), time, tester, build, environment: 'UAT', result, file, note,
  ...(requirementText ? { requirementText } : {}),
});

const RUNS = [
  // Release 2.3 runs (history). DOMAIN gives the day, the result and the tester; time and build are chosen.
  run('R-2.3-1', 3, '2026-09-08', '10:00:00', DANIEL, '2.3.0', 'failed', '', 'Raised CLM-5'),
  run('R-2.3-2', 4, '2026-09-09', '10:00:00', MEILING, '2.3.0', 'passed', '', ''),
  run('R-2.3-3', 3, '2026-10-12', '10:00:00', DANIEL, '2.3.1', 'passed', '', 'Re-run after the CLM-5 fix'),
  // Release 2.4. `file` is the test log attached to the case as evidence; its lines are in LOGS below.
  run('R-01', 11, '2026-11-24', '10:05:00', DANIEL, RC1, 'passed', 'CLM-11-upload-run.log', ''),
  run('R-02', 12, '2026-11-24', '10:30:00', DANIEL, RC1, 'passed', 'CLM-12-refused-upload-run.log', ''),
  run('R-03', 13, '2026-11-24', '11:10:00', DANIEL, RC1, 'passed', 'CLM-13-caseworker-view-run.log', 'Seen after 20 seconds'),
  run('R-04', 17, '2026-11-25', '09:40:00', MEILING, RC1, 'passed', 'CLM-17-email-run.log', ''),
  run('R-05', 18, '2026-11-25', '10:15:00', MEILING, RC1, 'failed', 'CLM-18-sms-run-failed.log', 'No SMS for +prefix number; raised CLM-24'),
  run('R-06', 19, '2026-11-25', '11:00:00', MEILING, RC1, 'passed', 'CLM-19-opt-out-run.log', ''),
  run('R-07', 14, '2026-11-26', '09:50:00', DANIEL, RC1, 'passed', 'CLM-14-recalc-run.log', '', CLM8_TEXT_BEFORE),
  run('R-08', 15, '2026-11-26', '10:40:00', DANIEL, RC1, 'failed', 'CLM-15-arrears-run-failed.log', 'Arrears 0.04 short; raised CLM-23', CLM8_TEXT_BEFORE),
  run('R-09', 16, '2026-11-26', '11:20:00', DANIEL, RC1, 'passed', 'CLM-16-audit-note-run.log', '', CLM8_TEXT_BEFORE),
  run('R-10', 20, '2026-11-27', '10:00:00', MEILING, RC1, 'passed', 'CLM-20-cap-run.log', ''),
  run('R-11', 21, '2026-11-27', '10:45:00', MEILING, RC1, 'passed', 'CLM-21-schedule-run.log', ''),
  run('R-12', 15, '2026-12-02', '14:10:00', DANIEL, RC2, 'passed', 'CLM-15-arrears-retest.log', 'Retest of CLM-23 fix', CLM8_TEXT_BEFORE),
  run('R-13', 18, '2026-12-03', '10:20:00', MEILING, RC2, 'passed', 'CLM-18-sms-retest.log', 'Retest of CLM-24 fix, +prefix number only'),
  run('R-14', 14, '2026-12-04', '09:30:00', DANIEL, RC2, 'passed', 'CLM-14-recalc-monday-run.log', 'Re-run against the edited CLM-8'),
  // Release 2.5: the one run so far (chosen).
  run('R-2.5-1', 27, '2026-12-07', '10:15:00', DANIEL, RC_25, 'passed', 'CLM-27-withdraw-run.log', ''),
];

// ───────────────────────────── evidence: what each test log says ─────────────────────────────
//
// The steps of each run, as a tester's log would list them: `[+mm:ss]` from the start of the run, then what was
// expected. Claim references, test accounts and amounts are invented. evidenceLog() puts the header and the result
// around them.
const LOGS = {
  'R-01': [
    '[+00:00] signed in as claimant UAT-C-0142, opened claim ES-2026-004417 (status Open)',
    '[+00:21] chose "Add supporting document", selected payslip-october.pdf (4.1 MB, application/pdf)',
    '[+00:29] upload finished, HTTP 201, document id D-88213',
    '[+00:31] page shows "payslip-october.pdf was added to your claim"',
    '[+00:40] document list of the claim shows 1 file, 4.1 MB, uploaded today',
    'expected: the PDF is accepted and listed on the claim',
  ],
  'R-02': [
    '[+00:00] signed in as claimant UAT-C-0142, opened claim ES-2026-004417',
    '[+00:18] selected bank-statements-2026.pdf (12.3 MB)',
    '[+00:19] refused before upload: "This file is larger than 10 MB. Choose a smaller file."',
    '[+00:47] selected setup.exe (0.8 MB)',
    '[+00:48] refused before upload: "Only PDF, JPG or PNG files can be added."',
    '[+01:02] document list of the claim shows no new file',
    'expected: both files are refused with a clear message',
  ],
  'R-03': [
    '[+00:00] claimant UAT-C-0142 uploaded id-card.jpg (1.6 MB) to claim ES-2026-004417, document id D-88216',
    '[+00:04] signed in as caseworker UAT-W-07 in a second browser, opened the same claim',
    '[+00:20] Documents tab lists id-card.jpg, uploaded by the claimant',
    '[+00:26] opened the file from the caseworker screen, the image is readable',
    'expected: the caseworker sees the file within 60 seconds',
    'measured: 20 seconds',
  ],
  'R-04': [
    '[+00:00] claim ES-2026-004503, claimant UAT-C-0177, contact preference: email and SMS',
    '[+00:15] caseworker UAT-W-07 changed the status from Received to In assessment',
    '[+00:22] notification queue: 1 email queued, template STATUS-CHANGE',
    '[+00:58] UAT mail catcher received 1 message for uat.c0177@claimpoint-uat.example',
    '[+01:05] subject "Your claim ES-2026-004503 is now in assessment"; the body names the new status and the date',
    'expected: one email for each status change',
  ],
  'R-05': [
    '[+00:00] claim ES-2026-004503, claimant UAT-C-0177, mobile number stored with a country prefix',
    '[+00:14] caseworker UAT-W-07 changed the status from In assessment to Awaiting documents',
    '[+00:20] notification queue: 1 email queued, 0 SMS queued',
    '[+02:30] SMS test gateway: no message for this number after 2 minutes',
    '[+02:44] application log: "sms skipped: number failed validation"',
    '[+03:10] repeated with claimant UAT-C-0178, number stored without a prefix: SMS received',
    'expected: one SMS for each status change',
    'actual: no SMS when the number has a country prefix; raised CLM-24',
  ],
  'R-06': [
    '[+00:00] claim ES-2026-004611, claimant UAT-C-0183, contact preference: no notifications (opted out)',
    '[+00:12] caseworker UAT-W-07 changed the status from Received to In assessment',
    '[+00:18] notification queue: 0 email queued, 0 SMS queued, 1 entry "suppressed: opted out"',
    '[+03:00] UAT mail catcher and SMS test gateway: nothing for this claimant',
    '[+03:20] status history of the claim shows the change, with no notification listed',
    'expected: a claimant who opted out gets neither email nor SMS',
  ],
  'R-07': [
    '[+00:00] claim ES-2026-003902, household of 2, weekly award 184.50',
    '[+00:25] caseworker UAT-W-11 recorded a change of circumstances: household size 2 to 3, dated today',
    '[+00:27] award recalculated: 184.50 to 231.00 a week',
    '[+00:35] award history shows the old and the new amount with the date of the change',
    '[+00:52] checked against the rates table for a household of 3: 231.00',
    'expected: the weekly award follows the new household size',
  ],
  'R-08': [
    '[+00:00] claim ES-2026-003915, weekly award 184.50',
    '[+00:30] caseworker UAT-W-11 recorded a change dated 5 weeks in the past; the award rises by 11.828 a week',
    '[+00:33] arrears payment created: 59.10',
    '[+01:10] checked by hand: 5 weeks x 11.828 = 59.14',
    '[+01:40] the weekly difference is cut to 11.82 each week before the weeks are added up',
    'expected: arrears of 59.14 for the whole period',
    'actual: 59.10, which is 0.04 short; raised CLM-23',
  ],
  'R-09': [
    '[+00:00] claim ES-2026-003902, change of circumstances recorded in run R-07',
    '[+00:10] opened the audit tab of the claim as caseworker UAT-W-11',
    '[+00:14] newest note: "Household size changed from 2 to 3" by UAT-W-11, with date and time',
    '[+00:20] the reason shows the text the caseworker typed: "New child, birth certificate on file"',
    '[+00:41] tried to save a second change with an empty reason: refused, "Give a reason for the change."',
    'expected: the note records who made the change and why',
  ],
  'R-10': [
    '[+00:00] claim ES-2026-004120, weekly award 210.00, overpayment to recover 640.00',
    '[+00:22] caseworker UAT-W-15 entered a recovery plan of 35.00 a week (16.7%)',
    '[+00:23] refused: "The recovery cannot be more than 15% of the weekly award (31.50)."',
    '[+00:40] entered 31.50 a week: accepted, plan saved, 21 weeks',
    '[+00:55] plan is shown on the claim with its weekly amount and end date',
    'expected: a plan above 15% is refused and a plan at 15% is accepted',
  ],
  'R-11': [
    '[+00:00] signed in as claimant UAT-C-0201, claim ES-2026-004120',
    '[+00:15] opened "Repayments" from the claim page',
    '[+00:17] schedule lists 21 weekly deductions: 20 of 31.50 and a last one of 10.00',
    '[+00:30] total of the schedule: 640.00, equal to the overpayment',
    '[+00:44] the next deduction date is the next payment date of the award',
    'expected: the claimant can see every deduction and the total',
  ],
  'R-12': [
    '[+00:00] retest of the CLM-23 fix; claim ES-2026-003915 put back to its state before run R-08',
    '[+00:28] caseworker UAT-W-11 recorded the same change, dated 5 weeks in the past',
    '[+00:31] arrears payment created: 59.14',
    '[+00:50] checked by hand: 5 weeks x 11.828 = 59.14',
    '[+01:20] second claim ES-2026-003921, change dated 12 weeks in the past: 141.94 created, 141.94 by hand',
    'expected: arrears are worked out for the whole period',
  ],
  'R-13': [
    '[+00:00] retest of the CLM-24 fix; claimant UAT-C-0177, mobile number stored with a country prefix, no spaces',
    '[+00:12] caseworker UAT-W-07 changed the status from Awaiting documents to In assessment',
    '[+00:19] notification queue: 1 email queued, 1 SMS queued',
    '[+00:41] SMS test gateway received: "ClaimPoint: your claim ES-2026-004503 is now in assessment."',
    'expected: one SMS for each status change',
    'not covered in this run: numbers typed with spaces',
  ],
  'R-14': [
    '[+00:00] re-run against CLM-8 as edited the day before: the new award starts on the Monday after the change',
    '[+00:20] claim ES-2026-003930, household of 2, weekly award 184.50',
    '[+00:44] caseworker UAT-W-11 recorded household size 2 to 3, dated today',
    '[+00:46] award recalculated: 231.00 a week from the following Monday; 184.50 until then',
    '[+01:05] award history shows both amounts and the Monday start date',
    'expected: the new award applies from the Monday following the date of the change',
  ],
  'R-2.5-1': [
    '[+00:00] signed in as claimant UAT-C-0219, claim ES-2026-004702 (status Received, no decision yet)',
    '[+00:16] chose "Withdraw this claim", gave the reason "Found work"',
    '[+00:18] asked to confirm; confirmed',
    '[+00:20] page shows "Your claim ES-2026-004702 has been withdrawn"',
    '[+00:35] caseworker UAT-W-07 sees the claim as Withdrawn, with the reason the claimant gave',
    '[+00:52] confirmation email arrived in the UAT mail catcher',
    'expected: a claim without a decision can be withdrawn, and both sides see it',
  ],
};

// ───────────────────────────── the dataset ─────────────────────────────

/** @type {import('../contract.js').SampleDataset} */
export const DATASET = {
  d0: D0,
  project: { key: 'CLM', name: 'ClaimPoint' },
  space: { key: 'CLMACC', name: 'ClaimPoint Acceptance' },
  people: [
    { id: PRIYA, name: 'Priya Raman', title: 'Test lead' },
    { id: LEO, name: 'Leo Marchetti', title: 'Business analyst' },
    { id: TOMASZ, name: 'Tomasz Wrobel', title: 'Developer' },
    { id: AISHA, name: 'Aisha Bello', title: 'Developer' },
    { id: DANIEL, name: 'Daniel Okafor', title: 'Business tester (claims operations)' },
    { id: MEILING, name: 'Mei-Ling Chow', title: 'Business tester (payments team)' },
    { id: GRACE, name: 'Grace Whitlock', title: 'Head of Claims Operations' },
    { id: SAMUEL, name: 'Samuel Ortega', title: 'Service Delivery Manager' },
    { id: INGRID, name: 'Ingrid Solberg', title: 'Quality and compliance officer' },
    { id: P(10), name: 'Hannah Reyes', title: 'Internal auditor' },
  ],
  versions: [
    { name: '2.3', released: true, releaseDay: day('2026-09-21') },
    { name: '2.4', released: false, releaseDay: day('2026-12-14') },
    // Chosen: planned go-live six weeks after 2.4.
    { name: '2.5', released: false, releaseDay: day('2027-01-25') },
  ],
  issues: ISSUES,
  ledger: LEDGER,
  runs: RUNS,
  record1: {
    release: '2.3',
    outcome: 'accepted_with_conditions',
    day: day('2026-09-18'),
    time: '16:10:00',
    approver: GRACE,
    requestedBy: PRIYA,
    // Chosen wording: DOMAIN §4.6 gives the decision and the result at signing, not a statement.
    statement:
      'Accepted with conditions. One of the two cases failed and defect CLM-5 is open; the two conditions on this record must be met.',
    // `{due}` is replaced by the due date as shifted on load day: see conditionText().
    conditions: [
      {
        text: 'Fix CLM-5 and re-run CLM-3 by {due}.',
        owner: TOMASZ,
        dueDay: day('2026-10-16'),
        linkedRef: 5,
        // Met: CLM-5 resolved 9 Oct, CLM-3 re-run pass 12 Oct by Daniel Okafor. Confirmed by the test lead (chosen).
        met: { day: day('2026-10-12'), by: PRIYA, note: 'CLM-5 was resolved and CLM-3 passed when it was run again.' },
      },
      {
        text: 'Deliver CLM-6, the override audit export, by {due}.',
        owner: AISHA,
        dueDay: day('2026-11-30'),
        linkedRef: 6,
        met: null,
      },
    ],
  },
  // The open sign-off request for 2.4 (chosen; DOMAIN §4 stops before anyone is asked). The sample's test lead asks,
  // and the person who loads the sample is named approver — so that person only has to decide, not to ask themselves.
  request: {
    release: '2.4',
    requestedBy: PRIYA,
    day: day('2026-12-08'),
    time: '16:30:00',
    dueDay: day('2026-12-18'),
    note: 'Testing of 2.4 has finished. The go-live board meets on the due date; please decide before then.',
    // What the test lead proposes with the request (chosen). They are DRAFTS on the open request: the approver accepts,
    // edits or removes each one. The waiver is recorded by the test lead and authorised by the quality and compliance
    // officer, so on the main path it is not the approver's own. `dueDay` counts from the load day; `{due}` as above.
    drafts: {
      proposedBy: PRIYA,
      condition: {
        text: 'Re-run CLM-15, CLM-16 and CLM-18, and run CLM-22 with a hardship test claimant, by {due}.',
        owner: PRIYA,
        dueDay: 7,
        coversRefs: [15, 16, 18, 22],
      },
      waiver: {
        // The approver's own conflict: they hold CLM-24, a defect of requirement CLM-9.
        code: 'D1',
        itemRef: 9,
        reason:
          'No other approver is available before the go-live board. The approver took over CLM-24 only after it was reopened, and Tomasz Wrobel will review the fix. This waiver applies to Release 2.4 only.',
        recordedBy: PRIYA,
        authorisedBy: INGRID,
      },
    },
  },
  oracle: {
    counts: { proven: 8, stale: 3, failing: 0, unproven: 1 },
    usualSheetPasses: 11,
    stale: { 'CLM-15': 'S1', 'CLM-16': 'S1', 'CLM-18': 'S4' },
    openDefects: ['CLM-24'],
    conflictPerson: SAMUEL,
  },
};

/**
 * DOMAIN §4.5, case by case, for release 2.4 on day zero. Slice A's tests feed the dataset to the domain functions and
 * compare with this; test/sample checks that it agrees with DATASET.oracle and with the runs and ledger above.
 * `trigger` is the ledger row that makes the pass stale (matched on ref, kind, day and time).
 * @type {Record<string, {state: import('../contract.js').CaseState, latestRun: string|null, requirement: string, trigger?: {ref: number, kind: string, day: number, time: string}}>}
 */
export const EXPECTED_CASES = {
  'CLM-11': { state: 'passed', latestRun: 'R-01', requirement: 'CLM-7' },
  'CLM-12': { state: 'passed', latestRun: 'R-02', requirement: 'CLM-7' },
  'CLM-13': { state: 'passed', latestRun: 'R-03', requirement: 'CLM-7' },
  'CLM-14': { state: 'passed', latestRun: 'R-14', requirement: 'CLM-8' },
  'CLM-15': { state: 'passed_then_changed', latestRun: 'R-12', requirement: 'CLM-8', trigger: { ref: 8, kind: 'text', day: day('2026-12-03'), time: '15:40:00' } },
  'CLM-16': { state: 'passed_then_changed', latestRun: 'R-09', requirement: 'CLM-8', trigger: { ref: 8, kind: 'text', day: day('2026-12-03'), time: '15:40:00' } },
  'CLM-17': { state: 'passed', latestRun: 'R-04', requirement: 'CLM-9' },
  'CLM-18': { state: 'passed_then_changed', latestRun: 'R-13', requirement: 'CLM-9', trigger: { ref: 24, kind: 'status', day: day('2026-12-04'), time: '11:20:00' } },
  'CLM-19': { state: 'passed', latestRun: 'R-06', requirement: 'CLM-9' },
  'CLM-20': { state: 'passed', latestRun: 'R-10', requirement: 'CLM-10' },
  'CLM-21': { state: 'passed', latestRun: 'R-11', requirement: 'CLM-10' },
  'CLM-22': { state: 'not_run', latestRun: null, requirement: 'CLM-10' },
};

/**
 * The rest of the DOMAIN §4.5 / §4.6 oracle that does not fit `DATASET.oracle`.
 * conflict: naming Samuel Ortega approver of 2.4 gives exactly one D1, on CLM-9, resting on defect CLM-24.
 * record1: what Record 1 says on the day it was signed, and what the 2.4 brief carries from it on day zero.
 */
export const EXPECTED = {
  release: '2.4',
  totals: { requirements: 4, cases: 12 },
  conflict: { code: 'D1', person: SAMUEL, item: 'CLM-9', issueKey: 'CLM-24' },
  independentApprover: GRACE,
  record1: {
    number: 1,
    release: '2.3',
    countsAtSigning: { proven: 1, stale: 0, failing: 1, unproven: 0 },
    openDefectsAtSigning: ['CLM-5'],
    conditions: 2,
    carriedOnDayZero: { met: 1, overdue: 1, open: 0 },
    daysOverdueOnDayZero: 9,
  },
};

/**
 * DOMAIN §4.7: Release 2.5 on day zero, before anything is signed. Not asked for, one run, nothing stale.
 * `afterSigning24`: what its first line says once Release 2.4 is signed as Record 2 with the proposed condition.
 */
export const EXPECTED_25 = {
  release: '2.5',
  totals: { requirements: 2, cases: 3 },
  counts: { proven: 1, stale: 0, failing: 0, unproven: 2 },
  cases: {
    'CLM-27': { state: 'passed', latestRun: 'R-2.5-1', requirement: 'CLM-25' },
    'CLM-28': { state: 'not_run', latestRun: null, requirement: 'CLM-25' },
    'CLM-29': { state: 'not_run', latestRun: null, requirement: 'CLM-26' },
  },
  afterSigning24: {
    line:
      'Last time (Release 2.4, Record 2): 1 condition, due 16 Dec, open: "Re-run CLM-15, CLM-16 and CLM-18, and run CLM-22 with a hardship test claimant, by 16 Dec 2026." Record 1 (Release 2.3) still has 1 condition 9 days overdue.',
    overdue: 1,
  },
};

// ───────────────────────────── pure helpers ─────────────────────────────

/** ref n → `CLM-n` (or the key the loader really got). */
export const issueKey = (ref, projectKey = DATASET.project.key) => `${projectKey}-${ref}`;

/** A dataset day offset → IsoDate, with day zero mapped to `d0`. */
export const shiftDate = (d0, offset) => addDays(d0, offset);

/** A dataset day offset and `HH:MM:SS` → IsoTime, with day zero mapped to `d0`. */
export const shiftTime = (d0, offset, time) => `${addDays(d0, offset)}T${time}Z`;

/** Rewrites `CLM-12` to `<projectKey>-12` when the loader had to take another key. */
export const rekey = (text, projectKey = DATASET.project.key) =>
  projectKey === DATASET.project.key ? text : text.replace(/\bCLM-(\d+)/g, (_, n) => `${projectKey}-${n}`);

/**
 * `rekey` over every text inside a value (arrays and plain objects are walked; numbers, null and the rest are kept).
 * The loader reads Record 1 and the request through this, so no text it stores or prints keeps a `CLM-n` when the
 * project is CLM2 … CLM5. Rekeying twice changes nothing.
 * @template T @param {T} value @returns {T}
 */
export const rekeyDeep = (value, projectKey = DATASET.project.key) => {
  if (projectKey === DATASET.project.key) return value;
  if (typeof value === 'string') return rekey(value, projectKey);
  if (Array.isArray(value)) return value.map((v) => rekeyDeep(v, projectKey));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rekeyDeep(v, projectKey)]));
  }
  return value;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A Record 1 condition's text with its due date written out: "Fix CLM-5 and re-run CLM-3 by 16 Oct 2026." */
export const conditionText = (condition, d0 = DATASET.d0, projectKey = DATASET.project.key) => {
  const [y, m, d] = shiftDate(d0, condition.dueDay).split('-').map(Number);
  return rekey(condition.text, projectKey).replace('{due}', () => `${d} ${MONTHS[m - 1]} ${y}`);
};

/**
 * The drafts the test lead proposes on the sample request, fitted to the open items the brief really has: the
 * condition covers those of its four cases that are open, the waiver covers the approver's own conflict. A part
 * with nothing to cover is null, so nothing is proposed for an item that is not there.
 * @param {import('../contract.js').OpenItem[]} openItems
 * @returns {{condition: {text: string, owner: string, dueDate: string, covers: string[]}|null,
 *            waiver: {covers: string, coversLabel: string, reason: string, recordedBy: string, authorisedBy: string}|null}}
 */
export const sampleDrafts = (openItems, d0 = DATASET.d0, projectKey = DATASET.project.key) => {
  const { condition, waiver } = DATASET.request.drafts;
  const keys = condition.coversRefs.map((ref) => issueKey(ref, projectKey));
  const covers = openItems.filter((i) => i.needs === 'condition' && i.kind !== 'defect' && keys.includes(i.item)).map((i) => i.id);
  const conflict = openItems.find(
    (i) => i.needs === 'waiver' && i.kind === 'conflict' && i.item === issueKey(waiver.itemRef, projectKey) && i.id.startsWith(`conflict:${waiver.code}:`),
  );
  return {
    condition:
      covers.length > 0
        ? { text: conditionText(condition, d0, projectKey), owner: condition.owner, dueDate: shiftDate(d0, condition.dueDay), covers }
        : null,
    waiver: conflict
      ? {
          covers: conflict.id,
          coversLabel: conflict.label,
          reason: rekey(waiver.reason, projectKey),
          recordedBy: waiver.recordedBy,
          authorisedBy: waiver.authorisedBy,
        }
      : null,
  };
};

const RESULT_WORD = { passed: 'PASSED', failed: 'FAILED', blocked: 'BLOCKED' };

/**
 * The evidence file of a run: a short test log, as text. '' for a run that names no file.
 * The same run always gives the same bytes for the same load day and project key.
 */
export const evidenceLog = (run, d0 = DATASET.d0, projectKey = DATASET.project.key) => {
  if (!run.file) return '';
  const issue = DATASET.issues.find((i) => i.ref === run.caseRef);
  const tester = DATASET.people.find((p) => p.id === run.tester);
  const lines = [
    'ClaimPoint UAT test log (sample data: everything in it is fictional)',
    `run      ${run.id} of ${issueKey(run.caseRef)}: ${issue.summary}`,
    `build    ${run.build} on ${run.environment}`,
    `tester   ${tester.name}`,
    `started  ${shiftDate(d0, run.day)} ${run.time.slice(0, 5)} UTC`,
    ...(LOGS[run.id] ?? []),
    `result   ${RESULT_WORD[run.result]}`,
  ];
  return rekey(`${lines.join('\n')}\n`, projectKey);
};

/** id → Person for the ten sample people. */
export const samplePeople = () =>
  Object.fromEntries(DATASET.people.map((p) => [p.id, { id: p.id, name: p.name, kind: 'sample' }]));

/**
 * The ledger as normalised HistoryEvents (contract `HistoryEvent`), sorted by time, day zero mapped to `d0`.
 * The first status event and the first assignee event of an issue are its baselines.
 * @returns {import('../contract.js').HistoryEvent[]}
 */
export const ledgerEvents = (d0 = DATASET.d0, projectKey = DATASET.project.key) => {
  const people = samplePeople();
  const seen = new Set();
  return DATASET.ledger
    .map((row, index) => {
      const baselineKey = `${row.ref}:${row.kind}`;
      const first = !seen.has(baselineKey);
      seen.add(baselineKey);
      const text = row.kind === 'text';
      const event = {
        issueKey: issueKey(row.ref, projectKey),
        kind: row.kind,
        field: row.field,
        from: text && row.from ? rekey(row.from, projectKey) : row.from,
        to: text && row.to ? rekey(row.to, projectKey) : row.to,
        at: shiftTime(d0, row.day, row.time),
        actor: people[row.actor],
        source: 'sample',
        baseline: first && row.from === null && (row.kind === 'status' || row.kind === 'assignee'),
      };
      if (row.kind === 'status') {
        event.fromText = row.fromText ?? null;
        event.toText = row.toText ?? null;
      }
      if (row.kind === 'assignee') {
        event.fromPerson = row.from ? people[row.from] : null;
        event.toPerson = row.to ? people[row.to] : null;
        event.fromText = event.fromPerson?.name ?? null;
        event.toText = event.toPerson?.name ?? null;
      }
      return { event, index };
    })
    .sort((a, b) => (a.event.at < b.event.at ? -1 : a.event.at > b.event.at ? 1 : a.index - b.index))
    .map(({ event }) => event);
};
