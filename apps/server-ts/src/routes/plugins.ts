/**
 * Plugin API Routes - Plugin manifest listing.
 *
 * Ported from Python apps/server/routers/plugins.py
 */

import { readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Hono } from "hono";
import { getPluginsDir } from "../engine/plugin-loader";

const app = new Hono();

const PLUGINS_DIR = getPluginsDir();
const RESOLVED_PLUGINS_DIR = resolve(PLUGINS_DIR);

function resolvePluginDir(pluginId: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(pluginId)) {
    return null;
  }

  const pluginDir = resolve(RESOLVED_PLUGINS_DIR, pluginId);
  const rootWithSep = RESOLVED_PLUGINS_DIR.endsWith(sep)
    ? RESOLVED_PLUGINS_DIR
    : `${RESOLVED_PLUGINS_DIR}${sep}`;

  if (!pluginDir.startsWith(rootWithSep)) {
    return null;
  }

  return pluginDir;
}

async function loadPluginManifest(pluginDir: string): Promise<Record<string, unknown> | null> {
  const manifestPath = join(pluginDir, "manifest.json");
  try {
    const file = Bun.file(manifestPath);
    if (!(await file.exists())) return null;
    return await file.json();
  } catch {
    return null;
  }
}

let pluginCache: Record<string, unknown>[] | null = null;

async function getAllPlugins(): Promise<Record<string, unknown>[]> {
  if (pluginCache) return pluginCache;

  try {
    const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
    const results = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => loadPluginManifest(join(PLUGINS_DIR, entry.name))),
    );
    pluginCache = results.filter(Boolean) as Record<string, unknown>[];
  } catch {
    pluginCache = [];
  }

  return pluginCache;
}

// List all plugins
app.get("/", async (c) => {
  return c.json(await getAllPlugins());
});

// Get specific plugin
app.get("/:pluginId", async (c) => {
  const pluginId = c.req.param("pluginId");
  const pluginDir = resolvePluginDir(pluginId);
  if (!pluginDir) {
    return c.json({ detail: "Invalid plugin ID" }, 400);
  }

  const manifest = await loadPluginManifest(pluginDir);
  if (!manifest) return c.json({ detail: "Plugin not found" }, 404);
  return c.json(manifest);
});

export { app as pluginRoutes };
