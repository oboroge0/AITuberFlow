/**
 * OpenAI LLM Node
 *
 * Generates text responses using OpenAI's GPT models.
 */

import { BaseNode, NodeContext, createEvent, handleLLMError } from "@aituber-flow/sdk";
import type { Event } from "@aituber-flow/sdk";
import OpenAI from "openai";

interface PromptSection {
  type: "text" | "input";
  content: string;
}

export default class OpenAILLMNode extends BaseNode {
  /** Demo mode response */
  private static readonly DEMO_RESPONSE =
    "これはデモモードの応答です。実際のLLMを使用するにはAPIキーを設定してください。";

  /** GPT-5 series models that support reasoning_effort */
  private static readonly GPT5_MODELS = new Set([
    "gpt-5",
    "gpt-5.1",
    "gpt-5.2",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.2-codex",
    "gpt-5.1-codex",
    "gpt-5.1-codex-mini",
    "o3",
    "o3-mini",
    "o4-mini",
  ]);

  private client: OpenAI | null = null;
  private apiKey: string = "";
  private model: string = "gpt-4o-mini";
  private systemPrompt: string = "You are a helpful assistant.";
  private temperature: number = 0.7;
  private maxTokens: number = 1024;
  private reasoningEffort: string | null = null;
  private promptSections: PromptSection[] | null = null;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.apiKey = config.apiKey ?? "";
    this.model = config.model ?? "gpt-4o-mini";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.temperature = config.temperature ?? 0.7;
    // Clamp to valid range [0, 2]
    this.temperature = Math.max(0, Math.min(2, this.temperature));
    this.maxTokens = config.maxTokens ?? 1024;
    this.reasoningEffort = config.reasoningEffort ?? null;
    this.promptSections = config.promptSections ?? null;

    if (!this.apiKey) {
      // Auto demo mode when API key is not set
      await context.log(
        "[デモモード] OpenAI APIキー未設定 - 定型文応答を返します",
        "warning",
      );
    } else {
      this.client = new OpenAI({ apiKey: this.apiKey });
      let modelInfo = `model: ${this.model}`;
      if (OpenAILLMNode.GPT5_MODELS.has(this.model) && this.reasoningEffort) {
        modelInfo += `, reasoning: ${this.reasoningEffort}`;
      }
      await context.log(`OpenAI client initialized (${modelInfo})`);
    }
  }

  /**
   * Build prompt from sections configuration.
   */
  private buildPromptFromSections(inputs: Record<string, any>): string {
    if (!this.promptSections) {
      return (inputs.prompt as string) ?? "";
    }

    const parts: string[] = [];
    for (const section of this.promptSections) {
      if (section.type === "text") {
        // Static text block
        parts.push(section.content);
      } else if (section.type === "input") {
        // Dynamic input from connection - content is the port name
        let inputValue: any = inputs[section.content] ?? "";
        // Handle objects by extracting common fields
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
    // Auto demo mode when client is not initialized (no API key)
    if (!this.client) {
      await context.log("[デモモード] 定型文応答を返します", "info");
      return { response: OpenAILLMNode.DEMO_RESPONSE };
    }

    // Build prompt from sections or use simple prompt input
    const prompt = this.promptSections
      ? this.buildPromptFromSections(inputs)
      : ((inputs.prompt as string) ?? "");

    if (!prompt) {
      await context.log("No prompt provided", "warning");
      return { response: "" };
    }

    try {
      await context.log(`Calling OpenAI API (${this.model})...`);

      // Include character personality in system prompt
      const characterName = context.getCharacterName();
      const characterPersonality = context.getCharacterPersonality();

      let fullSystemPrompt = this.systemPrompt;
      if (characterPersonality) {
        fullSystemPrompt = `${this.systemPrompt}\n\nYou are ${characterName}. ${characterPersonality}`;
      }

      // Build API parameters
      const apiParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: [
          { role: "system" as const, content: fullSystemPrompt },
          { role: "user" as const, content: prompt },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      };

      // Add reasoning_effort for GPT-5 series models
      if (OpenAILLMNode.GPT5_MODELS.has(this.model) && this.reasoningEffort) {
        (apiParams as any).reasoning = { effort: this.reasoningEffort };
      }

      const response = await this.client.chat.completions.create(apiParams);

      const result = response.choices[0].message.content ?? "";
      await context.log(`Response received (${result.length} chars)`);

      // Emit event for response generated
      await context.emitEvent(
        createEvent("response.generated", {
          text: result,
          model: this.model,
        }),
      );

      return { response: result };
    } catch (error: unknown) {
      return await handleLLMError(error, "OpenAI", context);
    }
  }

  async teardown(): Promise<void> {
    this.client = null;
  }
}
