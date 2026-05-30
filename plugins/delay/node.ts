/**
 * Delay Node
 *
 * Adds a time delay before passing data downstream.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class DelayNode extends BaseNode {
  private delayMs = 1000;
  private randomize = false;
  private randomMin = 500;
  private randomMax = 2000;
  private abortController: AbortController | null = null;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.delayMs = config.delayMs ?? 1000;
    this.randomize = config.randomize ?? false;
    this.randomMin = config.randomMin ?? 500;
    this.randomMax = config.randomMax ?? 2000;

    if (this.randomize) {
      await context.log(
        `Delay configured: ${this.randomMin}-${this.randomMax}ms (random)`,
      );
    } else {
      await context.log(`Delay configured: ${this.delayMs}ms`);
    }
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const inputData = inputs.input;

    // Calculate delay
    let delay: number;
    if (this.randomize) {
      delay =
        Math.floor(Math.random() * (this.randomMax - this.randomMin + 1)) +
        this.randomMin;
    } else {
      delay = this.delayMs;
    }

    await context.log(`Waiting ${delay}ms...`);
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Delay cancelled"));
      });
    });
    await context.log("Delay complete");

    return { output: inputData };
  }

  async teardown(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
  }
}
