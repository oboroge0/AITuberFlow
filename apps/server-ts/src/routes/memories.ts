/**
 * Memory API Routes - CRUD for per-workflow long-term memories.
 *
 * Mounted at /api/workflows so routes read as
 * /api/workflows/:workflowId/memories(...).
 */

import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, like } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db as defaultDb } from "../db/database";
import { memories, workflows } from "../db/schema";

const app = new Hono();

let _db: typeof defaultDb = defaultDb;

export function setDb(newDb: typeof defaultDb): void {
  _db = newDb;
}

// ─── Helpers ──────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

type MemoryRow = typeof memories.$inferSelect;

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

  const conditions = [eq(memories.workflowId, workflowId)];
  if (table_name) conditions.push(eq(memories.tableName, table_name));
  if (search_type === "keyword" && query) conditions.push(like(memories.content, `%${query}%`));

  const rows = await _db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(limit);

  return c.json(rows.map(memoryToResponse));
});

// Create memory
app.post("/:workflowId/memories", zValidator("json", createMemoryBody), async (c) => {
  const workflowId = c.req.param("workflowId");
  if (!(await workflowExists(workflowId))) {
    return c.json({ detail: "Workflow not found" }, 404);
  }

  const body = c.req.valid("json");
  const id = generateId();
  const now = nowISO();

  await _db.insert(memories).values({
    id,
    workflowId,
    tableName: body.table_name,
    content: body.content,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await _db.select().from(memories).where(eq(memories.id, id));
  return c.json(memoryToResponse(row), 201);
});

// List distinct table names for a workflow
app.get("/:workflowId/memories/tables", async (c) => {
  const workflowId = c.req.param("workflowId");
  if (!(await workflowExists(workflowId))) {
    return c.json({ detail: "Workflow not found" }, 404);
  }

  const rows = await _db
    .selectDistinct({ tableName: memories.tableName })
    .from(memories)
    .where(eq(memories.workflowId, workflowId));

  return c.json(rows.map((row) => row.tableName));
});

// Delete all memories for a workflow (optionally scoped to one table)
app.delete("/:workflowId/memories", async (c) => {
  const workflowId = c.req.param("workflowId");
  if (!(await workflowExists(workflowId))) {
    return c.json({ detail: "Workflow not found" }, 404);
  }

  const tableName = c.req.query("table_name");
  const conditions = [eq(memories.workflowId, workflowId)];
  if (tableName) conditions.push(eq(memories.tableName, tableName));

  await _db.delete(memories).where(and(...conditions));
  return c.json({ status: "deleted" });
});

// Delete a single memory
app.delete("/:workflowId/memories/:id", async (c) => {
  const workflowId = c.req.param("workflowId");
  const id = c.req.param("id");

  const [existing] = await _db
    .select()
    .from(memories)
    .where(and(eq(memories.id, id), eq(memories.workflowId, workflowId)));
  if (!existing) return c.json({ detail: "Memory not found" }, 404);

  await _db.delete(memories).where(eq(memories.id, id));
  return c.json({ status: "deleted" });
});

export { app as memoryRoutes };
