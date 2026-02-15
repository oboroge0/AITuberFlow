/**
 * Start Node
 *
 * Workflow entry point - marks the beginning of execution.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class StartNode extends BaseNode {
  private autoStart = true;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.autoStart = config.autoStart ?? true;
    await context.log("Start node initialized");
  }

  async execute(
    _inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    await context.log("Workflow started");

    // Emit workflow start event
    await context.emitEvent(
      createEvent("workflow.started", { autoStart: this.autoStart }),
    );

    return { trigger: true };
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
