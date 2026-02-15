/**
 * Text Transform Node
 *
 * Transforms text with various operations.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class TextTransformNode extends BaseNode {
  private operation = "template";
  private template = "{{text}}";
  private find = "";
  private replaceWith = "";
  private delimiter = " ";
  private templateInputs: string[] = [];

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.operation = config.operation ?? "template";
    this.template = config.template ?? "{{text}}";
    this.find = config.find ?? "";
    this.replaceWith = config.replaceWith ?? "";
    this.delimiter = config.delimiter ?? " ";
    this.templateInputs = config.templateInputs ?? [];

    await context.log(`Text transform configured: ${this.operation}`);
  }

  private _getInputValue(inputs: Record<string, any>, key: string): string {
    let value = inputs[key] ?? "";
    if (typeof value === "object" && value !== null) {
      // Try common fields for chat messages
      if ("message" in value) {
        value = value.message;
      } else if ("text" in value) {
        value = value.text;
      } else {
        value = String(value);
      }
    }
    return value != null ? String(value) : "";
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const text = this._getInputValue(inputs, "text");
    let result = text;

    if (this.operation === "uppercase") {
      result = text.toUpperCase();
    } else if (this.operation === "lowercase") {
      result = text.toLowerCase();
    } else if (this.operation === "trim") {
      result = text.trim();
    } else if (this.operation === "replace") {
      result = text.split(this.find).join(this.replaceWith);
    } else if (this.operation === "split_first") {
      const idx = text.indexOf(this.delimiter);
      result = idx >= 0 ? text.substring(0, idx) : text;
    } else if (this.operation === "split_last") {
      const idx = text.lastIndexOf(this.delimiter);
      result = idx >= 0 ? text.substring(idx + this.delimiter.length) : text;
    } else if (this.operation === "length") {
      result = String(text.length);
    } else if (this.operation === "prefix") {
      result = this.template + text;
    } else if (this.operation === "suffix") {
      result = text + this.template;
    } else if (this.operation === "template") {
      // Replace all {{varname}} patterns with corresponding input values
      result = this.template;

      const placeholders = this.template.match(/\{\{(\w+)\}\}/g) ?? [];
      const seen = new Set<string>();
      for (const raw of placeholders) {
        const placeholder = raw.slice(2, -2); // strip {{ and }}
        if (seen.has(placeholder)) continue;
        seen.add(placeholder);

        const inputValue = this._getInputValue(inputs, placeholder);
        result = result.split(`{{${placeholder}}}`).join(inputValue);
      }
    }

    await context.log(
      `Transformed: '${text.substring(0, 30)}...' -> '${result.substring(0, 30)}...'`,
    );
    return { result };
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
