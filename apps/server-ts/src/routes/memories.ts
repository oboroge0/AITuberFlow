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

// List distinct table names for a workflow
app.get("/:workflowId/memories/tables", async (c) => {
  const workflowId = c.req.param("workflowId");
  if (!(await workflowExists(workflowId))) {
    return c.json({ detail: "Workflow not found" }, 404);
  }

  const tableNames = await memoriesRepository.listMemoryTables(workflowId);
  return c.json(tableNames);
});

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
