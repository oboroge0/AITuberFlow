/**
 * End Node
 *
 * Workflow exit point - marks the end of execution.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class EndNode extends BaseNode {
  private message = "Workflow completed";

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.message = config.message ?? "Workflow completed";
    await context.log("End node initialized");
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const inputValue = inputs.input ?? null;

    await context.log(`Workflow ended: ${this.message}`);

    // Emit workflow end event
    await context.emitEvent(
      createEvent("workflow.ended", {
        message: this.message,
        finalValue: inputValue,
      }),
    );

    return {};
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
