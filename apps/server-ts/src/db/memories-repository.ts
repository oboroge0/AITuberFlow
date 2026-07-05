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
import { memories, memoryTables } from "./schema";

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

/**
 * List the table names available for a workflow: the union of tables
 * explicitly registered (via `createMemoryTable`, e.g. empty tables created
 * ahead of use) and tables that already hold at least one memory row.
 * Deduplicated and sorted for a stable UI order.
 */
export async function listMemoryTables(workflowId: string): Promise<string[]> {
  const [registered, used] = await Promise.all([
    _db
      .select({ name: memoryTables.name })
      .from(memoryTables)
      .where(eq(memoryTables.workflowId, workflowId)),
    _db
      .selectDistinct({ tableName: memories.tableName })
      .from(memories)
      .where(eq(memories.workflowId, workflowId)),
  ]);

  const names = new Set<string>();
  for (const row of registered) names.add(row.name);
  for (const row of used) names.add(row.tableName);
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Register a memory table name for a workflow (idempotent — if the name is
 * already registered, this is a no-op and the existing name is returned).
 */
export async function createMemoryTable(workflowId: string, name: string): Promise<string> {
  const [existing] = await _db
    .select({ name: memoryTables.name })
    .from(memoryTables)
    .where(and(eq(memoryTables.workflowId, workflowId), eq(memoryTables.name, name)));
  if (existing) return existing.name;

  await _db.insert(memoryTables).values({
    workflowId,
    name,
    createdAt: nowISO(),
  });
  return name;
}

/** Delete all memories for a workflow, optionally scoped to a single table. */
export async function deleteMemories(workflowId: string, tableName?: string): Promise<void> {
  const conditions = [eq(memories.workflowId, workflowId)];
  if (tableName) conditions.push(eq(memories.tableName, tableName));
  await _db.delete(memories).where(and(...conditions));

  const registryConditions = [eq(memoryTables.workflowId, workflowId)];
  if (tableName) registryConditions.push(eq(memoryTables.name, tableName));
  await _db.delete(memoryTables).where(and(...registryConditions));
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
