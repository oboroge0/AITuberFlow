/**
 * Prompt Builder Node
 *
 * Assembles a system prompt from static text blocks and dynamic input ports.
 * The input ports themselves are generated at runtime by Canvas.tsx from the
 * `promptSections` config (type: "prompt-builder").
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

interface PromptSection {
  type: "text" | "input";
  content: string;
}

export default class PromptBuilderNode extends BaseNode {
  private promptSections: PromptSection[] = [];

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.promptSections = config.promptSections ?? [];
    await context.log(`Prompt builder initialized (${this.promptSections.length} sections)`);
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const parts: string[] = [];

    for (const section of this.promptSections) {
      if (section.type === "text") {
        parts.push(section.content);
      } else if (section.type === "input") {
        // section.content is the input port name
        let inputValue = inputs[section.content] ?? "";
        // Handle objects by converting to string
        if (typeof inputValue === "object" && inputValue !== null) {
          if (Array.isArray(inputValue)) {
            inputValue = JSON.stringify(inputValue);
          } else if ("text" in inputValue) {
            inputValue = inputValue.text;
          } else if ("message" in inputValue) {
            inputValue = inputValue.message;
          } else {
            inputValue = JSON.stringify(inputValue);
          }
        }
        parts.push(String(inputValue));
      }
    }

    const system = parts.join("\n");

    if (!system) {
      await context.log("No prompt sections configured", "warning");
    }

    return { system };
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
