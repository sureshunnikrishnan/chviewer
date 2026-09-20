import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"
import { resolveDbPath } from "./paths"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  UNIQUE (provider, source_path)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_path TEXT NOT NULL UNIQUE,
  source_mtime REAL NOT NULL,
  source_size INTEGER NOT NULL,
  started_at REAL,
  updated_at REAL NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  role TEXT,
  text TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  source_offset INTEGER NOT NULL,
  timestamp REAL,
  UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_updated ON sessions(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session_seq ON events(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_role ON events(role);
`

const FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  text,
  content = 'events',
  content_rowid = 'id'
);
`

const FTS_TRIGGERS_SQL = `
CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;

CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO events_fts(rowid, text) VALUES (new.id, new.text);
END;
`

export function openDatabase(dbPath = resolveDbPath()): Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.exec("PRAGMA foreign_keys = ON")
  migrate(db)
  return db
}

function ensureColumn(
  db: Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db
    .query(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>
  if (columns.some((row) => row.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL)
  ensureColumn(db, "sessions", "event_count", "INTEGER NOT NULL DEFAULT 0")
  db.exec(FTS_SQL)
  db.exec(FTS_TRIGGERS_SQL)
}

export function closeDatabase(db: Database): void {
  db.close()
}
