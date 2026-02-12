/**
 * Plugin Loader - Dynamically loads node plugins at runtime.
 *
 * Replaces Python's importlib with dynamic import().
 * Plugins are loaded from the plugins/ directory, each containing:
 *   - manifest.json (metadata)
 *   - node.ts (TypeScript implementation)
 */

import { resolve, join } from "path";

// Project root: go up from apps/server-ts/src/engine/ → project root
const PROJECT_ROOT = resolve(import.meta.dir, "../../../..");
const PLUGINS_DIR = join(PROJECT_ROOT, "plugins");

/** Source node types that run continuously and emit events. */
export const SOURCE_NODE_TYPES = new Set([
  "twitch-chat",
  "youtube-chat",
  "timer",
]);

/**
 * Load a plugin's node class from its node.ts file.
 * Returns an instance of the node, or null if not found.
 */
export async function loadPlugin(nodeType: string): Promise<any | null> {
  const pluginPath = join(PLUGINS_DIR, nodeType, "node.ts");

  try {
    // Check if file exists
    const file = Bun.file(pluginPath);
    if (!(await file.exists())) {
      return null;
    }

    // Dynamic import
    const module = await import(pluginPath);

    // Find the default export or first class with execute method
    if (module.default) {
      const Cls = module.default;
      if (typeof Cls === "function") {
        return new Cls();
      }
    }

    // Search for a class with execute method
    for (const key of Object.keys(module)) {
      const obj = module[key];
      if (
        typeof obj === "function" &&
        obj.prototype &&
        typeof obj.prototype.execute === "function" &&
        key !== "BaseNode"
      ) {
        return new obj();
      }
    }

    return null;
  } catch (err) {
    console.error(`Failed to load plugin ${nodeType}:`, err);
    return null;
  }
}

/**
 * Get the plugins directory path.
 */
export function getPluginsDir(): string {
  return PLUGINS_DIR;
}

/**
 * Get the project root path.
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}
