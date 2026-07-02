/**
 * Mistral LLM Node
 *
 * Generates text responses using Mistral AI API.
 * Uses OpenAI-compatible API format with custom baseURL.
 */

import { BaseNode, NodeContext, createEvent, handleLLMError, resolveSystemPrompt } from "@aituber-flow/sdk";
import OpenAI from "openai";

export default class MistralLLMNode extends BaseNode {
  private static readonly DEMO_RESPONSE =
    "これはデモモードの応答です。実際のLLMを使用するにはAPIキーを設定してください。";

  private client: OpenAI | null = null;
  private model: string = "mistral-small-latest";
  private systemPrompt: string = "You are a helpful assistant.";
  private temperature: number = 0.7;
  private maxTokens: number = 1024;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    const apiKey = config.apiKey ?? "";
    this.model = config.model ?? "mistral-small-latest";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.temperature = config.temperature ?? 0.7;
    // Clamp to valid range [0, 2]
    this.temperature = Math.max(0, Math.min(2, this.temperature));
    this.maxTokens = config.maxTokens ?? 1024;

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

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    if (!this.client) {
      await context.log("[デモモード] 定型文応答を返します", "info");
      return { response: MistralLLMNode.DEMO_RESPONSE };
    }

    const prompt = (inputs.prompt as string) ?? "";

    if (!prompt) {
      await context.log("No prompt provided", "warning");
      return { response: "" };
    }

    try {
      await context.log(`Calling Mistral API (${this.model})...`);

      const systemPrompt = resolveSystemPrompt(inputs.system, this.systemPrompt);

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system" as const, content: systemPrompt },
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
