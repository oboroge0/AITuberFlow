import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL || "./aituber_flow.db";

const sqlite = new Database(DATABASE_URL);
sqlite.pragma("journal_mode = WAL");

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

export function initDb(): void {
  sqlite.prepare(CREATE_TABLE_SQL).run();
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
