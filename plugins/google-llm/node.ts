/**
 * Google Gemini LLM Node
 *
 * Generates text using Google's Gemini models.
 */

import { BaseNode, NodeContext, createEvent, handleLLMError, resolveSystemPrompt } from "@aituber-flow/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default class GoogleLLMNode extends BaseNode {
  /** Demo mode response */
  private static readonly DEMO_RESPONSE =
    "これはデモモードの応答です。実際のLLMを使用するにはAPIキーを設定してください。";

  private apiKey: string = "";
  private model: string = "gemini-1.5-flash";
  private systemPrompt: string = "You are a helpful assistant.";
  private maxTokens: number = 1024;
  private temperature: number = 0.7;
  private genAI: GoogleGenerativeAI | null = null;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.apiKey = config.apiKey ?? "";
    this.model = config.model ?? "gemini-1.5-flash";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.maxTokens = config.maxTokens ?? 1024;
    this.temperature = config.temperature ?? 0.7;
    // Clamp to Google's valid range [0, 2]
    this.temperature = Math.max(0, Math.min(2, this.temperature));

    if (!this.apiKey) {
      // Auto demo mode when API key is not set
      await context.log(
        "[デモモード] Google AI APIキー未設定 - 定型文応答を返します",
        "warning",
      );
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      await context.log(`Gemini configured: ${this.model}`);
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

    // Auto demo mode when API key is not set
    if (!this.apiKey || !this.genAI) {
      await context.log("[デモモード] 定型文応答を返します", "info");
      return { response: GoogleLLMNode.DEMO_RESPONSE };
    }

    try {
      await context.log(`Calling Gemini API (${this.model})...`);

      const systemPrompt = resolveSystemPrompt(inputs.system, this.systemPrompt);

      const model = this.genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
        generationConfig: {
          maxOutputTokens: this.maxTokens,
          temperature: this.temperature,
        },
      });

      const response = await model.generateContent(prompt);
      const result = response.response.text();
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
      return await handleLLMError(error, "Google", context);
    }
  }

  async teardown(): Promise<void> {
    // No cleanup needed
  }
}
