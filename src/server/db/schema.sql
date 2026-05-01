-- AI Test Gen schema. Idempotent: every CREATE uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  root_url    TEXT NOT NULL,
  framework   TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  status      TEXT DEFAULT 'discovered',
  captured_at TEXT,
  UNIQUE(project_id, url)
);

CREATE TABLE IF NOT EXISTS page_captures (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id         INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  dom_path        TEXT,
  trimmed_path    TEXT,
  a11y_path       TEXT,
  screenshot_path TEXT,
  network_path    TEXT,
  dom_hash        TEXT,
  captured_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_captures_hash ON page_captures(dom_hash);

CREATE TABLE IF NOT EXISTS site_profiles (
  project_id   INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  version      INTEGER DEFAULT 1,
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_states (
  project_id          INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  storage_state_path  TEXT NOT NULL,
  recorded_at         TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tests (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id           INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  file_path            TEXT NOT NULL,
  page_object_path     TEXT,
  locator_meta_json    TEXT,
  page_url             TEXT,
  primary_locator_key  TEXT,
  flaky_flag           INTEGER DEFAULT 0,
  flaky_reason         TEXT,
  quarantined          INTEGER DEFAULT 0,
  created_at           TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  started_at      TEXT DEFAULT (datetime('now')),
  ended_at        TEXT,
  status          TEXT DEFAULT 'running',
  raw_output_path TEXT
);

CREATE TABLE IF NOT EXISTS test_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  test_id     INTEGER REFERENCES tests(id) ON DELETE SET NULL,
  test_name   TEXT NOT NULL,
  status      TEXT NOT NULL,
  error       TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS heal_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id     INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  run_id      INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  old_locator TEXT,
  new_locator TEXT,
  rationale   TEXT,
  accepted    INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_calls (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  input_tokens   INTEGER DEFAULT 0,
  output_tokens  INTEGER DEFAULT 0,
  cached_tokens  INTEGER DEFAULT 0,
  cost_usd       REAL DEFAULT 0,
  purpose        TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_llm_calls_project ON llm_calls(project_id);

CREATE TABLE IF NOT EXISTS settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  default_provider    TEXT DEFAULT 'anthropic',
  default_model       TEXT DEFAULT 'claude-sonnet-4-6',
  cheap_model         TEXT DEFAULT 'claude-haiku-4-5-20251001',
  budget_usd          REAL DEFAULT 25,
  encrypted_keys_json TEXT,
  updated_at          TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO settings (id) VALUES (1);
