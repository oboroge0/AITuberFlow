/**
 * Memory API Routes - Tests
 *
 * Tests the PRODUCTION Hono memory routes using an in-memory SQLite
 * database injected via setDb(). Uses `app.request()` so no running
 * server is needed.
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
import { memoryRoutes, setDb } from "../../apps/server-ts/src/routes/memories";
import { memories, workflows } from "../../apps/server-ts/src/db/schema";

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
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return drizzle(sqlite, { schema: { workflows, memories } });
}

function resetDb(): void {
  sqlite.run("DELETE FROM memories");
  sqlite.run("DELETE FROM workflows");
}

function teardownDb(): void {
  sqlite.close();
}

// ─── Request Helpers ───────────────────────────────────────────

function jsonRequest(method: string, path: string, body?: Record<string, any>): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init);
}

const NOW = "2026-01-01T00:00:00.000Z";

async function insertWorkflow(id: string): Promise<void> {
  sqlite.run(
    `INSERT INTO workflows (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [id, "Test Workflow", NOW, NOW],
  );
}

async function insertMemory(
  workflowId: string,
  tableName: string,
  content: string,
  createdAt: string = NOW,
): Promise<string> {
  const id = crypto.randomUUID();
  sqlite.run(
    `INSERT INTO memories (id, workflow_id, table_name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, workflowId, tableName, content, createdAt, createdAt],
  );
  return id;
}

// ─── Setup ────────────────────────────────────────────────────

let app: Hono;

beforeAll(() => {
  const testDb = setupTestDb();
  setDb(testDb);

  app = new Hono();
  app.route("/api/workflows", memoryRoutes);
});

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  teardownDb();
});

// ═══════════════════════════════════════════════════════════════
// GET /:workflowId/memories
// ═══════════════════════════════════════════════════════════════

describe("GET /:workflowId/memories", () => {
  it("returns 404 when the workflow does not exist", async () => {
    const res = await app.request(
      jsonRequest("GET", "/api/workflows/does-not-exist/memories"),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toBe("Workflow not found");
  });

  it("returns recent memories ordered by createdAt desc by default", async () => {
    await insertWorkflow("wf-1");
    await insertMemory("wf-1", "default", "older", "2026-01-01T00:00:00.000Z");
    await insertMemory("wf-1", "default", "newer", "2026-01-02T00:00:00.000Z");

    const res = await app.request(jsonRequest("GET", "/api/workflows/wf-1/memories"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].content).toBe("newer");
    expect(data[1].content).toBe("older");
  });

  it("filters by table_name", async () => {
    await insertWorkflow("wf-1");
    await insertMemory("wf-1", "table-a", "in table a");
    await insertMemory("wf-1", "table-b", "in table b");

    const res = await app.request(
      jsonRequest("GET", "/api/workflows/wf-1/memories?table_name=table-a"),
    );
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].tableName).toBe("table-a");
  });

  it("returns 400 when search_type=keyword but no query is given", async () => {
    await insertWorkflow("wf-1");

    const res = await app.request(
      jsonRequest("GET", "/api/workflows/wf-1/memories?search_type=keyword"),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("query is required");
  });

  it("performs a keyword search matching partial content", async () => {
    await insertWorkflow("wf-1");
    await insertMemory("wf-1", "default", "The quick brown fox");
    await insertMemory("wf-1", "default", "Something unrelated");

    const res = await app.request(
      jsonRequest("GET", "/api/workflows/wf-1/memories?search_type=keyword&query=brown"),
    );
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].content).toBe("The quick brown fox");
  });

  it("escapes LIKE wildcards so a literal % only matches literal %", async () => {
    await insertWorkflow("wf-1");
    await insertMemory("wf-1", "default", "Discount is 100% off today");
    await insertMemory("wf-1", "default", "Discount is 100X off today");

    const res = await app.request(
      jsonRequest("GET", "/api/workflows/wf-1/memories?search_type=keyword&query=100%25"),
    );
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].content).toBe("Discount is 100% off today");
  });

  it("escapes LIKE wildcards so a literal _ does not match any single character", async () => {
    await insertWorkflow("wf-1");
    await insertMemory("wf-1", "default", "file_name.txt");
    await insertMemory("wf-1", "default", "fileXname.txt");

    const res = await app.request(
      jsonRequest("GET", "/api/workflows/wf-1/memories?search_type=keyword&query=file_name"),
    );
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].content).toBe("file_name.txt");
  });

  it("caps limit at the maximum allowed value", async () => {
    await insertWorkflow("wf-1");
    for (let i = 0; i < 3; i++) {
      await insertMemory("wf-1", "default", `memory ${i}`);
    }

    const res = await app.request(
      jsonRequest("GET", "/api/workflows/wf-1/memories?limit=99999"),
    );
    expect(res.status).toBe(400);
  });

  it("respects a valid limit", async () => {
    await insertWorkflow("wf-1");
    for (let i = 0; i < 5; i++) {
      await insertMemory("wf-1", "default", `memory ${i}`);
    }

    const res = await app.request(jsonRequest("GET", "/api/workflows/wf-1/memories?limit=2"));
    const data = await res.json();
    expect(data).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /:workflowId/memories
// ═══════════════════════════════════════════════════════════════

describe("POST /:workflowId/memories", () => {
  it("returns 404 when the workflow does not exist", async () => {
    const res = await app.request(
      jsonRequest("POST", "/api/workflows/does-not-exist/memories", {
        table_name: "default",
        content: "hello",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("creates a memory", async () => {
    await insertWorkflow("wf-1");

    const res = await app.request(
      jsonRequest("POST", "/api/workflows/wf-1/memories", {
        table_name: "default",
        content: "hello world",
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.workflowId).toBe("wf-1");
    expect(data.tableName).toBe("default");
    expect(data.content).toBe("hello world");
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it("rejects a request missing table_name", async () => {
    await insertWorkflow("wf-1");

    const res = await app.request(
      jsonRequest("POST", "/api/workflows/wf-1/memories", { content: "hello" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a request missing content", async () => {
    await insertWorkflow("wf-1");

    const res = await app.request(
      jsonRequest("POST", "/api/workflows/wf-1/memories", { table_name: "default" }),
    );
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /:workflowId/memories/tables
// ═══════════════════════════════════════════════════════════════

describe("GET /:workflowId/memories/tables", () => {
  it("returns 404 when the workflow does not exist", async () => {
    const res = await app.request(
      jsonRequest("GET", "/api/workflows/does-not-exist/memories/tables"),
    );
    expect(res.status).toBe(404);
  });

  it("returns distinct table names for a workflow", async () => {
    await insertWorkflow("wf-1");
    await insertMemory("wf-1", "table-a", "a1");
    await insertMemory("wf-1", "table-a", "a2");
    await insertMemory("wf-1", "table-b", "b1");

    const res = await app.request(jsonRequest("GET", "/api/workflows/wf-1/memories/tables"));
    const data = await res.json();
    expect(data.sort()).toEqual(["table-a", "table-b"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /:workflowId/memories
// ═══════════════════════════════════════════════════════════════

describe("DELETE /:workflowId/memories", () => {
  it("returns 404 when the workflow does not exist", async () => {
    const res = await app.request(
      jsonRequest("DELETE", "/api/workflows/does-not-exist/memories"),
    );
    expect(res.status).toBe(404);
  });

  it("deletes all memories for a workflow", async () => {
    await insertWorkflow("wf-1");
    await insertMemory("wf-1", "table-a", "a1");
    await insertMemory("wf-1", "table-b", "b1");

    const res = await app.request(jsonRequest("DELETE", "/api/workflows/wf-1/memories"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("deleted");

    const listRes = await app.request(jsonRequest("GET", "/api/workflows/wf-1/memories"));
    expect(await listRes.json()).toEqual([]);
  });

  it("deletes memories scoped to a single table only", async () => {
    await insertWorkflow("wf-1");
    await insertMemory("wf-1", "table-a", "a1");
    await insertMemory("wf-1", "table-b", "b1");

    const res = await app.request(
      jsonRequest("DELETE", "/api/workflows/wf-1/memories?table_name=table-a"),
    );
    expect(res.status).toBe(200);

    const listRes = await app.request(jsonRequest("GET", "/api/workflows/wf-1/memories"));
    const remaining = await listRes.json();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tableName).toBe("table-b");
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /:workflowId/memories/:id
// ═══════════════════════════════════════════════════════════════

describe("DELETE /:workflowId/memories/:id", () => {
  it("deletes a single memory", async () => {
    await insertWorkflow("wf-1");
    const id = await insertMemory("wf-1", "default", "to be deleted");

    const res = await app.request(jsonRequest("DELETE", `/api/workflows/wf-1/memories/${id}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("deleted");

    const listRes = await app.request(jsonRequest("GET", "/api/workflows/wf-1/memories"));
    expect(await listRes.json()).toEqual([]);
  });

  it("returns 404 for a memory id that does not exist", async () => {
    await insertWorkflow("wf-1");

    const res = await app.request(
      jsonRequest("DELETE", "/api/workflows/wf-1/memories/does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the memory belongs to a different workflow", async () => {
    await insertWorkflow("wf-1");
    await insertWorkflow("wf-2");
    const id = await insertMemory("wf-1", "default", "belongs to wf-1");

    const res = await app.request(jsonRequest("DELETE", `/api/workflows/wf-2/memories/${id}`));
    expect(res.status).toBe(404);

    // Still present under the correct workflow.
    const listRes = await app.request(jsonRequest("GET", "/api/workflows/wf-1/memories"));
    expect(await listRes.json()).toHaveLength(1);
  });
});
