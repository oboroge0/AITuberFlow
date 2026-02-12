/**
 * Base node classes for AITuberFlow Plugin SDK.
 *
 * All node plugins extend one of these base classes.
 */

import type { Event, NodeContext } from "./context";

/**
 * Base class for all AITuberFlow nodes.
 *
 * Implement this class to create a custom node plugin.
 *
 * @example
 * ```ts
 * import { BaseNode, NodeContext } from "@aituber-flow/sdk";
 *
 * class MyNode extends BaseNode {
 *   async setup(config: Record<string, any>, context: NodeContext) {
 *     this.mySetting = config.mySetting ?? "default";
 *   }
 *
 *   async execute(inputs: Record<string, any>, context: NodeContext) {
 *     const text = inputs.text ?? "";
 *     await context.log(`Processed: ${text}`);
 *     return { output: `Processed: ${text}` };
 *   }
 * }
 * ```
 */
export abstract class BaseNode {
  /**
   * Initialize the node with configuration.
   * Called once when the workflow starts.
   */
  async setup(
    _config: Record<string, any>,
    _context: NodeContext,
  ): Promise<void> {}

  /**
   * Execute the node's main logic.
   * Called for each execution cycle.
   */
  abstract execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>>;

  /**
   * Clean up resources when the workflow stops.
   * Called once when the workflow stops.
   */
  async teardown(): Promise<void> {}

  /**
   * Handle an incoming event.
   * Override for event-driven nodes.
   */
  async onEvent(
    _event: Event,
    _context: NodeContext,
  ): Promise<Record<string, any> | null> {
    return null;
  }
}

/**
 * Base class for input nodes.
 *
 * Input nodes generate data from external sources.
 * They typically have no inputs and one or more outputs.
 */
export class InputNode extends BaseNode {
  async execute(
    _inputs: Record<string, any>,
    _context: NodeContext,
  ): Promise<Record<string, any>> {
    return {};
  }
}

/**
 * Base class for processing nodes.
 *
 * Process nodes transform data from inputs to outputs.
 */
export abstract class ProcessNode extends BaseNode {
  /**
   * Process the inputs and return outputs.
   */
  abstract process(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>>;

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    return this.process(inputs, context);
  }
}

/**
 * Base class for output nodes.
 *
 * Output nodes send data to external destinations.
 * They typically have one or more inputs and no outputs.
 */
export abstract class OutputNode extends BaseNode {
  /**
   * Send the inputs to the output destination.
   */
  abstract output(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<void>;

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    await this.output(inputs, context);
    return {};
  }
}
