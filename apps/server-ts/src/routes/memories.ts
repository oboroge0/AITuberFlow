/**
 * Memory API Routes - CRUD for per-workflow long-term memories.
 *
 * Mounted at /api/workflows so routes read as
 * /api/workflows/:workflowId/memories(...).
 *
 * Query/mutation logic lives in `db/memories-repository.ts`, shared with the
 * in-process executor callbacks used by memory-save/memory-search nodes.
 */

import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db as defaultDb } from "../db/database";
import * as memoriesRepository from "../db/memories-repository";
import type { MemoryRow } from "../db/memories-repository";
import { workflows } from "../db/schema";

const app = new Hono();

let _db: typeof defaultDb = defaultDb;

export function setDb(newDb: typeof defaultDb): void {
  _db = newDb;
  memoriesRepository.setDb(newDb);
}

// ─── Helpers ──────────────────────────────

function memoryToResponse(row: MemoryRow) {
  return {
    id: row.id,
    workflowId: row.workflowId,
    tableName: row.tableName,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function workflowExists(workflowId: string): Promise<boolean> {
  const [row] = await _db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  return !!row;
}

// ─── Validation Schemas ──────────────────────

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

const listMemoriesQuery = z.object({
  table_name: z.string().optional(),
  search_type: z.enum(["recent", "keyword"]).default("recent"),
  query: z.string().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
});

const createMemoryBody = z.object({
  table_name: z.string({ required_error: "table_name is required" }).min(1),
  content: z.string({ required_error: "content is required" }).min(1),
});

const MAX_TABLE_NAME_LENGTH = 64;

const createMemoryTableBody = z.object({
  name: z
    .string({ required_error: "name is required" })
    .trim()
    .min(1, "name must not be empty")
    .max(MAX_TABLE_NAME_LENGTH, `name must be at most ${MAX_TABLE_NAME_LENGTH} characters`),
});

// ─── Routes ───────────────────────────────

// List memories (recent or keyword search)
app.get("/:workflowId/memories", zValidator("query", listMemoriesQuery), async (c) => {
  const workflowId = c.req.param("workflowId");
  if (!(await workflowExists(workflowId))) {
    return c.json({ detail: "Workflow not found" }, 404);
  }

  const { table_name, search_type, query, limit } = c.req.valid("query");

  if (search_type === "keyword" && !query) {
    return c.json({ error: "query is required when search_type is keyword" }, 400);
  }

  const rows = await memoriesRepository.searchMemories({
    workflowId,
    tableName: table_name,
    searchType: search_type,
    query,
    limit,
  });

  return c.json(rows.map(memoryToResponse));
});

// Create memory
app.post("/:workflowId/memories", zValidator("json", createMemoryBody), async (c) => {
  const workflowId = c.req.param("workflowId");
  if (!(await workflowExists(workflowId))) {
    return c.json({ detail: "Workflow not found" }, 404);
  }

  const body = c.req.valid("json");
  const row = await memoriesRepository.saveMemory(workflowId, body.table_name, body.content);
  return c.json(memoryToResponse(row), 201);
});

// List table names for a workflow (registered tables ∪ tables already in use)
app.get("/:workflowId/memories/tables", async (c) => {
  const workflowId = c.req.param("workflowId");
  if (!(await workflowExists(workflowId))) {
    return c.json({ detail: "Workflow not found" }, 404);
  }

  const tableNames = await memoriesRepository.listMemoryTables(workflowId);
  return c.json(tableNames);
});

// Register a new (possibly empty) memory table name. Idempotent: returns
// 200 with the existing name if it's already registered, so the node-config
// UI can call this unconditionally without checking first.
app.post(
  "/:workflowId/memories/tables",
  zValidator("json", createMemoryTableBody),
  async (c) => {
    const workflowId = c.req.param("workflowId");
    if (!(await workflowExists(workflowId))) {
      return c.json({ detail: "Workflow not found" }, 404);
    }

    const { name } = c.req.valid("json");
    const created = await memoriesRepository.createMemoryTable(workflowId, name);
    return c.json({ name: created });
  },
);

// Delete all memories for a workflow (optionally scoped to one table)
app.delete("/:workflowId/memories", async (c) => {
  const workflowId = c.req.param("workflowId");
  if (!(await workflowExists(workflowId))) {
    return c.json({ detail: "Workflow not found" }, 404);
  }

  const tableName = c.req.query("table_name");
  await memoriesRepository.deleteMemories(workflowId, tableName);
  return c.json({ status: "deleted" });
});

// Delete a single memory
app.delete("/:workflowId/memories/:id", async (c) => {
  const workflowId = c.req.param("workflowId");
  const id = c.req.param("id");

  const deleted = await memoriesRepository.deleteMemory(workflowId, id);
  if (!deleted) return c.json({ detail: "Memory not found" }, 404);

  return c.json({ status: "deleted" });
});

export { app as memoryRoutes };
