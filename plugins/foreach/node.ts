/**
 * ForEach Node
 *
 * Iterates over each item in a list or text separated by a delimiter.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class ForEachNode extends BaseNode {
  private separator = "\n";
  private items: any[] = [];
  private currentIndex = 0;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    let separator = config.separator ?? "\\n";
    // Handle escape sequences
    if (separator === "\\n") {
      this.separator = "\n";
    } else if (separator === "\\t") {
      this.separator = "\t";
    } else {
      this.separator = separator;
    }

    this.items = [];
    this.currentIndex = 0;

    await context.log("ForEach node initialized");
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const listInput = inputs.list ?? "";

    // Initialize items on first call or if new input
    if (this.items.length === 0 || this.currentIndex === 0) {
      if (Array.isArray(listInput)) {
        this.items = listInput;
      } else if (typeof listInput === "string") {
        this.items = listInput
          .split(this.separator)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      } else {
        this.items = listInput ? [listInput] : [];
      }

      this.currentIndex = 0;
      await context.log(`ForEach processing ${this.items.length} items`);
    }

    // Check if we have more items
    if (this.currentIndex < this.items.length) {
      const currentItem = this.items[this.currentIndex];
      const currentIndex = this.currentIndex;
      this.currentIndex += 1;

      await context.log(
        `ForEach item ${currentIndex + 1}/${this.items.length}: ${String(currentItem).substring(0, 50)}`,
      );

      // Emit iteration event
      await context.emitEvent(
        createEvent("foreach.iteration", {
          item: currentItem,
          index: currentIndex,
          total: this.items.length,
        }),
      );

      return {
        item: currentItem,
        index: currentIndex,
        done: null,
      };
    } else {
      // Done iterating
      await context.log("ForEach completed all items");

      // Reset for next run
      this.items = [];
      this.currentIndex = 0;

      return {
        item: null,
        index: null,
        done: true,
      };
    }
  }

  async teardown(): Promise<void> {
    // Reset state.
    this.items = [];
    this.currentIndex = 0;
  }
}
