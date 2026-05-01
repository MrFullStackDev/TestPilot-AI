import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrations";

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;

  const dataDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "app.db");

  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  // Cap WAL growth: SQLite checkpoints automatically every N pages instead of
  // letting the WAL file balloon under sustained writes (long crawls/runs).
  conn.pragma("wal_autocheckpoint = 200");
  conn.pragma("foreign_keys = ON");

  const schemaPath = path.resolve(process.cwd(), "src/server/db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  conn.exec(schema);
  runMigrations(conn);

  // Best-effort integrity check on cold start. We log and continue rather than
  // refuse to boot — a corrupted DB still serves better than no app, and the
  // user can investigate via the log.
  try {
    const result = conn.pragma("integrity_check", { simple: true });
    if (result !== "ok") {
      // eslint-disable-next-line no-console
      console.error(`[db] integrity_check returned: ${result}`);
    }
  } catch {
    // ignore — integrity_check should never throw, but don't block startup
  }

  _db = conn;
  return conn;
}

export function withTx<T>(fn: (d: Database.Database) => T): T {
  const d = db();
  const tx = d.transaction(fn);
  return tx(d);
}
