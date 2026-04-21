/**
 * Switch Node
 *
 * Conditional routing based on input values.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class SwitchNode extends BaseNode {
  private mode = "truthy";
  private compareValue = "";
  private caseSensitive = false;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.mode = config.mode ?? "truthy";
    this.compareValue = config.compareValue ?? "";
    this.caseSensitive = config.caseSensitive ?? false;
    await context.log(`Switch configured: mode=${this.mode}`);
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const value = inputs.value;
    const data = inputs.data ?? value;

    const result = this._evaluate(value);

    if (result) {
      await context.log("Condition TRUE: routing to 'true' output");
      return { true: data, false: null, match: data };
    } else {
      await context.log("Condition FALSE: routing to 'false' output");
      return { true: null, false: data, match: null };
    }
  }

  private _evaluate(value: any): boolean {
    if (this.mode === "truthy") {
      return Boolean(value);
    } else if (this.mode === "equals") {
      return this._compareEqual(value, this.compareValue);
    } else if (this.mode === "contains") {
      return this._compareContains(value, this.compareValue);
    } else if (this.mode === "regex") {
      return this._compareRegex(value, this.compareValue);
    } else if (this.mode === "gt") {
      return this._compareGt(value, this.compareValue);
    } else if (this.mode === "lt") {
      return this._compareLt(value, this.compareValue);
    }
    return Boolean(value);
  }

  private _compareEqual(value: any, compare: string): boolean {
    const strValue = value != null ? String(value) : "";
    if (this.caseSensitive) {
      return strValue === compare;
    }
    return strValue.toLowerCase() === compare.toLowerCase();
  }

  private _compareContains(value: any, compare: string): boolean {
    const strValue = value != null ? String(value) : "";
    if (this.caseSensitive) {
      return strValue.includes(compare);
    }
    return strValue.toLowerCase().includes(compare.toLowerCase());
  }

  /** Cap pattern/input length to mitigate catastrophic regex backtracking. */
  private static readonly MAX_REGEX_PATTERN_LENGTH = 512;
  private static readonly MAX_REGEX_INPUT_LENGTH = 64 * 1024;

  private _compareRegex(value: any, pattern: string): boolean {
    if (pattern.length > SwitchNode.MAX_REGEX_PATTERN_LENGTH) return false;
    const strValue = value != null ? String(value) : "";
    if (strValue.length > SwitchNode.MAX_REGEX_INPUT_LENGTH) return false;
    try {
      const flags = this.caseSensitive ? "" : "i";
      const regex = new RegExp(pattern, flags);
      return regex.test(strValue);
    } catch {
      return false;
    }
  }

  private _compareGt(value: any, compare: string): boolean {
    const numValue = Number(value);
    const numCompare = Number(compare);
    if (isNaN(numValue) || isNaN(numCompare)) {
      return false;
    }
    return numValue > numCompare;
  }

  private _compareLt(value: any, compare: string): boolean {
    const numValue = Number(value);
    const numCompare = Number(compare);
    if (isNaN(numValue) || isNaN(numCompare)) {
      return false;
    }
    return numValue < numCompare;
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
