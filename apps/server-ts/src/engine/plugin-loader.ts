/**
 * Plugin Loader - Dynamically loads node plugins at runtime.
 *
 * Replaces Python's importlib with dynamic import().
 * Plugins are loaded from the plugins/ directory, each containing:
 *   - manifest.json (metadata)
 *   - node.ts (TypeScript implementation)
 */

import { join, resolve, sep } from "node:path";

// Project root: go up from apps/server-ts/src/engine/ → project root
const PROJECT_ROOT = resolve(import.meta.dir, "../../../..");
const PLUGINS_DIR = process.env.PLUGINS_DIR || join(PROJECT_ROOT, "plugins");
const RESOLVED_PLUGINS_DIR = resolve(PLUGINS_DIR);

/** Source node types that run continuously and emit events. */
export const SOURCE_NODE_TYPES = new Set([
  "twitch-chat",
  "youtube-chat",
  "discord-chat",
  "timer",
  "cron-trigger",
]);

/**
 * Thrown when a plugin fails to load for a reason other than "no such
 * plugin" (invalid/unsafe node type, import failure, malformed module).
 * Distinct from the `null` return of loadPlugin(), which means "no plugin
 * implementation exists for this node type - fall back to a built-in node".
 */
export class PluginLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PluginLoadError";
  }
}

/**
 * Resolve a node type to its plugin directory, validating that it cannot
 * escape PLUGINS_DIR via path traversal or absolute paths. `nodeType` is
 * untrusted - it comes directly from workflow JSON (`node.type`).
 *
 * Returns null when the node type is not a safe, simple directory name.
 */
export function resolvePluginDir(nodeType: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(nodeType)) {
    return null;
  }

  const pluginDir = resolve(RESOLVED_PLUGINS_DIR, nodeType);
  const rootWithSep = RESOLVED_PLUGINS_DIR.endsWith(sep)
    ? RESOLVED_PLUGINS_DIR
    : `${RESOLVED_PLUGINS_DIR}${sep}`;

  if (!pluginDir.startsWith(rootWithSep)) {
    return null;
  }

  return pluginDir;
}

/**
 * Load a plugin's node class from its node.ts file.
 *
 * Return contract:
 *   - `null`   → no plugin implementation for this node type (caller should
 *                fall back to a built-in node, if any).
 *   - throws `PluginLoadError` → the node type is invalid/unsafe, or a
 *                plugin directory exists but failed to import or does not
 *                export a usable node class. Callers must not treat this
 *                the same as "not found" - it should be surfaced to the user.
 */
export async function loadPlugin(nodeType: string): Promise<unknown> {
  const pluginDir = resolvePluginDir(nodeType);
  if (!pluginDir) {
    throw new PluginLoadError(`Invalid plugin type: "${nodeType}"`);
  }

  const pluginPath = join(pluginDir, "node.ts");

  // Check if file exists
  const file = Bun.file(pluginPath);
  if (!(await file.exists())) {
    return null;
  }

  try {
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

    throw new PluginLoadError(`Plugin "${nodeType}" does not export a valid node class`);
  } catch (err) {
    if (err instanceof PluginLoadError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new PluginLoadError(`Failed to load plugin "${nodeType}": ${reason}`, { cause: err });
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
