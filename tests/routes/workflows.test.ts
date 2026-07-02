/**
 * Workflow API Routes - Comprehensive Tests
 *
 * Tests the PRODUCTION Hono workflow routes using an in-memory SQLite
 * database injected via setDb(). This ensures test coverage catches
 * regressions in the actual route handlers.
 *
 * Uses `app.request()` pattern so no running server is needed.
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
import {
  workflowRoutes,
  setDb,
  setExecutor,
} from "../../apps/server-ts/src/routes/workflows";
import { workflows } from "../../apps/server-ts/src/db/schema";

// ─── Test Database ─────────────────────────────────────────────

let sqlite: Database;

function setupTestDb(): ReturnType<typeof drizzle> {
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
  return drizzle(sqlite, { schema: { workflows } });
}

function resetDb(): void {
  sqlite.run("DELETE FROM workflows");
}

function teardownDb(): void {
  sqlite.close();
}

// ─── Mock Executor ─────────────────────────────────────────────

// Captures the args of the most recent startWorkflow() call so tests can
// assert on what config the executor actually received (real secret vs.
// sentinel placeholder).
let lastStartCall: { id: string; data: any; startNodeId?: string | null } | null = null;

const mockExecutor = {
  startWorkflow: async (
    id: string,
    data: any,
    startNodeId?: string | null
  ) => {
    lastStartCall = { id, data, startNodeId };
  },
  stopWorkflow: async (_id: string) => {},
  getStatus: (_id: string) => ({ status: "idle" } as Record<string, any>),
  setLogCallback: () => {},
  setEventCallback: () => {},
  setStatusCallback: () => {},
};

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

// ─── Setup ────────────────────────────────────────────────────

let app: Hono;

beforeAll(() => {
  const testDb = setupTestDb();
  setDb(testDb);
  setExecutor(mockExecutor as any);

  app = new Hono();
  app.route("/api/workflows", workflowRoutes);
});

beforeEach(() => {
  resetDb();
  lastStartCall = null;
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

  it("should reject create without name", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows", {
        description: "Missing name",
      })
    );

    expect(res.status).toBe(400);
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

  it("should NOT preserve API keys even when exclude_api_keys=false is passed (query param removed)", async () => {
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

    // exclude_api_keys is no longer a supported opt-out — export always
    // strips secrets regardless of what the caller passes here.
    const res = await app.request(
      new Request(
        `http://localhost/api/workflows/${created.id}/export?exclude_api_keys=false`,
        { method: "GET" }
      )
    );

    expect(res.status).toBe(200);
    const exported = await res.json();
    expect(exported.nodes[0].config.apiKey).toBe("");
  });

  it("should strip API keys nested deep inside config (deep strip)", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Deep Secret",
      nodes: [
        {
          id: "n1",
          type: "custom",
          config: {
            nested: {
              deep: { apiKey: "sk-deep-hidden", harmless: "ok" },
              authentication: { token: "t-leak" },
            },
            headers: { Authorization: "keep" }, // not in sensitive list
            api_key: "snake-case-secret",
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
    const cfg = exported.nodes[0].config;
    expect(cfg.nested.deep.apiKey).toBe("");
    expect(cfg.nested.deep.harmless).toBe("ok");
    expect(cfg.nested.authentication.token).toBe("");
    expect(cfg.api_key).toBe("");
    // Non-sensitive fields preserved
    expect(cfg.headers.Authorization).toBe("keep");
  });

  it("should reject import with invalid payload shape", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows/import", {
        nodes: "not an array", // invalid
      })
    );
    expect(res.status).toBe(400);
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
    expect(imported.description).toBeUndefined();
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

  it("should reject start with malformed JSON body", async () => {
    const created = await createWorkflowViaApi(app, { name: "Bad body" });
    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not valid json",
      })
    );
    expect(res.status).toBe(400);
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
    // An empty string is still a valid string and passes NOT NULL constraint.
    const res = await app.request(
      jsonRequest("POST", "/api/workflows", { name: "" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("");
  });

  it("should partial updates (only name)", async () => {
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
      new Request(`http://localhost/api/workflows/${original.id}/export`, {
        method: "GET",
      })
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

// ═══════════════════════════════════════════════════════════════
// Workflow Validation Endpoint (body handling)
// ═══════════════════════════════════════════════════════════════

describe("Workflow validate body handling", () => {
  it("should validate the saved workflow when no body is sent", async () => {
    const created = await createWorkflowViaApi(app);

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}/validate`, {
        method: "POST",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBeDefined();
    expect(Array.isArray(data.errors)).toBe(true);
  });

  it("should return 400 for malformed JSON body", async () => {
    const created = await createWorkflowViaApi(app);

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ this is not json",
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("should validate provided nodes when a valid body is sent", async () => {
    const created = await createWorkflowViaApi(app);

    const res = await app.request(
      jsonRequest("POST", `/api/workflows/${created.id}/validate`, {
        nodes: [],
        connections: [],
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Sensitive field masking (GET) / restoration (PUT, start)
// ═══════════════════════════════════════════════════════════════

const SENTINEL = "********";

describe("Sensitive field masking on read endpoints", () => {
  it("should mask a non-empty API key with SENTINEL on GET /:id", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Has Secret",
      nodes: [
        {
          id: "n1",
          type: "llm-node",
          config: { model: "gpt-4", apiKey: "sk-real-secret", temperature: 0.7 },
        },
      ],
    });

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}`, { method: "GET" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nodes[0].config.apiKey).toBe(SENTINEL);
    // Non-sensitive fields are untouched
    expect(data.nodes[0].config.model).toBe("gpt-4");
    expect(data.nodes[0].config.temperature).toBe(0.7);
  });

  it("should leave an empty API key empty (not masked) on GET /:id", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "No Secret Yet",
      nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "" } }],
    });

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}`, { method: "GET" })
    );
    const data = await res.json();
    expect(data.nodes[0].config.apiKey).toBe("");
  });

  it("should not mask non-sensitive fields that merely resemble config, e.g. modelUrl/host", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Avatar Node",
      nodes: [
        {
          id: "n1",
          type: "avatar-configuration",
          config: { modelUrl: "https://example.com/model.vrm", host: "localhost", maxTokens: 512 },
        },
      ],
    });

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}`, { method: "GET" })
    );
    const data = await res.json();
    expect(data.nodes[0].config.modelUrl).toBe("https://example.com/model.vrm");
    expect(data.nodes[0].config.host).toBe("localhost");
    expect(data.nodes[0].config.maxTokens).toBe(512);
  });

  it("should mask composite sensitive field names (botToken, oauthToken, llmApiKey)", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Composite Keys",
      nodes: [
        { id: "n1", type: "discord-chat", config: { botToken: "d-token-real" } },
        { id: "n2", type: "twitch-chat", config: { oauthToken: "oauth:real" } },
        { id: "n3", type: "emotion-analyzer", config: { llmApiKey: "sk-real" } },
      ],
    });

    const res = await app.request(
      new Request(`http://localhost/api/workflows/${created.id}`, { method: "GET" })
    );
    const data = await res.json();
    expect(data.nodes[0].config.botToken).toBe(SENTINEL);
    expect(data.nodes[1].config.oauthToken).toBe(SENTINEL);
    expect(data.nodes[2].config.llmApiKey).toBe(SENTINEL);
  });

  it("should mask sensitive fields on GET / (list) as well", async () => {
    await createWorkflowViaApi(app, {
      name: "Listed Secret",
      nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "sk-listed" } }],
    });

    const res = await app.request(
      new Request("http://localhost/api/workflows", { method: "GET" })
    );
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].nodes[0].config.apiKey).toBe(SENTINEL);
  });

  it("should mask the duplicate response while keeping the real key stored in the DB copy", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Duplicated Secret",
      nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "sk-dup-secret" } }],
    });

    // The duplicate response must NOT leak the source workflow's real key
    // (otherwise duplicate would be a one-call bypass of the GET masking).
    const dupRes = await app.request(
      jsonRequest("POST", `/api/workflows/${created.id}/duplicate`)
    );
    expect(dupRes.status).toBe(200);
    const dup = await dupRes.json();
    expect(dup.nodes[0].config.apiKey).toBe(SENTINEL);
    expect(JSON.stringify(dup)).not.toContain("sk-dup-secret");

    // ...but the DB copy itself keeps the real key so the duplicate is
    // immediately runnable.
    const startRes = await app.request(
      jsonRequest("POST", `/api/workflows/${dup.id}/start`)
    );
    expect(startRes.status).toBe(200);
    expect(lastStartCall?.data.nodes[0].config.apiKey).toBe("sk-dup-secret");
  });

  it("should mask create and import responses too (uniform response contract)", async () => {
    // POST / (create) echoes client-sent data, but the response contract is
    // still "no secrets in workflow responses".
    const created = await createWorkflowViaApi(app, {
      name: "Created Secret",
      nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "sk-create-secret" } }],
    });
    expect(created.nodes[0].config.apiKey).toBe(SENTINEL);

    // POST /import likewise.
    const importRes = await app.request(
      jsonRequest("POST", "/api/workflows/import", {
        name: "Imported Secret",
        nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "sk-import-secret" } }],
      })
    );
    expect(importRes.status).toBe(200);
    const imported = await importRes.json();
    expect(imported.nodes[0].config.apiKey).toBe(SENTINEL);
  });
});

describe("PUT restores sentinel values instead of overwriting real secrets", () => {
  it("should keep the real API key in storage when PUT sends back SENTINEL", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Round Trip Secret",
      nodes: [{ id: "n1", type: "llm-node", config: { model: "gpt-4", apiKey: "sk-original" } }],
    });

    // Simulate the editor: it GETs (receiving SENTINEL), the user tweaks
    // an unrelated field, and PUTs the whole node back including SENTINEL.
    const putRes = await app.request(
      jsonRequest("PUT", `/api/workflows/${created.id}`, {
        nodes: [
          { id: "n1", type: "llm-node", config: { model: "gpt-4-turbo", apiKey: SENTINEL } },
        ],
      })
    );
    expect(putRes.status).toBe(200);
    const putData = await putRes.json();
    // PUT response itself is also masked
    expect(putData.nodes[0].config.apiKey).toBe(SENTINEL);
    // Unrelated field change did take effect
    expect(putData.nodes[0].config.model).toBe("gpt-4-turbo");

    // The real key must still be usable at execution time.
    const startRes = await app.request(
      jsonRequest("POST", `/api/workflows/${created.id}/start`)
    );
    expect(startRes.status).toBe(200);
    expect(lastStartCall?.data.nodes[0].config.apiKey).toBe("sk-original");
  });

  it("should allow explicitly clearing an API key with an empty string via PUT", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Clearable Secret",
      nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "sk-to-clear" } }],
    });

    const putRes = await app.request(
      jsonRequest("PUT", `/api/workflows/${created.id}`, {
        nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "" } }],
      })
    );
    expect(putRes.status).toBe(200);

    await app.request(jsonRequest("POST", `/api/workflows/${created.id}/start`));
    expect(lastStartCall?.data.nodes[0].config.apiKey).toBe("");
  });

  it("should leave SENTINEL saved literally for a brand-new node with no DB match (documented edge case)", async () => {
    const created = await createWorkflowViaApi(app, { name: "New Node Edge Case", nodes: [] });

    const putRes = await app.request(
      jsonRequest("PUT", `/api/workflows/${created.id}`, {
        nodes: [{ id: "brand-new", type: "llm-node", config: { apiKey: SENTINEL } }],
      })
    );
    expect(putRes.status).toBe(200);

    await app.request(jsonRequest("POST", `/api/workflows/${created.id}/start`));
    expect(lastStartCall?.data.nodes[0].config.apiKey).toBe(SENTINEL);
  });
});

describe("Execution integrity: POST /:id/start always uses real secrets", () => {
  it("should restore the real API key when start is called with SENTINEL-laden nodes (stale client state)", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "Stale Client",
      nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "sk-actual" } }],
    });

    // Mimic the editor/preview client: it loaded via GET (masked), never
    // touched this node's apiKey, and sends the masked value straight
    // through to /start.
    const res = await app.request(
      jsonRequest("POST", `/api/workflows/${created.id}/start`, {
        nodes: [{ id: "n1", type: "llm-node", config: { apiKey: SENTINEL } }],
        connections: [],
      })
    );

    expect(res.status).toBe(200);
    expect(lastStartCall?.data.nodes[0].config.apiKey).toBe("sk-actual");
  });

  it("should use the stored workflow's real key when start is called with no body", async () => {
    const created = await createWorkflowViaApi(app, {
      name: "No Body Start",
      nodes: [{ id: "n1", type: "llm-node", config: { apiKey: "sk-from-db" } }],
    });

    const res = await app.request(
      jsonRequest("POST", `/api/workflows/${created.id}/start`)
    );

    expect(res.status).toBe(200);
    expect(lastStartCall?.data.nodes[0].config.apiKey).toBe("sk-from-db");
  });
});

describe("Import validation: node type/id charset (path traversal defense)", () => {
  it("should reject an import with a path-traversal node type", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows/import", {
        name: "Malicious",
        nodes: [{ id: "n1", type: "../../../../etc/passwd", config: {} }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("should reject an import with a non-string node id", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows/import", {
        name: "Bad Id",
        nodes: [{ id: 123, type: "llm-node", config: {} }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("should reject an import with an overlong or symbol-laden node type", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows/import", {
        name: "Bad Type",
        nodes: [{ id: "n1", type: "llm-node; rm -rf /", config: {} }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("should accept an import with a well-formed node type", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows/import", {
        name: "Good Type",
        nodes: [{ id: "n1", type: "llm-openai_v2.1-beta", config: {} }],
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nodes[0].type).toBe("llm-openai_v2.1-beta");
  });
});
