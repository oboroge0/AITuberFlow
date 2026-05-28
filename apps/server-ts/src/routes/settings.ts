/**
 * Global Settings API Routes - GET/PUT for global configuration.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db as defaultDb } from "../db/database";
import { globalSettings } from "../db/schema";

const app = new Hono();

let _db: typeof defaultDb = defaultDb;

export function setDb(newDb: typeof defaultDb): void {
  _db = newDb;
}

// GET /api/settings — return all settings as Record<string, string>
app.get("/", async (c) => {
  const rows = _db.select().from(globalSettings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return c.json(result);
});

// PUT /api/settings — bulk upsert settings
const updateSettingsBody = z.record(z.string(), z.string());

app.put("/", zValidator("json", updateSettingsBody), async (c) => {
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  _db.transaction((tx) => {
    for (const [key, value] of Object.entries(body)) {
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
