/**
 * Global Settings API Routes - GET/PUT for global configuration.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db as defaultDb } from "../db/database";
import { globalSettings } from "../db/schema";
import { SENTINEL, isSensitiveKey } from "./sensitive-fields";

const app = new Hono();

let _db: typeof defaultDb = defaultDb;

export function setDb(newDb: typeof defaultDb): void {
  _db = newDb;
}

// GET /api/settings — return all settings as Record<string, string>.
// Sensitive values (API keys, tokens, passwords) are masked with SENTINEL
// so this endpoint never leaks secrets in plaintext. Empty values are left
// empty so the client can tell "unset" apart from "set".
app.get("/", async (c) => {
  const rows = _db.select().from(globalSettings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = isSensitiveKey(row.key) && row.value !== "" ? SENTINEL : row.value;
  }
  return c.json(result);
});

// PUT /api/settings — bulk upsert settings.
// Entries whose value is the SENTINEL placeholder are skipped (the
// client is echoing back a masked value it never actually edited), so the
// existing stored secret is preserved. An explicit empty string still
// overwrites, so users retain a way to clear a key.
const updateSettingsBody = z.record(z.string(), z.string());

app.put("/", zValidator("json", updateSettingsBody), async (c) => {
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const entries = Object.entries(body).filter(
    ([key, value]) => !(isSensitiveKey(key) && value === SENTINEL),
  );

  _db.transaction((tx) => {
    for (const [key, value] of entries) {
      tx.insert(globalSettings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: globalSettings.key,
          set: { value, updatedAt: now },
        })
        .run();
    }
  });

  return c.json({ success: true });
});

export const settingsRoutes = app;
