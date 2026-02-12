/**
 * Workflow API Routes - Comprehensive Tests
 *
 * Tests the Hono workflow routes using a self-contained in-memory SQLite
 * database and a test Hono app that mirrors the production route handlers.
 *
 * Uses `app.request()` pattern so no running server is needed.
 * Uses `bun:sqlite` (Bun's native SQLite) instead of better-sqlite3.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// ─── Schema (mirrors apps/server-ts/src/db/schema.ts) ─────────

const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  nodesJson: text("nodes_json").notNull().default("[]"),
  connectionsJson: text("connections_json").notNull().default("[]"),
  characterJson: text("character_json").default(
    '{"name": "AI Assistant", "personality": "Friendly and helpful"}'
  ),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Test Database ─────────────────────────────────────────────

let sqlite: Database;
let db: ReturnType<typeof drizzle>;

function setupTestDb(): void {
  sqlite = new Database(":memory:");
  sqlite.run(`
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
  `);
  db = drizzle(sqlite, { schema: { workflows } });
}

function resetDb(): void {
  sqlite.run("DELETE FROM workflows");
}

function teardownDb(): void {
  sqlite.close();
}

// ─── Helpers (mirrors production routes) ───────────────────────

const SENSITIVE_KEYS = [
  "apiKey",
  "api_key",
  "password",
  "secret",
  "token",
  "apiSecret",
];

function stripApiKeys(nodes: any[]): any[] {
  return nodes.map((node) => {
    const copy = { ...node };
    if (copy.config && typeof copy.config === "object") {
      const configCopy = { ...copy.config };
      for (const key of SENSITIVE_KEYS) {
        if (key in configCopy) configCopy[key] = "";
      }
      copy.config = configCopy;
    }
    return copy;
  });
}

function workflowToResponse(row: any): Record<string, any> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    nodes: JSON.parse(row.nodesJson || "[]"),
    connections: JSON.parse(row.connectionsJson || "[]"),
    character: JSON.parse(
      row.characterJson ||
        '{"name": "AI Assistant", "personality": "Friendly and helpful"}'
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

// ─── Mock Executor ─────────────────────────────────────────────

const mockExecutor = {
  startWorkflow: async (
    _id: string,
    _data: any,
    _startNodeId?: string | null
  ) => {},
  stopWorkflow: async (_id: string) => {},
  getStatus: (_id: string) => ({ status: "idle" } as Record<string, any>),
  setLogCallback: () => {},
  setEventCallback: () => {},
  setStatusCallback: () => {},
};

// ─── Test Hono App ─────────────────────────────────────────────

function createTestApp(): Hono {
  const app = new Hono();

  // POST /api/workflows - Create workflow
  app.post("/api/workflows", async (c) => {
    const body = await c.req.json();
    const id = generateId();
    const now = nowISO();

    const nodes = body.nodes ?? [];
    const connections = body.connections ?? [];
    const character = body.character ?? {
      name: "AI Assistant",
      personality: "Friendly and helpful virtual streamer",
    };

    await db.insert(workflows).values({
      id,
      name: body.name,
      description: body.description ?? null,
      nodesJson: JSON.stringify(nodes),
      connectionsJson: JSON.stringify(connections),
      characterJson: JSON.stringify(character),
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
    return c.json(workflowToResponse(row));
  });

  // GET /api/workflows - List workflows
  app.get("/api/workflows", async (c) => {
    const rows = await db.select().from(workflows);
    rows.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return c.json(rows.map(workflowToResponse));
  });

  // GET /api/workflows/:id - Get workflow
  app.get("/api/workflows/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
    if (!row) return c.json({ detail: "Workflow not found" }, 404);
    return c.json(workflowToResponse(row));
  });

  // PUT /api/workflows/:id - Update workflow
  app.put("/api/workflows/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();

    const [existing] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
    if (!existing) return c.json({ detail: "Workflow not found" }, 404);

    const updates: Record<string, any> = { updatedAt: nowISO() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.nodes !== undefined)
      updates.nodesJson = JSON.stringify(body.nodes);
    if (body.connections !== undefined)
      updates.connectionsJson = JSON.stringify(body.connections);
    if (body.character !== undefined)
      updates.characterJson = JSON.stringify(body.character);

    await db.update(workflows).set(updates).where(eq(workflows.id, id));

    const [row] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
    return c.json(workflowToResponse(row));
  });

  // DELETE /api/workflows/:id - Delete workflow
  app.delete("/api/workflows/:id", async (c) => {
    const id = c.req.param("id");
    const [existing] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
    if (!existing) return c.json({ detail: "Workflow not found" }, 404);

    await mockExecutor.stopWorkflow(id);
    await db.delete(workflows).where(eq(workflows.id, id));
    return c.json({ status: "deleted" });
  });

  // POST /api/workflows/:id/duplicate - Duplicate workflow
  app.post("/api/workflows/:id/duplicate", async (c) => {
    const id = c.req.param("id");
    const [existing] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
    if (!existing) return c.json({ detail: "Workflow not found" }, 404);

    const newId = generateId();
    const now = nowISO();

    await db.insert(workflows).values({
      id: newId,
      name: `${existing.name} (Copy)`,
      description: existing.description,
      nodesJson: existing.nodesJson,
      connectionsJson: existing.connectionsJson,
      characterJson: existing.characterJson,
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, newId));
    return c.json(workflowToResponse(row));
  });

  // GET /api/workflows/:id/export - Export workflow
  app.get("/api/workflows/:id/export", async (c) => {
    const id = c.req.param("id");
    const excludeApiKeys = c.req.query("exclude_api_keys") !== "false";

    const [existing] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
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

  // POST /api/workflows/import - Import workflow
  app.post("/api/workflows/import", async (c) => {
    const data = await c.req.json();
    const id = generateId();
    const now = nowISO();

    await db.insert(workflows).values({
      id,
      name: data.name ?? "Imported Workflow",
      description: data.description ?? null,
      nodesJson: JSON.stringify(data.nodes ?? []),
      connectionsJson: JSON.stringify(data.connections ?? []),
      characterJson: JSON.stringify(
        data.character ?? {
          name: "AI Assistant",
          personality: "Friendly",
        }
      ),
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
    return c.json(workflowToResponse(row));
  });

  // POST /api/workflows/:id/start - Start workflow execution
  app.post("/api/workflows/:id/start", async (c) => {
    const id = c.req.param("id");
    const [existing] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id));
    if (!existing) return c.json({ detail: "Workflow not found" }, 404);

    return c.json({ status: "started", workflow_id: id });
  });

  // POST /api/workflows/:id/stop - Stop workflow execution
  app.post("/api/workflows/:id/stop", async (c) => {
    const id = c.req.param("id");
    await mockExecutor.stopWorkflow(id);
    return c.json({ status: "stopped", workflow_id: id });
  });

  // GET /api/workflows/:id/status - Get workflow execution status
  app.get("/api/workflows/:id/status", async (c) => {
    const id = c.req.param("id");
    const status = mockExecutor.getStatus(id);
    return c.json({
      workflowId: id,
      status: status.status ?? "idle",
      startedAt: status.started_at ?? null,
      error: status.error ?? null,
    });
  });

  return app;
}

// ─── Request Helpers ───────────────────────────────────────────

function jsonRequest(
  method: string,
  path: string,
  body?: Record<string, any>
): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init);
}

async function createWorkflowViaApi(
  testApp: Hono,
  overrides: Record<string, any> = {}
): Promise<any> {
  const payload = {
    name: "Test Workflow",
    description: "A test workflow",
    ...overrides,
  };
  const res = await testApp.request(
    jsonRequest("POST", "/api/workflows", payload)
  );
  return res.json();
}

// ─── Tests ─────────────────────────────────────────────────────

let app: Hono;

beforeAll(() => {
  setupTestDb();
  app = createTestApp();
});

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  teardownDb();
});

// ═══════════════════════════════════════════════════════════════
// Workflow CRUD
// ═══════════════════════════════════════════════════════════════

describe("Workflow CRUD", () => {
  it("should create a workflow", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows", {
        name: "My Workflow",
        description: "Test description",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe("string");
    expect(data.name).toBe("My Workflow");
    expect(data.description).toBe("Test description");
    expect(data.nodes).toEqual([]);
    expect(data.connections).toEqual([]);
    expect(data.character).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it("should list workflows when empty", async () => {
    const res = await app.request(
      new Request("http://localhost/api/workflows", { method: "GET" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("should list workflows with data", async () => {
    await createWorkflowViaApi(app, { name: "Workflow A" });
    await createWorkflowViaApi(app, { name: "Workflow B" });
    await createWorkflowViaApi(app, { name: "Workflow C" });

    const res = await app.request(
      new Request("http://localhost/api/workflows", { method: "GET" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(3);

    // Verify all names are present
    const names = data.map((w: any) => w.name);
    expect(names).toContain("Workflow A");
    expect(names).toContain("Workflow B");
    expect(names).toContain("Workflow C");
  });

  it("should get a workflow by id", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Fetch Me",
      description: "Fetchable",
    });

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}`, {
        method: "GET",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(created.id);
    expect(data.name).toBe("Fetch Me");
    expect(data.description).toBe("Fetchable");
  });

  it("should return 404 for non-existent workflow", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(
      new Request(`http://localhost/api/workflows/${fakeId}`, {
        method: "GET",
      })
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toBe("Workflow not found");
  });

  it("should update a workflow", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Original Name",
      description: "Original Desc",
    });

    // Small delay to ensure updatedAt differs
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await app.request(
      jsonRequest("PUT", `/api/workflows/${created.id}`, {
        name: "Updated Name",
        description: "Updated Desc",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(created.id);
    expect(data.name).toBe("Updated Name");
    expect(data.description).toBe("Updated Desc");
    // updatedAt should have changed
    expect(data.updatedAt).not.toBe(created.updatedAt);
  });

  it("should return 404 when updating non-existent workflow", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(
      jsonRequest("PUT", `/api/workflows/${fakeId}`, {
        name: "Does Not Exist",
      })
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toBe("Workflow not found");
  });

  it("should delete a workflow", async () => {
    const created = await createWorkflowViaApi(app, { name: "Delete Me" });

    const deleteRes = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}`, {
        method: "DELETE",
      })
    );

    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.status).toBe("deleted");

    // Verify it is gone
    const getRes = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}`, {
        method: "GET",
      })
    );
    expect(getRes.status).toBe(404);
  });

  it("should return 404 when deleting non-existent workflow", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(
      new Request(`http://localhost/api/workflows/${fakeId}`, {
        method: "DELETE",
      })
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toBe("Workflow not found");
  });
});

// ═══════════════════════════════════════════════════════════════
// Workflow Duplication
// ═══════════════════════════════════════════════════════════════

describe("Workflow Duplication", () => {
  it("should duplicate a workflow", async () => {
    const original = await createWorkflowViaApi(app, {
      name: "Original",
      description: "To be duplicated",
      nodes: [{ id: "n1", type: "test-node", config: {} }],
      connections: [
        {
          id: "c1",
          from: { nodeId: "n1", port: "out" },
          to: { nodeId: "n2", port: "in" },
        },
      ],
    });

    const res = await app.request(
      jsonRequest("POST", `/api/workflows/${original.id}/duplicate`)
    );

    expect(res.status).toBe(200);
    const duplicate = await res.json();

    // Different id
    expect(duplicate.id).toBeDefined();
    expect(duplicate.id).not.toBe(original.id);

    // Name has " (Copy)" suffix
    expect(duplicate.name).toBe("Original (Copy)");

    // Same description, nodes, connections
    expect(duplicate.description).toBe(original.description);
    expect(duplicate.nodes).toEqual(original.nodes);
    expect(duplicate.connections).toEqual(original.connections);

    // Has its own timestamps
    expect(duplicate.createdAt).toBeDefined();
    expect(duplicate.updatedAt).toBeDefined();
  });

  it("should return 404 when duplicating non-existent workflow", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(
      jsonRequest("POST", `/api/workflows/${fakeId}/duplicate`)
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toBe("Workflow not found");
  });
});

// ═══════════════════════════════════════════════════════════════
// Workflow Export / Import
// ═══════════════════════════════════════════════════════════════

describe("Workflow Export / Import", () => {
  it("should export a workflow", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Exportable",
      description: "For export",
      nodes: [{ id: "n1", type: "llm-node", config: { model: "gpt-4" } }],
      connections: [],
    });

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}/export`, {
        method: "GET",
      })
    );

    expect(res.status).toBe(200);
    const exported = await res.json();

    // Has expected export fields
    expect(exported.version).toBe("1.0");
    expect(exported.exportedAt).toBeDefined();
    expect(exported.name).toBe("Exportable");
    expect(exported.description).toBe("For export");
    expect(exported.nodes).toHaveLength(1);
    expect(exported.connections).toEqual([]);
    expect(exported.character).toBeDefined();

    // Does NOT have an id field (export is id-free)
    expect(exported.id).toBeUndefined();
  });

  it("should strip API keys from export by default", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Secret Workflow",
      nodes: [
        {
          id: "n1",
          type: "llm-node",
          config: {
            model: "gpt-4",
            apiKey: "sk-secret-123",
            temperature: 0.7,
          },
        },
      ],
    });

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}/export`, {
        method: "GET",
      })
    );

    expect(res.status).toBe(200);
    const exported = await res.json();

    // apiKey should be stripped to empty string
    expect(exported.nodes[0].config.apiKey).toBe("");
    // Non-sensitive config values remain
    expect(exported.nodes[0].config.model).toBe("gpt-4");
    expect(exported.nodes[0].config.temperature).toBe(0.7);
  });

  it("should preserve API keys when exclude_api_keys=false", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Keep Keys",
      nodes: [
        {
          id: "n1",
          type: "llm-node",
          config: { apiKey: "sk-keep-me" },
        },
      ],
    });

    const res = await app.request(
      new Request(
        `http://localhost/api/workflows/${created.id}/export?exclude_api_keys=false`,
        { method: "GET" }
      )
    );

    expect(res.status).toBe(200);
    const exported = await res.json();
    expect(exported.nodes[0].config.apiKey).toBe("sk-keep-me");
  });

  it("should import a workflow", async () => {
    const importData = {
      name: "Imported Flow",
      description: "Imported from file",
      nodes: [{ id: "n1", type: "console-output", config: {} }],
      connections: [],
      character: { name: "Bot", personality: "Chill" },
    };

    const res = await app.request(
      jsonRequest("POST", "/api/workflows/import", importData)
    );

    expect(res.status).toBe(200);
    const imported = await res.json();

    expect(imported.id).toBeDefined();
    expect(imported.name).toBe("Imported Flow");
    expect(imported.description).toBe("Imported from file");
    expect(imported.nodes).toEqual(importData.nodes);
    expect(imported.connections).toEqual([]);
    expect(imported.character).toEqual({ name: "Bot", personality: "Chill" });
    expect(imported.createdAt).toBeDefined();
    expect(imported.updatedAt).toBeDefined();
  });

  it("should import a workflow with minimal data", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows/import", {})
    );

    expect(res.status).toBe(200);
    const imported = await res.json();

    expect(imported.id).toBeDefined();
    expect(imported.name).toBe("Imported Workflow");
    expect(imported.description).toBeNull();
    expect(imported.nodes).toEqual([]);
    expect(imported.connections).toEqual([]);
    expect(imported.character).toEqual({
      name: "AI Assistant",
      personality: "Friendly",
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Workflow Execution
// ═══════════════════════════════════════════════════════════════

describe("Workflow Execution", () => {
  it("should start a workflow", async () => {
    const created = await createWorkflowViaApi(app, { name: "Runnable" });

    const res = await app.request(
      jsonRequest("POST", `/api/workflows/${created.id}/start`)
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("started");
    expect(data.workflow_id).toBe(created.id);
  });

  it("should return 404 when starting non-existent workflow", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(
      jsonRequest("POST", `/api/workflows/${fakeId}/start`)
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toBe("Workflow not found");
  });

  it("should stop a workflow", async () => {
    const created = await createWorkflowViaApi(app, { name: "Stoppable" });

    const res = await app.request(
      jsonRequest("POST", `/api/workflows/${created.id}/stop`)
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("stopped");
    expect(data.workflow_id).toBe(created.id);
  });

  it("should get workflow execution status", async () => {
    const created = await createWorkflowViaApi(app, { name: "Statusful" });

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}/status`, {
        method: "GET",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.workflowId).toBe(created.id);
    expect(data.status).toBe("idle");
    expect(data.startedAt).toBeNull();
    expect(data.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Workflow with Nodes
// ═══════════════════════════════════════════════════════════════

describe("Workflow with Nodes", () => {
  it("should create a workflow with nodes and connections", async () => {
    const nodes = [
      { id: "n1", type: "chat-input", config: { platform: "youtube" } },
      { id: "n2", type: "llm-openai", config: { model: "gpt-4o" } },
      { id: "n3", type: "console-output", config: {} },
    ];
    const connections = [
      {
        id: "c1",
        from: { nodeId: "n1", port: "text" },
        to: { nodeId: "n2", port: "prompt" },
      },
      {
        id: "c2",
        from: { nodeId: "n2", port: "response" },
        to: { nodeId: "n3", port: "text" },
      },
    ];
    const character = {
      name: "Zundamon",
      personality: "Energetic and curious",
    };

    const res = await app.request(
      jsonRequest("POST", "/api/workflows", {
        name: "Full Pipeline",
        description: "Chat to LLM to console",
        nodes,
        connections,
        character,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.nodes).toHaveLength(3);
    expect(data.nodes[0].id).toBe("n1");
    expect(data.nodes[0].type).toBe("chat-input");
    expect(data.nodes[0].config.platform).toBe("youtube");

    expect(data.connections).toHaveLength(2);
    expect(data.connections[0].from.nodeId).toBe("n1");
    expect(data.connections[1].to.nodeId).toBe("n3");

    expect(data.character.name).toBe("Zundamon");
    expect(data.character.personality).toBe("Energetic and curious");
  });

  it("should update workflow nodes", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Updatable Nodes",
      nodes: [{ id: "n1", type: "old-node", config: {} }],
      connections: [],
    });

    expect(created.nodes).toHaveLength(1);
    expect(created.nodes[0].type).toBe("old-node");

    const newNodes = [
      { id: "n1", type: "new-node-a", config: { key: "value1" } },
      { id: "n2", type: "new-node-b", config: { key: "value2" } },
    ];
    const newConnections = [
      {
        id: "c1",
        from: { nodeId: "n1", port: "out" },
        to: { nodeId: "n2", port: "in" },
      },
    ];

    const res = await app.request(
      jsonRequest("PUT", `/api/workflows/${created.id}`, {
        nodes: newNodes,
        connections: newConnections,
      })
    );

    expect(res.status).toBe(200);
    const updated = await res.json();

    expect(updated.nodes).toHaveLength(2);
    expect(updated.nodes[0].type).toBe("new-node-a");
    expect(updated.nodes[1].type).toBe("new-node-b");
    expect(updated.connections).toHaveLength(1);
    expect(updated.connections[0].from.nodeId).toBe("n1");
    expect(updated.connections[0].to.nodeId).toBe("n2");

    // Name should remain unchanged
    expect(updated.name).toBe("Updatable Nodes");
  });

  it("should update only the character without changing nodes", async () => {
    const originalNodes = [{ id: "n1", type: "keep-me", config: {} }];
    const created = await createWorkflowViaApi(app, {
      name: "Character Update",
      nodes: originalNodes,
    });

    const res = await app.request(
      jsonRequest("PUT", `/api/workflows/${created.id}`, {
        character: { name: "New Character", personality: "Serious" },
      })
    );

    expect(res.status).toBe(200);
    const updated = await res.json();

    // Nodes should be unchanged
    expect(updated.nodes).toEqual(originalNodes);
    // Character should be updated
    expect(updated.character.name).toBe("New Character");
    expect(updated.character.personality).toBe("Serious");
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe("Edge Cases", () => {
  it("should handle workflow with empty name gracefully", async () => {
    // The production route does not validate name length; it trusts the DB
    // NOT NULL constraint. An empty string is still valid.
    const res = await app.request(
      jsonRequest("POST", "/api/workflows", { name: "" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("");
  });

  it("should handle partial updates (only name)", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Before",
      description: "Keep me",
    });

    const res = await app.request(
      jsonRequest("PUT", `/api/workflows/${created.id}`, {
        name: "After",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("After");
    expect(data.description).toBe("Keep me");
  });

  it("should list workflows sorted by updatedAt descending", async () => {
    // Create workflows with slight delays to ensure ordering
    const w1 = await createWorkflowViaApi(app, { name: "First" });

    // Force a different updatedAt by updating w1 after creating w2
    const w2 = await createWorkflowViaApi(app, { name: "Second" });

    // Small delay to ensure updatedAt differs
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Update w1 so its updatedAt is newer than w2
    await app.request(
      jsonRequest("PUT", `/api/workflows/${w1.id}`, {
        name: "First (Updated)",
      })
    );

    const res = await app.request(
      new Request("http://localhost/api/workflows", { method: "GET" })
    );
    const data = await res.json();

    expect(data).toHaveLength(2);
    // w1 was updated more recently, so it should come first
    expect(data[0].name).toBe("First (Updated)");
    expect(data[1].name).toBe("Second");
  });

  it("should round-trip export and import", async () => {
    const original = await createWorkflowViaApi(app, {
      name: "Round Trip",
      description: "Test round trip",
      nodes: [{ id: "n1", type: "test", config: { value: 42 } }],
      connections: [
        {
          id: "c1",
          from: { nodeId: "n1", port: "out" },
          to: { nodeId: "n2", port: "in" },
        },
      ],
      character: { name: "Tester", personality: "Methodical" },
    });

    // Export
    const exportRes = await app.request(
      new Request(
        `http://localhost/api/workflows/${original.id}/export?exclude_api_keys=false`,
        { method: "GET" }
      )
    );
    const exported = await exportRes.json();

    // Import the exported data
    const importRes = await app.request(
      jsonRequest("POST", "/api/workflows/import", exported)
    );
    const imported = await importRes.json();

    // Verify the imported workflow matches the original data
    expect(imported.name).toBe(original.name);
    expect(imported.description).toBe(original.description);
    expect(imported.nodes).toEqual(original.nodes);
    expect(imported.connections).toEqual(original.connections);
    expect(imported.character).toEqual(original.character);

    // But it should have a new id
    expect(imported.id).not.toBe(original.id);
  });
});
