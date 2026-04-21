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
  private pendingControllers = new Set<AbortController>();

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

    let delay: number;
    if (this.randomize) {
      delay =
        Math.floor(Math.random() * (this.randomMax - this.randomMin + 1)) +
        this.randomMin;
    } else {
      delay = this.delayMs;
    }

    const controller = new AbortController();
    this.pendingControllers.add(controller);
    await context.log(`Waiting ${delay}ms...`);

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingControllers.delete(controller);
          resolve();
        }, delay);
        controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            this.pendingControllers.delete(controller);
            reject(new DOMException("Delay aborted", "AbortError"));
          },
          { once: true },
        );
      });
      await context.log("Delay complete");
      return { output: inputData };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        await context.log("Delay cancelled", "warning");
      }
      throw err;
    }
  }

  async teardown(): Promise<void> {
    // Cancel any outstanding delays so the timer doesn't fire after stop.
    for (const controller of this.pendingControllers) {
      controller.abort();
    }
    this.pendingControllers.clear();
  }
}
