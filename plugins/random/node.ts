/**
 * Random Node
 *
 * Generates random values.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class RandomNode extends BaseNode {
  private mode = "number";
  private minVal = 0;
  private maxVal = 100;
  private choices: string[] = [];
  private trueProbability = 50;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.mode = config.mode ?? "number";
    this.minVal = config.min ?? 0;
    this.maxVal = config.max ?? 100;
    this.trueProbability = config.trueProbability ?? 50;

    // Parse choices from comma-separated string
    const choicesStr: string = config.choices ?? "";
    if (choicesStr) {
      this.choices = choicesStr
        .split(",")
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 0);
    } else {
      this.choices = [];
    }

    await context.log(`Random configured: mode=${this.mode}`);
  }

  async execute(
    _inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    let value: any = null;

    if (this.mode === "number") {
      if (!Number.isInteger(this.minVal) || !Number.isInteger(this.maxVal)) {
        // Float random
        value = Math.random() * (this.maxVal - this.minVal) + this.minVal;
      } else {
        // Integer random (inclusive)
        const min = Math.floor(this.minVal);
        const max = Math.floor(this.maxVal);
        value = Math.floor(Math.random() * (max - min + 1)) + min;
      }
      await context.log(`Random number: ${value}`);
    } else if (this.mode === "choice") {
      if (this.choices.length > 0) {
        value = this.choices[Math.floor(Math.random() * this.choices.length)];
        await context.log(`Random choice: ${value}`);
      } else {
        value = "";
        await context.log("No choices available", "warning");
      }
    } else if (this.mode === "boolean") {
      value = Math.random() * 100 < this.trueProbability;
      await context.log(`Random boolean: ${value}`);
    }

    return { value };
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
