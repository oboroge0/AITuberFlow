/**
 * Anthropic Claude LLM Node
 *
 * Generates text using Anthropic's Claude models.
 */

import {
  BaseNode,
  NodeContext,
  clampTemperature,
  createEvent,
  handleLLMError,
} from "@aituber-flow/sdk";
import Anthropic from "@anthropic-ai/sdk";

export default class AnthropicLLMNode extends BaseNode {
  /** Demo mode response */
  private static readonly DEMO_RESPONSE =
    "これはデモモードの応答です。実際のLLMを使用するにはAPIキーを設定してください。";

  private apiKey: string = "";
  private model: string = "claude-3-haiku-20240307";
  private systemPrompt: string = "You are a helpful assistant.";
  private maxTokens: number = 1024;
  private temperature: number = 0.7;
  private client: Anthropic | null = null;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.apiKey = config.apiKey ?? "";
    this.model = config.model ?? "claude-3-haiku-20240307";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.maxTokens = config.maxTokens ?? 1024;
    this.temperature = clampTemperature(config.temperature, 0.7);

    if (!this.apiKey) {
      // Auto demo mode when API key is not set
      await context.log(
        "[デモモード] Anthropic APIキー未設定 - 定型文応答を返します",
        "warning",
      );
    } else {
      this.client = new Anthropic({ apiKey: this.apiKey });
      await context.log(`Claude configured: ${this.model}`);
    }
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const prompt = (inputs.prompt as string) ?? "";

    if (!prompt) {
      await context.log("No prompt provided", "warning");
      return { response: "" };
    }

    // Auto demo mode when client is not initialized (no API key)
    if (!this.client) {
      await context.log("[デモモード] 定型文応答を返します", "info");
      return { response: AnthropicLLMNode.DEMO_RESPONSE };
    }

    try {
      await context.log(`Calling Claude API (${this.model})...`);

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: this.systemPrompt,
        messages: [{ role: "user" as const, content: prompt }],
      });

      const firstBlock = message.content[0];
      const response =
        firstBlock.type === "text" ? firstBlock.text : "";
      await context.log(`Response received (${response.length} chars)`);

      // Emit event for response generated
      await context.emitEvent(
        createEvent("response.generated", {
          text: response,
          model: this.model,
        }),
      );

      return { response };
    } catch (error: unknown) {
      const result = await handleLLMError(error, "Anthropic", context);
      return { response: result.response };
    }
  }

  async teardown(): Promise<void> {
    this.client = null;
  }
}
