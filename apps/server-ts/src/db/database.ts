import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL || "./aituber_flow.db";

const sqlite = new Database(DATABASE_URL, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

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

export function initDb(): void {
  sqlite.exec(CREATE_TABLE_SQL);
  sqlite.exec(CREATE_GLOBAL_SETTINGS_SQL);
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
