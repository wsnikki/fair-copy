// The single source of the SQL schema (Forge SQL, MySQL-compatible). Owned by the skeleton; ask Main before changing.
//
// Conventions
// - Times are VARCHAR(20) IsoTime (`YYYY-MM-DDTHH:MM:SSZ`, UTC); dates are VARCHAR(10) IsoDate. They sort as strings and
//   never pass through a time-zone conversion.
// - People are stored as Person ids (Jira accountId or `sample:P<n>`), resolved through table `people`.
// - Booleans are TINYINT (0/1). JSON is stored as TEXT and parsed in the repo.
// - No foreign keys (Forge SQL does not enforce them). No floats.
// - One statement per migration. Ids never change once deployed; new migrations go at the end with the next number.
//   DDL is limited to 25 statements a minute per installation (TECH §3(3)).

/** @type {{id: string, sql: string}[]} */
export const MIGRATIONS = [
  {
    id: 'v001_create_people',
    sql: `CREATE TABLE IF NOT EXISTS people (
      id VARCHAR(128) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      kind VARCHAR(8) NOT NULL,
      title VARCHAR(255) NULL
    )`,
  },
  {
    id: 'v002_create_cases',
    sql: `CREATE TABLE IF NOT EXISTS cases (
      case_key VARCHAR(64) NOT NULL PRIMARY KEY,
      case_id VARCHAR(32) NOT NULL,
      project_key VARCHAR(32) NOT NULL,
      requirement_key VARCHAR(64) NOT NULL,
      marked_by VARCHAR(128) NOT NULL,
      marked_at VARCHAR(20) NOT NULL,
      sample TINYINT NOT NULL DEFAULT 0,
      INDEX idx_cases_project (project_key),
      INDEX idx_cases_requirement (requirement_key)
    )`,
  },
  {
    id: 'v003_create_builds',
    sql: `CREATE TABLE IF NOT EXISTS builds (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      project_key VARCHAR(32) NOT NULL,
      release_id VARCHAR(32) NOT NULL,
      build VARCHAR(128) NOT NULL,
      set_by VARCHAR(128) NOT NULL,
      set_at VARCHAR(20) NOT NULL,
      INDEX idx_builds_release (release_id, id)
    )`,
  },
  {
    id: 'v004_create_runs',
    sql: `CREATE TABLE IF NOT EXISTS runs (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      project_key VARCHAR(32) NOT NULL,
      release_id VARCHAR(32) NOT NULL,
      case_key VARCHAR(64) NOT NULL,
      requirement_key VARCHAR(64) NOT NULL,
      result VARCHAR(16) NOT NULL,
      notes TEXT NULL,
      build VARCHAR(128) NOT NULL,
      environment VARCHAR(64) NOT NULL,
      executed_at VARCHAR(20) NOT NULL,
      executed_by VARCHAR(128) NOT NULL,
      snapshot TEXT NOT NULL,
      sample TINYINT NOT NULL DEFAULT 0,
      INDEX idx_runs_case (case_key, executed_at),
      INDEX idx_runs_project (project_key, release_id)
    )`,
  },
  {
    id: 'v005_create_evidence',
    sql: `CREATE TABLE IF NOT EXISTS evidence (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      run_id BIGINT NOT NULL,
      attachment_id VARCHAR(32) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      size BIGINT NOT NULL,
      sha256 CHAR(64) NULL,
      INDEX idx_evidence_run (run_id)
    )`,
  },
  {
    id: 'v006_create_requests',
    sql: `CREATE TABLE IF NOT EXISTS requests (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      project_key VARCHAR(32) NOT NULL,
      release_id VARCHAR(32) NOT NULL,
      release_name VARCHAR(255) NOT NULL,
      requested_by VARCHAR(128) NOT NULL,
      requested_at VARCHAR(20) NOT NULL,
      approver VARCHAR(128) NOT NULL,
      due_date VARCHAR(10) NOT NULL,
      note TEXT NULL,
      state VARCHAR(16) NOT NULL DEFAULT 'open',
      task_key VARCHAR(64) NULL,
      record_id BIGINT NULL,
      closed_at VARCHAR(20) NULL,
      sample TINYINT NOT NULL DEFAULT 0,
      INDEX idx_requests_release (project_key, release_id, state)
    )`,
  },
  {
    id: 'v007_create_records',
    sql: `CREATE TABLE IF NOT EXISTS records (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      project_key VARCHAR(32) NOT NULL,
      number INT NOT NULL,
      release_id VARCHAR(32) NOT NULL,
      release_name VARCHAR(255) NOT NULL,
      outcome VARCHAR(32) NOT NULL,
      decided_by VARCHAR(128) NOT NULL,
      decided_at VARCHAR(20) NOT NULL,
      seal CHAR(64) NOT NULL,
      prev_seal CHAR(64) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      page_id VARCHAR(32) NULL,
      page_url VARCHAR(512) NULL,
      page_status VARCHAR(16) NOT NULL DEFAULT 'none',
      page_error TEXT NULL,
      sample TINYINT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_records_number (project_key, number),
      INDEX idx_records_page (page_id)
    )`,
  },
  {
    id: 'v008_create_conditions',
    sql: `CREATE TABLE IF NOT EXISTS conditions (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      project_key VARCHAR(32) NOT NULL,
      request_id BIGINT NULL,
      record_id BIGINT NULL,
      record_number INT NULL,
      release_name VARCHAR(255) NULL,
      text TEXT NOT NULL,
      owner VARCHAR(128) NOT NULL,
      due_date VARCHAR(10) NOT NULL,
      covers TEXT NOT NULL,
      linked_issue VARCHAR(64) NULL,
      status VARCHAR(8) NOT NULL DEFAULT 'open',
      met_at VARCHAR(20) NULL,
      met_by VARCHAR(128) NULL,
      sample TINYINT NOT NULL DEFAULT 0,
      INDEX idx_conditions_project (project_key, status),
      INDEX idx_conditions_request (request_id),
      INDEX idx_conditions_record (record_id)
    )`,
  },
  {
    id: 'v009_create_waivers',
    sql: `CREATE TABLE IF NOT EXISTS waivers (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      project_key VARCHAR(32) NOT NULL,
      request_id BIGINT NULL,
      record_id BIGINT NULL,
      covers VARCHAR(255) NOT NULL,
      covers_label VARCHAR(512) NOT NULL,
      reason TEXT NOT NULL,
      authorised_by VARCHAR(128) NULL,
      authorised_by_name VARCHAR(255) NULL,
      reference VARCHAR(512) NOT NULL DEFAULT '',
      recorded_by VARCHAR(128) NOT NULL,
      recorded_at VARCHAR(20) NOT NULL,
      self_recorded TINYINT NOT NULL DEFAULT 0,
      INDEX idx_waivers_request (request_id),
      INDEX idx_waivers_record (record_id),
      INDEX idx_waivers_project (project_key)
    )`,
  },
  {
    id: 'v010_create_ledger',
    sql: `CREATE TABLE IF NOT EXISTS ledger (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      project_key VARCHAR(32) NOT NULL,
      issue_key VARCHAR(64) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      field VARCHAR(128) NOT NULL,
      from_value TEXT NULL,
      to_value TEXT NULL,
      from_text TEXT NULL,
      to_text TEXT NULL,
      at VARCHAR(20) NOT NULL,
      actor VARCHAR(128) NOT NULL,
      baseline TINYINT NOT NULL DEFAULT 0,
      INDEX idx_ledger_issue (issue_key, at),
      INDEX idx_ledger_project (project_key)
    )`,
  },
  {
    id: 'v011_create_issue_changes',
    sql: `CREATE TABLE IF NOT EXISTS issue_changes (
      id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
      project_key VARCHAR(32) NOT NULL,
      issue_key VARCHAR(64) NOT NULL,
      changed_at VARCHAR(20) NOT NULL,
      actor VARCHAR(128) NULL,
      fields TEXT NOT NULL,
      INDEX idx_issue_changes_issue (issue_key, changed_at),
      INDEX idx_issue_changes_project (project_key)
    )`,
  },
  // The request a record decides. UNIQUE: one request can never be sealed twice (NULLs — old and sample rows — may repeat).
  { id: 'v012_records_request_id', sql: 'ALTER TABLE records ADD COLUMN request_id BIGINT NULL' },
  { id: 'v013_records_request_unique', sql: 'ALTER TABLE records ADD UNIQUE KEY uq_records_request (request_id)' },
  // Where the seal was posted as a Jira comment by the signer (check V5), and what is still to be done after sealing.
  { id: 'v014_records_anchor_issue', sql: 'ALTER TABLE records ADD COLUMN anchor_issue VARCHAR(64) NULL' },
  { id: 'v015_records_anchor_comment', sql: 'ALTER TABLE records ADD COLUMN anchor_comment VARCHAR(32) NULL' },
  { id: 'v016_records_followups', sql: "ALTER TABLE records ADD COLUMN followups VARCHAR(64) NOT NULL DEFAULT ''" },
  { id: 'v017_conditions_met_note', sql: 'ALTER TABLE conditions ADD COLUMN met_note TEXT NULL' },
  {
    id: 'v018_create_locks',
    sql: `CREATE TABLE IF NOT EXISTS locks (
      name VARCHAR(64) NOT NULL PRIMARY KEY,
      holder VARCHAR(128) NOT NULL,
      at VARCHAR(20) NOT NULL
    )`,
  },
];

export const TABLES = [
  'people',
  'cases',
  'builds',
  'runs',
  'evidence',
  'requests',
  'records',
  'conditions',
  'waivers',
  'ledger',
  'issue_changes',
  'locks',
];
