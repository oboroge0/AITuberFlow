/**
 * Workflow API Routes - CRUD + execution control.
 *
 * Ported from Python apps/server/routers/workflows.py
 */

import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db as defaultDb } from "../db/database";
import { workflows } from "../db/schema";
import type { WorkflowExecutor } from "../engine/executor";
import type { WorkflowResponse } from "../models/workflow";
import type { WSBroadcaster } from "../websocket/handler";

const app = new Hono();

// Shared instances (set by main or tests)
let _db: typeof defaultDb = defaultDb;
let executor: WorkflowExecutor;
let wsBroadcaster: WSBroadcaster | null = null;

export function setDb(newDb: typeof defaultDb): void {
  _db = newDb;
}

export function setExecutor(exec: WorkflowExecutor): void {
  executor = exec;
}

export function setWSBroadcaster(broadcaster: WSBroadcaster): void {
  wsBroadcaster = broadcaster;
}

// ─── Validation Schemas ──────────────────────

const createWorkflowBody = z.object({
  name: z.string({ required_error: "name is required" }),
  description: z.string().optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).default([]),
  connections: z.array(z.record(z.string(), z.unknown())).default([]),
  character: z.record(z.string(), z.unknown()).optional(),
});

// ─── Helpers ──────────────────────────────

const SENSITIVE_KEYS = ["apiKey", "api_key", "password", "secret", "token", "apiSecret"];

function stripApiKeys(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  return nodes.map((node) => {
    const copy = { ...node };
    if (copy.config && typeof copy.config === "object") {
      const configCopy = { ...(copy.config as Record<string, unknown>) };
      for (const key of SENSITIVE_KEYS) {
        if (key in configCopy) configCopy[key] = "";
      }
      copy.config = configCopy;
    }
    return copy;
  });
}

type WorkflowRow = typeof workflows.$inferSelect;

function workflowToResponse(row: WorkflowRow): WorkflowResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    nodes: JSON.parse(row.nodesJson || "[]"),
    connections: JSON.parse(row.connectionsJson || "[]"),
    character: JSON.parse(
      row.characterJson || '{"name": "AI Assistant", "personality": "Friendly and helpful"}',
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

// ─── Routes ───────────────────────────────

// Create workflow
app.post("/", zValidator("json", createWorkflowBody), async (c) => {
  const body = c.req.valid("json");
  const id = generateId();
  const now = nowISO();

  const nodes = body.nodes ?? [];
  const connections = body.connections ?? [];
  const character = body.character ?? {
    name: "AI Assistant",
    personality: "Friendly and helpful virtual streamer",
  };

  await _db.insert(workflows).values({
    id,
    name: body.name,
    description: body.description ?? null,
    nodesJson: JSON.stringify(nodes),
    connectionsJson: JSON.stringify(connections),
    characterJson: JSON.stringify(character),
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await _db.select().from(workflows).where(eq(workflows.id, id));
  return c.json(workflowToResponse(row));
});

// List workflows
app.get("/", async (c) => {
  const rows = await _db.select().from(workflows);
  // Sort by updatedAt descending
  rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return c.json(rows.map(workflowToResponse));
});

// Get workflow
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!row) return c.json({ detail: "Workflow not found" }, 404);
  return c.json(workflowToResponse(row));
});

// Update workflow
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  const updates: Partial<WorkflowRow> = { updatedAt: nowISO() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.nodes !== undefined) updates.nodesJson = JSON.stringify(body.nodes);
  if (body.connections !== undefined) updates.connectionsJson = JSON.stringify(body.connections);
  if (body.character !== undefined) updates.characterJson = JSON.stringify(body.character);

  await _db.update(workflows).set(updates).where(eq(workflows.id, id));

  const [row] = await _db.select().from(workflows).where(eq(workflows.id, id));
  return c.json(workflowToResponse(row));
});

// Delete workflow
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  await executor.stopWorkflow(id);
  await _db.delete(workflows).where(eq(workflows.id, id));
  return c.json({ status: "deleted" });
});

// Duplicate workflow
app.post("/:id/duplicate", async (c) => {
  const id = c.req.param("id");
  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  const newId = generateId();
  const now = nowISO();

  await _db.insert(workflows).values({
    id: newId,
    name: `${existing.name} (Copy)`,
    description: existing.description,
    nodesJson: existing.nodesJson,
    connectionsJson: existing.connectionsJson,
    characterJson: existing.characterJson,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await _db.select().from(workflows).where(eq(workflows.id, newId));
  return c.json(workflowToResponse(row));
});

// Export workflow
app.get("/:id/export", async (c) => {
  const id = c.req.param("id");
  const excludeApiKeys = c.req.query("exclude_api_keys") !== "false";

  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  let nodes = JSON.parse(existing.nodesJson || "[]");
  if (excludeApiKeys) nodes = stripApiKeys(nodes);

  return c.json({
    name: existing.name,
    description: existing.description,
    nodes,
    connections: JSON.parse(existing.connectionsJson || "[]"),
    character: JSON.parse(existing.characterJson || "{}"),
    exportedAt: nowISO(),
    version: "1.0",
  });
});

// Import workflow
app.post("/import", async (c) => {
  const data = await c.req.json();
  const id = generateId();
  const now = nowISO();

  await _db.insert(workflows).values({
    id,
    name: data.name ?? "Imported Workflow",
    description: data.description ?? null,
    nodesJson: JSON.stringify(data.nodes ?? []),
    connectionsJson: JSON.stringify(data.connections ?? []),
    characterJson: JSON.stringify(
      data.character ?? {
        name: "AI Assistant",
        personality: "Friendly",
      },
    ),
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await _db.select().from(workflows).where(eq(workflows.id, id));
  return c.json(workflowToResponse(row));
});

// Start workflow execution
app.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // No body provided
  }

  const nodes = body.nodes ?? JSON.parse(existing.nodesJson || "[]");
  const connections = body.connections ?? JSON.parse(existing.connectionsJson || "[]");
  const character = body.character ?? JSON.parse(existing.characterJson || "{}");
  const startNodeId = body.startNodeId ?? null;

  const workflowData = {
    id: existing.id,
    name: existing.name,
    nodes,
    connections,
    character,
  };

  await executor.startWorkflow(id, workflowData, startNodeId);

  if (wsBroadcaster) {
    wsBroadcaster.broadcast(id, "execution.started", {});
  }

  return c.json({ status: "started", workflow_id: id });
});

// Stop workflow execution
app.post("/:id/stop", async (c) => {
  const id = c.req.param("id");
  await executor.stopWorkflow(id);

  if (wsBroadcaster) {
    wsBroadcaster.broadcast(id, "execution.stopped", {
      reason: "HTTP stop",
    });
  }

  return c.json({ status: "stopped", workflow_id: id });
});

// Get workflow execution status
app.get("/:id/status", async (c) => {
  const id = c.req.param("id");
  const status = executor.getStatus(id);
  return c.json({
    workflowId: id,
    status: status.status ?? "idle",
    startedAt: status.started_at ?? null,
    error: status.error ?? null,
  });
});

export { app as workflowRoutes };
