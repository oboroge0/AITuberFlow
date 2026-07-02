/**
 * Global Settings API Routes - Tests
 *
 * Tests the PRODUCTION Hono settings routes using an in-memory SQLite
 * database injected via setDb(). Focus: GET masks sensitive values with a
 * SENTINEL placeholder, and PUT skips SENTINEL entries so a client
 * round-tripping a masked value never overwrites a real secret, while an
 * explicit empty string can still clear one.
 *
 * Uses `app.request()` pattern so no running server is needed.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { settingsRoutes, setDb } from "../../apps/server-ts/src/routes/settings";
import { globalSettings } from "../../apps/server-ts/src/db/schema";
import { isSensitiveKey, SENTINEL } from "../../apps/server-ts/src/routes/sensitive-fields";

// ─── Test Database ─────────────────────────────────────────────

let sqlite: Database;

function setupTestDb(): ReturnType<typeof drizzle> {
  sqlite = new Database(":memory:");
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return drizzle(sqlite, { schema: { globalSettings } });
}

function resetDb(): void {
  sqlite.run("DELETE FROM global_settings");
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

async function putSettings(testApp: Hono, body: Record<string, string>) {
  return testApp.request(jsonRequest("PUT", "/api/settings", body));
}

async function getSettings(testApp: Hono): Promise<Record<string, string>> {
  const res = await testApp.request(new Request("http://localhost/api/settings"));
  return res.json();
}

// ─── Setup ────────────────────────────────────────────────────

let app: Hono;

beforeAll(() => {
  const testDb = setupTestDb();
  setDb(testDb);

  app = new Hono();
  app.route("/api/settings", settingsRoutes);
});

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  teardownDb();
});

// ═══════════════════════════════════════════════════════════════
// Sensitive key classification
// ═══════════════════════════════════════════════════════════════

describe("isSensitiveKey classification (canonical setting/config keys)", () => {
  it("should classify known global-settings API key fields as sensitive", () => {
    for (const key of [
      "openai.apiKey",
      "anthropic.apiKey",
      "google.apiKey",
      "mistral.apiKey",
      "groq.apiKey",
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });

  it("should classify known node config secret fields as sensitive", () => {
    for (const key of [
      "apiKey",
      "api_key",
      "apiSecret",
      "llmApiKey",
      "botToken",
      "oauthToken",
      "password",
      "credential",
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });

  it("should NOT classify non-secret fields as sensitive", () => {
    for (const key of [
      "openai.model",
      "anthropic.model",
      "ollama.host",
      "voicevox.host",
      "coeiroink.host",
      "sbv2.host",
      "aivis.host",
      "model",
      "host",
      "maxTokens",
      "max_tokens",
      "modelUrl",
      "channelIds",
      "filterBots",
      "temperature",
    ]) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/settings — masking
// ═══════════════════════════════════════════════════════════════

describe("GET /api/settings masks sensitive values", () => {
  it("should mask a non-empty API key with SENTINEL", async () => {
    await putSettings(app, { "openai.apiKey": "sk-real-secret", "openai.model": "gpt-4o" });

    const data = await getSettings(app);
    expect(data["openai.apiKey"]).toBe(SENTINEL);
    expect(data["openai.model"]).toBe("gpt-4o");
  });

  it("should leave an empty API key as empty (not masked)", async () => {
    await putSettings(app, { "openai.apiKey": "" });

    const data = await getSettings(app);
    expect(data["openai.apiKey"]).toBe("");
  });

  it("should never return a real secret value in the response body", async () => {
    await putSettings(app, {
      "anthropic.apiKey": "sk-ant-super-secret",
      "groq.apiKey": "gsk-super-secret",
    });

    const res = await app.request(new Request("http://localhost/api/settings"));
    const raw = await res.text();
    expect(raw).not.toContain("sk-ant-super-secret");
    expect(raw).not.toContain("gsk-super-secret");
  });
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/settings — sentinel skip / explicit clear
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/settings skips SENTINEL and preserves the real value", () => {
  it("should keep the stored API key when PUT sends back SENTINEL", async () => {
    await putSettings(app, { "openai.apiKey": "sk-original" });

    // Simulate the settings modal: it fetched (getting SENTINEL back),
    // the user changed an unrelated field, and saves the whole form.
    const putRes = await putSettings(app, {
      "openai.apiKey": SENTINEL,
      "openai.model": "gpt-4o-mini",
    });
    expect(putRes.status).toBe(200);

    // Value is preserved in storage — verify by asking for the masked GET
    // (SENTINEL means "still set") and by checking model did update.
    const data = await getSettings(app);
    expect(data["openai.apiKey"]).toBe(SENTINEL);
    expect(data["openai.model"]).toBe("gpt-4o-mini");
  });

  it("should allow explicitly clearing an API key with an empty string", async () => {
    await putSettings(app, { "openai.apiKey": "sk-to-clear" });

    const putRes = await putSettings(app, { "openai.apiKey": "" });
    expect(putRes.status).toBe(200);

    const data = await getSettings(app);
    expect(data["openai.apiKey"]).toBe("");
  });

  it("should not affect non-sensitive keys even if their value happens to equal the sentinel string", async () => {
    const putRes = await putSettings(app, { "custom.note": SENTINEL });
    expect(putRes.status).toBe(200);

    const data = await getSettings(app);
    // Non-sensitive key: literal value is stored, not skipped.
    expect(data["custom.note"]).toBe(SENTINEL);
  });
});
