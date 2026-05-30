/**
 * Variable Node
 *
 * Stores and retrieves values.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class VariableNode extends BaseNode {
  private name = "myVariable";
  private defaultValue: any = "";
  private valueType = "string";

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.name = config.name ?? "myVariable";
    this.defaultValue = config.defaultValue ?? "";
    this.valueType = config.valueType ?? "string";

    await context.log(`Variable '${this.name}' configured`);
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    // Use input value if provided, otherwise use default
    let value: any = inputs.set;

    if (value == null) {
      value = this.defaultValue;
    }

    // Convert to the specified type
    try {
      if (this.valueType === "number") {
        const strValue = String(value);
        value = strValue.includes(".") ? parseFloat(strValue) : parseInt(strValue, 10);
        if (isNaN(value)) {
          throw new Error(`Cannot convert "${strValue}" to number`);
        }
      } else if (this.valueType === "boolean") {
        if (typeof value === "string") {
          value = ["true", "1", "yes"].includes(value.toLowerCase());
        } else {
          value = Boolean(value);
        }
      } else if (this.valueType === "json") {
        if (typeof value === "string") {
          value = JSON.parse(value);
        }
      } else {
        // string
        value = String(value);
      }
    } catch (e) {
      await context.log(`Type conversion failed: ${e}. Falling back to defaultValue.`, "warning");
      // Use defaultValue as a safe fallback to avoid passing a broken value downstream
      value = this.defaultValue;
    }

    await context.log(`Variable '${this.name}' = ${value}`);
    return { value };
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
