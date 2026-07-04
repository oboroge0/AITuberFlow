/**
 * Tests for the memory-save plugin node.
 *
 * Exercises the node against a real NodeContext (from @aituber-flow/sdk)
 * with a stubbed saveMemory callback, so no server/database is needed.
 */

import { describe, it, expect, mock } from "bun:test";
import { NodeContext } from "../../packages/sdk-ts/src/context";
import MemorySaveNode from "../../plugins/memory-save/node";

function createContext(overrides: {
  saveMemoryCallback?: (tableName: string, content: string) => Promise<string>;
} = {}) {
  const logs: Array<{ message: string; level: string }> = [];
  const ctx = new NodeContext({
    workflowId: "wf-1",
    nodeId: "memory-save-1",
    character: {},
    logCallback: async (message, level) => {
      logs.push({ message, level });
    },
    saveMemoryCallback: overrides.saveMemoryCallback,
  });
  return { ctx, logs };
}

describe("MemorySaveNode", () => {
  it("does nothing (no-op) when content is empty", async () => {
    const saveMemoryCallback = mock(async () => "should-not-be-called");
    const { ctx, logs } = createContext({ saveMemoryCallback });
    const node = new MemorySaveNode();
    await node.setup({ tableName: "notes" }, ctx);

    const result = await node.execute({ content: "" }, ctx);

    expect(result).toEqual({});
    expect(saveMemoryCallback).not.toHaveBeenCalled();
    expect(logs[0].level).toBe("debug");
    expect(logs[0].message).toContain("nothing to save");
  });

  it("does nothing when content is missing entirely", async () => {
    const saveMemoryCallback = mock(async () => "should-not-be-called");
    const { ctx } = createContext({ saveMemoryCallback });
    const node = new MemorySaveNode();
    await node.setup({ tableName: "notes" }, ctx);

    const result = await node.execute({}, ctx);

    expect(result).toEqual({});
    expect(saveMemoryCallback).not.toHaveBeenCalled();
  });

  it("saves plain string content as-is", async () => {
    const saveMemoryCallback = mock(async (_table: string, content: string) => {
      expect(content).toBe("hello world");
      return "mem-1";
    });
    const { ctx, logs } = createContext({ saveMemoryCallback });
    const node = new MemorySaveNode();
    await node.setup({ tableName: "notes" }, ctx);

    const result = await node.execute({ content: "hello world" }, ctx);

    expect(result).toEqual({});
    expect(saveMemoryCallback).toHaveBeenCalledTimes(1);
    expect(saveMemoryCallback.mock.calls[0][0]).toBe("notes");
    expect(logs.at(-1)?.message).toContain("mem-1");
  });

  it("extracts .message from an object payload", async () => {
    const saveMemoryCallback = mock(async (_table: string, content: string) => {
      expect(content).toBe("chat message text");
      return "mem-2";
    });
    const { ctx } = createContext({ saveMemoryCallback });
    const node = new MemorySaveNode();
    await node.setup({ tableName: "default" }, ctx);

    await node.execute({ content: { message: "chat message text", extra: "ignored" } }, ctx);

    expect(saveMemoryCallback).toHaveBeenCalledTimes(1);
  });

  it("falls back to .text when .message is absent on an object payload", async () => {
    const saveMemoryCallback = mock(async (_table: string, content: string) => {
      expect(content).toBe("subtitle text");
      return "mem-3";
    });
    const { ctx } = createContext({ saveMemoryCallback });
    const node = new MemorySaveNode();
    await node.setup({ tableName: "default" }, ctx);

    await node.execute({ content: { text: "subtitle text" } }, ctx);

    expect(saveMemoryCallback).toHaveBeenCalledTimes(1);
  });

  it("coerces an object with neither .message nor .text via String()", async () => {
    const saveMemoryCallback = mock(async (_table: string, content: string) => {
      expect(content).toBe("[object Object]");
      return "mem-4";
    });
    const { ctx } = createContext({ saveMemoryCallback });
    const node = new MemorySaveNode();
    await node.setup({ tableName: "default" }, ctx);

    await node.execute({ content: { foo: "bar" } }, ctx);

    expect(saveMemoryCallback).toHaveBeenCalledTimes(1);
  });

  it("calls context.saveMemory with the configured table name", async () => {
    const saveMemoryCallback = mock(async () => "mem-5");
    const { ctx } = createContext({ saveMemoryCallback });
    const node = new MemorySaveNode();
    await node.setup({ tableName: "custom-table" }, ctx);

    await node.execute({ content: "some text" }, ctx);

    expect(saveMemoryCallback.mock.calls[0][0]).toBe("custom-table");
  });
});
