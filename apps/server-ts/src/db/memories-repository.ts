/**
 * Memories Repository - shared data-access layer for the workflow long-term
 * memory store.
 *
 * Both the `/memories` HTTP routes (`routes/memories.ts`) and the in-process
 * executor callbacks (used by the memory-save / memory-search plugins and by
 * the LLM nodes' `system` input) go through this module, so the query logic
 * — including recent/keyword search and LIKE-wildcard escaping — lives in
 * exactly one place.
 *
 * Follows the same `setDb()` injection pattern as `routes/settings.ts` so
 * tests can point this module at an in-memory database.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db as defaultDb } from "./database";
import { memories } from "./schema";

const DEFAULT_SEARCH_LIMIT = 50;

let _db: typeof defaultDb = defaultDb;

export function setDb(newDb: typeof defaultDb): void {
  _db = newDb;
}

export type MemoryRow = typeof memories.$inferSelect;

export interface SearchMemoriesParams {
  workflowId: string;
  /** Restrict to a single logical table/collection. Omit to search all tables. */
  tableName?: string;
  searchType: "recent" | "keyword";
  /** Required when searchType is "keyword". Ignored for "recent". */
  query?: string;
  limit?: number;
}

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Escape SQLite LIKE wildcards (`%`, `_`) and the escape character itself
 * (`\`) so a keyword search matches the query as a literal substring instead
 * of treating user input as a LIKE pattern.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Persist a new memory row and return the stored record. */
export async function saveMemory(
  workflowId: string,
  tableName: string,
  content: string,
): Promise<MemoryRow> {
  const id = generateId();
  const now = nowISO();

  await _db.insert(memories).values({
    id,
    workflowId,
    tableName,
    content,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await _db.select().from(memories).where(eq(memories.id, id));
  return row;
}

/** Search memories for a workflow, either the most recent rows or a keyword match. */
export async function searchMemories(params: SearchMemoriesParams): Promise<MemoryRow[]> {
  const { workflowId, tableName, searchType, query, limit } = params;

  const conditions = [eq(memories.workflowId, workflowId)];
  if (tableName) conditions.push(eq(memories.tableName, tableName));
  if (searchType === "keyword" && query) {
    const pattern = `%${escapeLikePattern(query)}%`;
    conditions.push(sql`${memories.content} LIKE ${pattern} ESCAPE '\\'`);
  }

  return await _db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(limit ?? DEFAULT_SEARCH_LIMIT);
}

/** List the distinct table names that have at least one memory for a workflow. */
export async function listMemoryTables(workflowId: string): Promise<string[]> {
  const rows = await _db
    .selectDistinct({ tableName: memories.tableName })
    .from(memories)
    .where(eq(memories.workflowId, workflowId));
  return rows.map((row) => row.tableName);
}

/** Delete all memories for a workflow, optionally scoped to a single table. */
export async function deleteMemories(workflowId: string, tableName?: string): Promise<void> {
  const conditions = [eq(memories.workflowId, workflowId)];
  if (tableName) conditions.push(eq(memories.tableName, tableName));
  await _db.delete(memories).where(and(...conditions));
}

/**
 * Delete a single memory by id, scoped to a workflow.
 *
 * @returns The deleted row, or `null` if no matching memory existed for that workflow.
 */
export async function deleteMemory(workflowId: string, id: string): Promise<MemoryRow | null> {
  const [existing] = await _db
    .select()
    .from(memories)
    .where(and(eq(memories.id, id), eq(memories.workflowId, workflowId)));
  if (!existing) return null;

  await _db.delete(memories).where(eq(memories.id, id));
  return existing;
}
