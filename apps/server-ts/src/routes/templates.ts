/**
 * Template API Routes - Workflow template listing.
 *
 * Ported from Python apps/server/routers/templates.py
 */

import { Hono } from "hono";
import { readdir } from "fs/promises";
import { join } from "path";
import { getProjectRoot } from "../engine/plugin-loader";

const app = new Hono();

const TEMPLATES_DIR = join(getProjectRoot(), "templates");

async function loadTemplate(
  templatePath: string
): Promise<Record<string, any> | null> {
  try {
    const file = Bun.file(templatePath);
    if (!(await file.exists())) return null;
    return await file.json();
  } catch {
    return null;
  }
}

// List all templates
app.get("/", async (c) => {
  const templates: Record<string, any>[] = [];

  try {
    const entries = await readdir(TEMPLATES_DIR);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const template = await loadTemplate(join(TEMPLATES_DIR, entry));
      if (!template) continue;

      const stem = entry.replace(/\.json$/, "");
      templates.push({
        id: template.id ?? stem,
        name: template.name ?? stem,
        name_ja: template.name_ja ?? template.name ?? stem,
        description: template.description ?? "",
        description_ja:
          template.description_ja ?? template.description ?? "",
        nodeCount: (template.nodes ?? []).length,
        connectionCount: (template.connections ?? []).length,
      });
    }
  } catch {
    // Templates directory might not exist
  }

  return c.json(templates);
});

// Get specific template
app.get("/:templateId", async (c) => {
  const templateId = c.req.param("templateId");

  try {
    const entries = await readdir(TEMPLATES_DIR);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const template = await loadTemplate(join(TEMPLATES_DIR, entry));
      if (!template) continue;

      const stem = entry.replace(/\.json$/, "");
      if (template.id === templateId || stem === templateId) {
        return c.json(template);
      }
    }
  } catch {
    // Templates directory might not exist
  }

  return c.json({ detail: "Template not found" }, 404);
});

export { app as templateRoutes };
