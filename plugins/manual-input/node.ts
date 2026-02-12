/**
 * Manual Input Node
 *
 * A simple input node that allows users to enter text manually.
 * The text is sent downstream when the workflow executes.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class ManualInputNode extends BaseNode {
  private placeholder = "Enter text...";
  private inputText = "";

  async setup(config: Record<string, any>, _context: NodeContext): Promise<void> {
    this.placeholder = config.placeholder ?? "Enter text...";
    this.inputText = config.inputText ?? "";
  }

  async execute(
    _inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const text = this.inputText;

    if (text) {
      await context.log(
        `Input: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`,
      );
    } else {
      await context.log("No input text configured", "warning");
    }

    return { text };
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
