/**
 * Tests for the memory-search plugin node.
 *
 * Exercises the node against a real NodeContext (from @aituber-flow/sdk)
 * with a stubbed searchMemories callback, so no server/database is needed.
 */

import { describe, it, expect, mock } from "bun:test";
import { NodeContext } from "../../packages/sdk-ts/src/context";
import type { MemoryRecord, SearchMemoriesOptions } from "../../packages/sdk-ts/src/context";
import MemorySearchNode from "../../plugins/memory-search/node";

function createContext(overrides: {
  searchMemoriesCallback?: (
    tableName: string,
    options: SearchMemoriesOptions,
  ) => Promise<MemoryRecord[]>;
} = {}) {
  const logs: Array<{ message: string; level: string }> = [];
  const ctx = new NodeContext({
    workflowId: "wf-1",
    nodeId: "memory-search-1",
    character: {},
    logCallback: async (message, level) => {
      logs.push({ message, level });
    },
    searchMemoriesCallback: overrides.searchMemoriesCallback,
  });
  return { ctx, logs };
}

const SAMPLE_MEMORIES: MemoryRecord[] = [
  { id: "m1", content: "first memory", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "m2", content: "second memory", createdAt: "2026-01-02T00:00:00.000Z" },
];

describe("MemorySearchNode", () => {
  it("returns empty results with a warning when keyword search has no query", async () => {
    const searchMemoriesCallback = mock(async () => SAMPLE_MEMORIES);
    const { ctx, logs } = createContext({ searchMemoriesCallback });
    const node = new MemorySearchNode();
    await node.setup({ tableName: "notes", searchType: "keyword" }, ctx);

    const result = await node.execute({}, ctx);

    expect(result).toEqual({ memories: [], count: 0 });
    expect(searchMemoriesCallback).not.toHaveBeenCalled();
    expect(logs[0].level).toBe("warning");
  });

  it("uses the input query over the default query for keyword search", async () => {
    const searchMemoriesCallback = mock(async (_table: string, options: SearchMemoriesOptions) => {
      expect(options.query).toBe("hello");
      return [SAMPLE_MEMORIES[0]];
    });
    const { ctx } = createContext({ searchMemoriesCallback });
    const node = new MemorySearchNode();
    await node.setup({ tableName: "notes", searchType: "keyword", defaultQuery: "fallback" }, ctx);

    const result = await node.execute({ query: "hello" }, ctx);

    expect(result).toEqual({ memories: [SAMPLE_MEMORIES[0]], count: 1 });
  });

  it("returns memories and count for a recent search", async () => {
    const searchMemoriesCallback = mock(async (tableName: string, options: SearchMemoriesOptions) => {
      expect(tableName).toBe("default");
      expect(options.searchType).toBe("recent");
      expect(options.limit).toBe(10);
      return SAMPLE_MEMORIES;
    });
    const { ctx, logs } = createContext({ searchMemoriesCallback });
    const node = new MemorySearchNode();
    await node.setup({}, ctx);

    const result = await node.execute({}, ctx);

    expect(result.memories).toEqual(SAMPLE_MEMORIES);
    expect(result.count).toBe(2);
    expect(logs.at(-1)?.message).toContain("2");
  });

  it("passes the configured default limit through to the search", async () => {
    const searchMemoriesCallback = mock(async (_table: string, options: SearchMemoriesOptions) => {
      expect(options.limit).toBe(5);
      return [];
    });
    const { ctx } = createContext({ searchMemoriesCallback });
    const node = new MemorySearchNode();
    await node.setup({ defaultLimit: 5 }, ctx);

    await node.execute({}, ctx);

    expect(searchMemoriesCallback).toHaveBeenCalledTimes(1);
  });
});
