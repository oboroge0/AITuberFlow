/**
 * Memory Save Node
 *
 * Saves text to the workflow's long-term memory store.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class MemorySaveNode extends BaseNode {
  private tableName = "default";

  async setup(config: Record<string, any>, _context: NodeContext): Promise<void> {
    this.tableName = config.tableName ?? "default";
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const content = inputs.content ?? "";

    if (!content) {
      await context.log(`Memory table '${this.tableName}': nothing to save (empty content)`, "debug");
      return {};
    }

    const id = await context.saveMemory(this.tableName, content);
    await context.log(`Memory saved to '${this.tableName}' (id: ${id})`);

    return {};
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
