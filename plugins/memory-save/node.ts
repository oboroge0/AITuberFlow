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

  /**
   * Coerce an arbitrary upstream input into a string for storage.
   *
   * Strings pass through unchanged. Objects are unwrapped via `.message`
   * then `.text` (the same convention used by the LLM nodes' former
   * buildPromptFromSections helper), so a chat-message-shaped payload
   * doesn't get saved as the literal text "[object Object]". Any other
   * value (number, boolean, array, etc.) is coerced with `String()`.
   */
  private extractContent(input: unknown): string {
    let value: unknown = input;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if ("message" in obj) {
        value = obj.message;
      } else if ("text" in obj) {
        value = obj.text;
      } else {
        value = String(value);
      }
    }
    return value ? String(value) : "";
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const content = this.extractContent(inputs.content);

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
