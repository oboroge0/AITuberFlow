/**
 * Console Output Node
 *
 * Displays text in the execution log panel.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class ConsoleOutputNode extends BaseNode {
  private prefix = "[Output]";
  private logLevel = "info";

  async setup(config: Record<string, any>, _context: NodeContext): Promise<void> {
    this.prefix = config.prefix ?? "[Output]";
    this.logLevel = config.logLevel ?? "info";
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const text = inputs.text ?? "";

    if (text) {
      const message = `${this.prefix} ${text}`;
      await context.log(message, this.logLevel);
    } else {
      await context.log(`${this.prefix} (empty)`, "debug");
    }

    return {};
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
