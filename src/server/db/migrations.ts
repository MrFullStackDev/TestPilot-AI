// Tiny migration runner. Tracks `pragma user_version`; each migration runs once.
// Migrations are pure SQL strings; we keep them in this file so they ship with the code.
//
// Migrations are tolerant of statements that may already be reflected in
// schema.sql (which runs first on every cold start). For instance, ALTER TABLE
// ADD COLUMN may fail with "duplicate column name" on a fresh DB where
// schema.sql already created the column — that's safe to ignore. Any other
// SQLite error aborts.

import type Database from "better-sqlite3";

type Migration = { id: number; up: string[] };

// Each migration's `up` is a list of statements. Each statement runs in its
// own try block so a benign "already exists" / "duplicate column" doesn't
// roll back the rest. Statements are pure DDL/DML.
const MIGRATIONS: Migration[] = [
  {
    id: 1,
    up: [
      `ALTER TABLE tests ADD COLUMN page_url TEXT`,
      `ALTER TABLE tests ADD COLUMN primary_locator_key TEXT`,
    ],
  },
  {
    id: 2,
    up: [
      `CREATE TABLE IF NOT EXISTS conversations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT NOT NULL DEFAULT 'New conversation',
        provider    TEXT,
        model       TEXT,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL,
        content         TEXT NOT NULL,
        tool_calls_json TEXT,
        web_results_json TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id)`,
    ],
  },
  {
    id: 3,
    up: [
      // BYOK-only: drop any leftover server-stored encrypted keys from prior versions.
      `UPDATE settings SET encrypted_keys_json = NULL WHERE encrypted_keys_json IS NOT NULL`,
    ],
  },
  {
    // heal_events.test_id originally used ON DELETE SET NULL, which leaves
    // dangling rows after a test is removed. Switch to ON DELETE CASCADE by
    // rebuilding the table — SQLite can't ALTER an existing FK constraint.
    // Drop ALSO orphaned rows from prior installs (test_id IS NULL).
    id: 4,
    up: [
      `DELETE FROM heal_events WHERE test_id IS NULL`,
      `CREATE TABLE heal_events_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id     INTEGER REFERENCES tests(id) ON DELETE CASCADE,
        run_id      INTEGER REFERENCES runs(id) ON DELETE SET NULL,
        old_locator TEXT,
        new_locator TEXT,
        rationale   TEXT,
        accepted    INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now'))
      )`,
      `INSERT INTO heal_events_new (id, test_id, run_id, old_locator, new_locator, rationale, accepted, created_at)
         SELECT id, test_id, run_id, old_locator, new_locator, rationale, accepted, created_at FROM heal_events`,
      `DROP TABLE heal_events`,
      `ALTER TABLE heal_events_new RENAME TO heal_events`,
    ],
  },
];

const BENIGN_ERRORS = [
  /duplicate column name/i,
  /table .* already exists/i,
  /index .* already exists/i,
];

export function runMigrations(conn: Database.Database) {
  const sorted = [...MIGRATIONS].sort((a, b) => a.id - b.id);
  const current = (conn.pragma("user_version", { simple: true }) as number) ?? 0;
  for (const m of sorted) {
    if (m.id <= current) continue;
    conn.transaction(() => {
      for (const stmt of m.up) {
        try {
          conn.exec(stmt);
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          if (BENIGN_ERRORS.some((re) => re.test(msg))) continue;
          throw e;
        }
      }
      conn.pragma(`user_version = ${m.id}`);
    })();
  }
}
