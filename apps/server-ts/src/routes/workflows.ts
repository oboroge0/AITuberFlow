/**
 * Workflow API Routes - CRUD + execution control.
 *
 * Ported from Python apps/server/routers/workflows.py
 */

import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db as defaultDb } from "../db/database";
import { workflows } from "../db/schema";
import type { WorkflowExecutor } from "../engine/executor";
import { validateWorkflow } from "../engine/validator";
import type { WorkflowResponse } from "../models/workflow";
import type { WSBroadcaster } from "../websocket/handler";
import { maskSensitiveDeep, restoreSentinelNodes, stripSensitiveDeep } from "./sensitive-fields";

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

/** Strip sensitive fields (api keys, tokens, passwords) from exported nodes. */
function stripApiKeys(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  return nodes.map((node) => stripSensitiveDeep(node) as Record<string, unknown>);
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

/**
 * Mask sensitive config fields (api keys, tokens, passwords) in a workflow
 * response with the SENTINEL placeholder. Used for every read endpoint
 * (GET list / GET by id) so secrets are never returned in plaintext. The
 * PUT endpoint restores real values from the DB when it sees SENTINEL come
 * back in a request (see restoreSentinelNodes), and workflow execution
 * (POST /:id/start) does the same before running the workflow, so masking
 * here does not affect execution.
 */
function maskWorkflowResponse(response: WorkflowResponse): WorkflowResponse {
  return {
    ...response,
    nodes: response.nodes.map((node) => maskSensitiveDeep(node)) as WorkflowResponse["nodes"],
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

// Node `type` is used to build a filesystem path when loading plugins
// (`plugins/{type}/node.ts`), so on import we constrain it to a safe
// charset to rule out path traversal (`../`, absolute paths, etc.).
const NODE_TYPE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

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
  // Echo of client-provided data, but masked anyway so every workflow
  // response follows the same contract (secrets never appear in responses).
  return c.json(maskWorkflowResponse(workflowToResponse(row)));
});

// List workflows
app.get("/", async (c) => {
  const rows = await _db.select().from(workflows).orderBy(desc(workflows.updatedAt));
  return c.json(rows.map((row) => maskWorkflowResponse(workflowToResponse(row))));
});

// Get workflow
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!row) return c.json({ detail: "Workflow not found" }, 404);
  return c.json(maskWorkflowResponse(workflowToResponse(row)));
});

// Update workflow
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON in request body" }, 400);
  }

  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  const updates: Partial<WorkflowRow> = { updatedAt: nowISO() };
  if (typeof body.name === "string") updates.name = body.name;
  if (body.description === null || typeof body.description === "string")
    updates.description = body.description ?? null;
  if (body.nodes !== undefined) {
    // The client (editor/preview) round-trips whatever it received from
    // GET, which masks sensitive fields with SENTINEL. Restore the real
    // values from the currently-stored workflow before persisting, so we
    // never overwrite a real secret with the mask placeholder.
    const existingNodes = JSON.parse(existing.nodesJson || "[]") as Record<string, unknown>[];
    const incomingNodes = body.nodes as Record<string, unknown>[];
    updates.nodesJson = JSON.stringify(restoreSentinelNodes(incomingNodes, existingNodes));
  }
  if (body.connections !== undefined) updates.connectionsJson = JSON.stringify(body.connections);
  if (body.character !== undefined) updates.characterJson = JSON.stringify(body.character);

  await _db.update(workflows).set(updates).where(eq(workflows.id, id));

  const [row] = await _db.select().from(workflows).where(eq(workflows.id, id));
  return c.json(maskWorkflowResponse(workflowToResponse(row)));
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
  // The duplicated row keeps the real secrets in the DB (so the copy is
  // immediately runnable), but the response must be masked like every
  // other read — otherwise duplicate would be a one-call bypass of the
  // GET masking.
  return c.json(maskWorkflowResponse(workflowToResponse(row)));
});

// Export workflow
// API keys are always stripped — there is no way to opt out via query
// string. Exported files are commonly shared/uploaded elsewhere, so this
// must not be bypassable by the caller.
app.get("/:id/export", async (c) => {
  const id = c.req.param("id");

  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  const nodes = stripApiKeys(JSON.parse(existing.nodesJson || "[]"));

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
const importWorkflowBody = z
  .object({
    name: z.string().max(256).optional(),
    description: z.string().max(2048).optional().nullable(),
    nodes: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
    connections: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
    character: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    // `type` is used verbatim to build a filesystem path when loading the
    // node's plugin (plugins/{type}/node.ts), so an imported workflow
    // (e.g. a shared .json file) must not be able to smuggle path
    // traversal or other unsafe characters through it.
    data.nodes?.forEach((node, i) => {
      if (typeof node.id !== "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "node.id must be a string",
          path: ["nodes", i, "id"],
        });
      }
      if (typeof node.type !== "string" || !NODE_TYPE_PATTERN.test(node.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "node.type must be a string matching ^[A-Za-z0-9._-]{1,64}$",
          path: ["nodes", i, "type"],
        });
      }
    });
  });

app.post("/import", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON in request body" }, 400);
  }

  const parsed = importWorkflowBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "Invalid workflow payload", details: parsed.error.format() }, 400);
  }
  const data = parsed.data;

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
  // Same response contract as every other workflow endpoint: masked.
  return c.json(maskWorkflowResponse(workflowToResponse(row)));
});

// Validate workflow before execution
const validateWorkflowBody = z
  .object({
    nodes: z.array(z.record(z.string(), z.unknown())).optional(),
    connections: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .optional();

app.post("/:id/validate", async (c) => {
  const id = c.req.param("id");
  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  // Distinguish "no body" (fine — validate the saved workflow) from
  // "malformed body" (reject), same as the /:id/start endpoint.
  let body: z.infer<typeof validateWorkflowBody> = {};
  const rawText = await c.req.text();
  if (rawText.trim().length > 0) {
    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return c.json({ error: "Invalid JSON in request body" }, 400);
    }
    const parsed = validateWorkflowBody.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", details: parsed.error.format() }, 400);
    }
    body = parsed.data ?? {};
  }

  const nodes = body?.nodes ?? JSON.parse(existing.nodesJson || "[]");
  const connections = body?.connections ?? JSON.parse(existing.connectionsJson || "[]");

  const issues = await validateWorkflow({ nodes, connections });
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return c.json({
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
  });
});

// Start workflow execution
app.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  const [existing] = await _db.select().from(workflows).where(eq(workflows.id, id));
  if (!existing) return c.json({ detail: "Workflow not found" }, 404);

  // Distinguish "no body" (fine) from "malformed body" (reject).
  // Hono's c.req.text() resolves to "" when no body was sent, letting us
  // skip the JSON parse in that case. Malformed JSON still gets a 400.
  let body: Record<string, unknown> = {};
  const rawBody = await c.req.text();
  if (rawBody.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      } else {
        return c.json({ error: "Request body must be a JSON object" }, 400);
      }
    } catch {
      return c.json({ error: "Invalid JSON in request body" }, 400);
    }
  }

  // The editor/preview client sends back whatever it currently holds for
  // `nodes`, which — if the user never touched a given field this session
  // — is exactly what GET returned: SENTINEL in place of any real secret.
  // Restore real values from the stored workflow before handing config to
  // the executor, so execution always uses the actual API key rather than
  // the mask placeholder.
  const nodes =
    body.nodes !== undefined
      ? restoreSentinelNodes(
          body.nodes as Record<string, unknown>[],
          JSON.parse(existing.nodesJson || "[]") as Record<string, unknown>[],
        )
      : JSON.parse(existing.nodesJson || "[]");
  const connections =
    (body.connections as unknown[] | undefined) ?? JSON.parse(existing.connectionsJson || "[]");
  const character =
    (body.character as Record<string, unknown> | undefined) ??
    JSON.parse(existing.characterJson || "{}");
  const startNodeId = typeof body.startNodeId === "string" ? body.startNodeId : null;

  const workflowData = {
    id: existing.id,
    name: existing.name,
    nodes,
    connections,
    character,
  };

  if (wsBroadcaster) {
    wsBroadcaster.broadcast(id, "execution.started", {});
  }

  await executor.startWorkflow(id, workflowData, startNodeId);

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
