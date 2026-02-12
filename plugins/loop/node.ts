/**
 * Loop Node
 *
 * Iterates execution a specified number of times or while a condition is true.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class LoopNode extends BaseNode {
  private mode = "count";
  private count = 3;
  private condition = "";
  private maxIterations = 100;
  private currentIteration = 0;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.mode = config.mode ?? "count";
    this.count = config.count ?? 3;
    this.condition = config.condition ?? "";
    this.maxIterations = config.maxIterations ?? 100;
    this.currentIteration = 0;

    await context.log(
      `Loop node initialized: mode=${this.mode}, count=${this.count}`,
    );
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const inputValue = inputs.input ?? inputs.loopback;

    this.currentIteration += 1;

    // Check safety limit
    if (this.currentIteration > this.maxIterations) {
      await context.log(
        `Loop reached max iterations (${this.maxIterations})`,
        "warning",
      );
      return { done: inputValue, loop: null };
    }

    let shouldContinue = false;

    if (this.mode === "count") {
      shouldContinue = this.currentIteration <= this.count;
    } else if (this.mode === "while") {
      // Simple condition evaluation (for basic cases)
      // This mirrors the Python eval() behavior from the original node.py.
      // The condition string comes from the user's workflow config
      // and supports {{value}} and {{iteration}} template variables.
      try {
        let condStr = this.condition.replace(
          /\{\{value\}\}/g,
          String(inputValue),
        );
        condStr = condStr.replace(
          /\{\{iteration\}\}/g,
          String(this.currentIteration),
        );
        // eslint-disable-next-line no-new-func
        shouldContinue = Boolean(new Function(`return (${condStr})`)());
      } catch (e) {
        await context.log(`Condition evaluation error: ${e}`, "error");
        shouldContinue = false;
      }
    } else if (this.mode === "infinite") {
      shouldContinue = true;
    }

    await context.log(
      `Loop iteration ${this.currentIteration}: continue=${shouldContinue}`,
    );

    // Emit loop event
    await context.emitEvent(
      createEvent("loop.iteration", {
        iteration: this.currentIteration,
        continue: shouldContinue,
        value: inputValue,
      }),
    );

    if (shouldContinue) {
      return { loop: inputValue, done: null };
    } else {
      // Reset for next run
      this.currentIteration = 0;
      return { done: inputValue, loop: null };
    }
  }

  async teardown(): Promise<void> {
    // Reset iteration counter.
    this.currentIteration = 0;
  }
}
