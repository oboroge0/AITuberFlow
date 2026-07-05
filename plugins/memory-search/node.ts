/**
 * Memory Search Node
 *
 * Searches the workflow's long-term memory store by recency or keyword.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class MemorySearchNode extends BaseNode {
  private tableName = "default";
  private searchType: "recent" | "keyword" = "recent";
  private defaultLimit = 10;
  private defaultQuery = "";

  async setup(config: Record<string, any>, _context: NodeContext): Promise<void> {
    this.tableName = config.tableName ?? "default";
    this.searchType = config.searchType ?? "recent";
    this.defaultLimit = config.defaultLimit ?? 10;
    this.defaultQuery = config.defaultQuery ?? "";
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const query = inputs.query ?? this.defaultQuery;

    if (this.searchType === "keyword" && !query) {
      await context.log(
        `Memory search on '${this.tableName}': keyword search requires a query, none provided`,
        "warning",
      );
      return { memories: [], count: 0 };
    }

    const results = await context.searchMemories(this.tableName, {
      searchType: this.searchType,
      query,
      limit: this.defaultLimit,
    });

    await context.log(`Memory search on '${this.tableName}' returned ${results.length} result(s)`);

    return { memories: results, count: results.length };
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
