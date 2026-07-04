import { describe, it, expect, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadPlugin,
  resolvePluginDir,
  getPluginsDir,
  PluginLoadError,
} from "../../apps/server-ts/src/engine/plugin-loader";

// These tests exercise loadPlugin()/resolvePluginDir() against the real
// PLUGINS_DIR (there is no way to swap it after module load, since it is
// resolved once at import time). Traversal/invalid-id cases never touch the
// filesystem. Import-failure/malformed-module cases create a throwaway
// fixture directory under the real plugins/ dir and remove it afterwards.

const PLUGINS_DIR = getPluginsDir();
const fixtureDirs: string[] = [];

afterEach(async () => {
  while (fixtureDirs.length > 0) {
    const dir = fixtureDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeFixturePlugin(name: string, nodeTs: string): Promise<string> {
  const dir = join(PLUGINS_DIR, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "node.ts"), nodeTs, "utf-8");
  fixtureDirs.push(dir);
  return name;
}

describe("resolvePluginDir", () => {
  it("rejects parent-directory traversal", () => {
    expect(resolvePluginDir("../../evil")).toBeNull();
  });

  it("rejects traversal with backslashes", () => {
    expect(resolvePluginDir("..\\..\\evil")).toBeNull();
  });

  it("rejects embedded path separators", () => {
    expect(resolvePluginDir("foo/bar")).toBeNull();
    expect(resolvePluginDir("foo\\bar")).toBeNull();
  });

  it("rejects absolute paths", () => {
    expect(resolvePluginDir("/etc/passwd")).toBeNull();
  });

  it("rejects empty and whitespace-only strings", () => {
    expect(resolvePluginDir("")).toBeNull();
    expect(resolvePluginDir("   ")).toBeNull();
  });

  it("accepts a plain identifier and resolves it under PLUGINS_DIR", () => {
    const dir = resolvePluginDir("console-output");
    expect(dir).not.toBeNull();
    expect(dir).toBe(join(PLUGINS_DIR, "console-output"));
  });
});

describe("loadPlugin", () => {
  it("throws PluginLoadError for a path-traversal node type", async () => {
    await expect(loadPlugin("../../evil")).rejects.toThrow(PluginLoadError);
  });

  it("throws PluginLoadError for a node type with embedded separators", async () => {
    await expect(loadPlugin("..\\..\\evil")).rejects.toThrow(PluginLoadError);
  });

  it("returns null when the plugin directory does not exist", async () => {
    const result = await loadPlugin("definitely-not-a-real-plugin-xyz");
    expect(result).toBeNull();
  });

  it("returns a working instance for a real plugin", async () => {
    const result = await loadPlugin("console-output");
    expect(result).not.toBeNull();
    expect(typeof (result as Record<string, unknown>).execute).toBe("function");
  });

  it("throws PluginLoadError when the module fails to import", async () => {
    const nodeType = await makeFixturePlugin(
      "__test-plugin-import-error__",
      `throw new Error("boom during import");\n`,
    );

    let caught: unknown;
    try {
      await loadPlugin(nodeType);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PluginLoadError);
    expect((caught as Error).message).toContain(nodeType);
  });

  it("throws PluginLoadError when the module has no usable node class", async () => {
    const nodeType = await makeFixturePlugin(
      "__test-plugin-no-class__",
      `export const notANodeClass = { execute: () => {} };\n`,
    );

    let caught: unknown;
    try {
      await loadPlugin(nodeType);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PluginLoadError);
    expect((caught as Error).message).toContain(nodeType);
  });
});
