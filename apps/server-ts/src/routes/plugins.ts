/**
 * Plugin API Routes - Plugin manifest listing.
 *
 * Ported from Python apps/server/routers/plugins.py
 */

import { Hono } from "hono";
import { readdir } from "fs/promises";
import { join, resolve, sep } from "path";
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

async function loadPluginManifest(
  pluginDir: string
): Promise<Record<string, any> | null> {
  const manifestPath = join(pluginDir, "manifest.json");
  try {
    const file = Bun.file(manifestPath);
    if (!(await file.exists())) return null;
    return await file.json();
  } catch {
    return null;
  }
}

async function getAllPlugins(): Promise<Record<string, any>[]> {
  const plugins: Record<string, any>[] = [];

  try {
    const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifest = await loadPluginManifest(
          join(PLUGINS_DIR, entry.name)
        );
        if (manifest) plugins.push(manifest);
      }
    }
  } catch {
    // Plugins directory might not exist
  }

  return plugins;
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
  if (!manifest)
    return c.json({ detail: "Plugin not found" }, 404);
  return c.json(manifest);
});

export { app as pluginRoutes };
