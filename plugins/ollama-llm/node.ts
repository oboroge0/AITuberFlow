/**
 * Ollama LLM Node
 *
 * Generates text using Ollama local LLM server.
 */

import { BaseNode, NodeContext, handleLLMError } from "@aituber-flow/sdk";

interface OllamaGenerateResponse {
  response: string;
  [key: string]: any;
}

export default class OllamaLLMNode extends BaseNode {
  /** Demo mode response */
  private static readonly DEMO_RESPONSE =
    "これはデモモードの応答です。実際のLLMを使用するにはOllamaを起動してください。";

  private host: string = "http://localhost:11434";
  private model: string = "llama3.2";
  private systemPrompt: string = "You are a helpful assistant.";
  private temperature: number = 0.7;
  private contextLength: number = 4096;
  private connectionAvailable: boolean = true;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.host = config.host ?? "http://localhost:11434";
    this.model = config.model ?? "llama3.2";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.temperature = config.temperature ?? 0.7;
    // Clamp to valid range [0, 2]
    this.temperature = Math.max(0, Math.min(2, this.temperature));
    this.contextLength = config.contextLength ?? 4096;

    // Test connection - auto demo mode if unavailable
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `${this.host.replace(/\/+$/, "")}/api/tags`,
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);

      if (response.ok) {
        this.connectionAvailable = true;
        await context.log(
          `Ollama connected: ${this.model} at ${this.host}`,
        );
      } else {
        this.connectionAvailable = false;
        await context.log(
          "[デモモード] Ollama接続テスト失敗 - 定型文応答を返します",
          "warning",
        );
      }
    } catch {
      this.connectionAvailable = false;
      await context.log(
        `[デモモード] Ollamaに接続できません (${this.host}) - 定型文応答を返します`,
        "warning",
      );
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

    // Auto demo mode: return placeholder response if connection is unavailable
    if (!this.connectionAvailable) {
      await context.log("[デモモード] 定型文応答を返します", "info");
      return { response: OllamaLLMNode.DEMO_RESPONSE };
    }

    try {
      await context.log(`Calling Ollama API (${this.model})...`);

      const url = `${this.host.replace(/\/+$/, "")}/api/generate`;

      const payload = {
        model: this.model,
        prompt,
        system: this.systemPrompt,
        stream: false,
        options: {
          temperature: this.temperature,
          num_ctx: this.contextLength,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const httpError = new Error(`HTTP ${response.status}: ${errorText}`);
        const result = await handleLLMError(httpError, "Ollama", context);
        return { response: result.response };
      }

      const data = (await response.json()) as OllamaGenerateResponse;
      const result = data.response ?? "";
      await context.log(`Response received (${result.length} chars)`);
      return { response: result };
    } catch (error: unknown) {
      const result = await handleLLMError(error, "Ollama", context);
      return { response: result.response };
    }
  }

  async teardown(): Promise<void> {
    // No cleanup needed
  }
}
