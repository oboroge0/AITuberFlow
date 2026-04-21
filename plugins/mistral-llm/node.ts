/**
 * Mistral LLM Node
 *
 * Generates text responses using Mistral AI API.
 * Uses OpenAI-compatible API format with custom baseURL.
 */

import {
  BaseNode,
  NodeContext,
  clampTemperature,
  createEvent,
  handleLLMError,
} from "@aituber-flow/sdk";
import OpenAI from "openai";

interface PromptSection {
  type: "text" | "input";
  content: string;
}

export default class MistralLLMNode extends BaseNode {
  private static readonly DEMO_RESPONSE =
    "これはデモモードの応答です。実際のLLMを使用するにはAPIキーを設定してください。";

  private client: OpenAI | null = null;
  private model: string = "mistral-small-latest";
  private systemPrompt: string = "You are a helpful assistant.";
  private temperature: number = 0.7;
  private maxTokens: number = 1024;
  private promptSections: PromptSection[] | null = null;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    const apiKey = config.apiKey ?? "";
    this.model = config.model ?? "mistral-small-latest";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.temperature = clampTemperature(config.temperature, 0.7);
    this.maxTokens = config.maxTokens ?? 1024;
    this.promptSections = config.promptSections ?? null;

    if (!apiKey) {
      await context.log(
        "[デモモード] Mistral APIキー未設定 - 定型文応答を返します",
        "warning",
      );
    } else {
      this.client = new OpenAI({
        apiKey,
        baseURL: "https://api.mistral.ai/v1",
      });
      await context.log(`Mistral client initialized (model: ${this.model})`);
    }
  }

  private buildPromptFromSections(inputs: Record<string, any>): string {
    if (!this.promptSections) {
      return (inputs.prompt as string) ?? "";
    }

    const parts: string[] = [];
    for (const section of this.promptSections) {
      if (section.type === "text") {
        parts.push(section.content);
      } else if (section.type === "input") {
        let inputValue: any = inputs[section.content] ?? "";
        if (typeof inputValue === "object" && inputValue !== null && !Array.isArray(inputValue)) {
          if ("message" in inputValue) {
            inputValue = inputValue.message;
          } else if ("text" in inputValue) {
            inputValue = inputValue.text;
          } else {
            inputValue = String(inputValue);
          }
        }
        parts.push(inputValue ? String(inputValue) : "");
      }
    }

    return parts.join("\n");
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    if (!this.client) {
      await context.log("[デモモード] 定型文応答を返します", "info");
      return { response: MistralLLMNode.DEMO_RESPONSE };
    }

    const prompt = this.promptSections
      ? this.buildPromptFromSections(inputs)
      : ((inputs.prompt as string) ?? "");

    if (!prompt) {
      await context.log("No prompt provided", "warning");
      return { response: "" };
    }

    try {
      await context.log(`Calling Mistral API (${this.model})...`);

      const characterName = context.getCharacterName();
      const characterPersonality = context.getCharacterPersonality();

      let fullSystemPrompt = this.systemPrompt;
      if (characterPersonality) {
        fullSystemPrompt = `${this.systemPrompt}\n\nYou are ${characterName}. ${characterPersonality}`;
      }

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system" as const, content: fullSystemPrompt },
          { role: "user" as const, content: prompt },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      const result = response.choices[0].message.content ?? "";
      await context.log(`Response received (${result.length} chars)`);

      await context.emitEvent(
        createEvent("response.generated", {
          text: result,
          model: this.model,
        }),
      );

      return { response: result };
    } catch (error: unknown) {
      const result = await handleLLMError(error, "Mistral", context);
      return { response: result.response };
    }
  }

  async teardown(): Promise<void> {
    this.client = null;
  }
}
