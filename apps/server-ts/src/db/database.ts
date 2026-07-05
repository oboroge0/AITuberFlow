import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL || "./aituber_flow.db";

const sqlite = new Database(DATABASE_URL, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

/**
 * Close the underlying SQLite handle. Call during graceful shutdown to flush
 * the WAL and release file locks.
 */
export function closeDb(): void {
  try {
    sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // ignore — the close below still completes
  }
  sqlite.close();
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    nodes_json TEXT NOT NULL DEFAULT '[]',
    connections_json TEXT NOT NULL DEFAULT '[]',
    character_json TEXT DEFAULT '{"name": "AI Assistant", "personality": "Friendly and helpful"}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_GLOBAL_SETTINGS_SQL = `
  CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_MEMORIES_SQL = `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_MEMORIES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS memories_workflow_table_idx
  ON memories (workflow_id, table_name)
`;

const CREATE_MEMORY_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS memory_tables (
    workflow_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

const CREATE_MEMORY_TABLES_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS memory_tables_workflow_name_idx
  ON memory_tables (workflow_id, name)
`;

export function initDb(): void {
  sqlite.exec(CREATE_TABLE_SQL);
  sqlite.exec(CREATE_GLOBAL_SETTINGS_SQL);
  sqlite.exec(CREATE_MEMORIES_SQL);
  sqlite.exec(CREATE_MEMORIES_INDEX_SQL);
  sqlite.exec(CREATE_MEMORY_TABLES_SQL);
  sqlite.exec(CREATE_MEMORY_TABLES_INDEX_SQL);
}

// ─── JSON helpers ───────────────────────────────────────────────

export function parseJsonColumn<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function toJsonColumn(value: unknown): string {
  return JSON.stringify(value);
}
