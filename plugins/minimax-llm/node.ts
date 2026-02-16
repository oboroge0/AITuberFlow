/**
 * MiniMax LLM Node
 *
 * Generates text using MiniMax M2.5 models.
 * Compatible with OpenAI SDK.
 */

import { BaseNode, NodeContext, createEvent, ErrorCode, getErrorMessage } from "@aituber-flow/sdk";
import type { Event } from "@aituber-flow/sdk";
import OpenAI from "openai";

interface PromptSection {
  type: "text" | "input";
  content: string;
}

export default class MiniMaxLLMNode extends BaseNode {
  private static readonly DEMO_RESPONSE =
    "This is demo mode. Set API key to use real LLM.";

  private static readonly REASONING_MODELS = new Set([
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
  ]);

  private client: OpenAI | null = null;
  private apiKey: string = "";
  private model: string = "MiniMax-M2.5";
  private systemPrompt: string = "You are a helpful assistant.";
  private temperature: number = 1.0;
  private maxTokens: number = 1024;
  private reasoning: string = "none";
  private promptSections: PromptSection[] | null = null;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.apiKey = config.apiKey ?? "";
    this.model = config.model ?? "MiniMax-M2.5";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.temperature = config.temperature ?? 1.0;
    if (this.temperature <= 0) this.temperature = 0.01;
    if (this.temperature > 1) this.temperature = 1.0;
    
    this.maxTokens = config.maxTokens ?? 1024;
    this.reasoning = config.reasoning ?? "none";
    this.promptSections = config.promptSections ?? null;

    if (!this.apiKey) {
      await context.log("[Demo Mode] No API key set", "warning");
    } else {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: "https://api.minimax.io/v1",
      });
      
      let modelInfo = "model: " + this.model;
      if (MiniMaxLLMNode.REASONING_MODELS.has(this.model) && this.reasoning !== "none") {
        modelInfo = modelInfo + ", reasoning: " + this.reasoning;
      }
      await context.log("MiniMax client initialized (" + modelInfo + ")");
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

  private stripThinkingContent(content: string): string {
    const thinkStart = "<think>";
    const thinkEnd = "</think>";
    
    let result = content;
    
    while (true) {
      const startIdx = result.indexOf(thinkStart);
      if (startIdx === -1) break;
      
      const endIdx = result.indexOf(thinkEnd, startIdx + thinkStart.length);
      if (endIdx === -1) break;
      
      result = result.substring(0, startIdx) + result.substring(endIdx + thinkEnd.length);
    }
    
    return result.trim();
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    if (!this.client) {
      await context.log("[Demo Mode] Returning demo response", "info");
      return { response: MiniMaxLLMNode.DEMO_RESPONSE };
    }

    const prompt = this.promptSections
      ? this.buildPromptFromSections(inputs)
      : ((inputs.prompt as string) ?? "");

    if (!prompt) {
      await context.log("No prompt provided", "warning");
      return { response: "" };
    }

    try {
      await context.log("Calling MiniMax API (" + this.model + ")...");

      const characterName = context.getCharacterName();
      const characterPersonality = context.getCharacterPersonality();

      let fullSystemPrompt = this.systemPrompt;
      if (characterPersonality) {
        fullSystemPrompt = this.systemPrompt + "\n\nYou are " + characterName + ". " + characterPersonality;
      }

      const apiParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: [
          { role: "system" as const, content: fullSystemPrompt },
          { role: "user" as const, content: prompt },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      };

      if (MiniMaxLLMNode.REASONING_MODELS.has(this.model) && this.reasoning !== "none") {
        (apiParams as any).reasoning_effort = this.reasoning;
      }

      const response = await this.client.chat.completions.create(apiParams);

      let result = response.choices[0].message.content ?? "";
      result = this.stripThinkingContent(result);
      
      await context.log("Response received (" + result.length + " chars)");

      await context.emitEvent(
        createEvent("response.generated", {
          text: result,
          model: this.model,
        }),
      );

      return { response: result };
    } catch (error: unknown) {
      if (error instanceof OpenAI.APIConnectionError) {
        const errorMsg = getErrorMessage(ErrorCode.LLM_CONNECTION_FAILED, "en", {
          provider: "MiniMax",
        });
        await context.log(errorMsg, "error");
        return { response: "Error: Connection failed" };
      }

      if (error instanceof OpenAI.RateLimitError) {
        const errorMsg = getErrorMessage(ErrorCode.LLM_RATE_LIMIT, "en", {
          provider: "MiniMax",
        });
        await context.log(errorMsg, "error");
        return { response: "Error: Rate limit exceeded" };
      }

      if (error instanceof OpenAI.APIError) {
        const errorMsg = getErrorMessage(ErrorCode.LLM_API_ERROR, "en", {
          provider: "MiniMax",
          error: error.message,
        });
        await context.log(errorMsg, "error");
        return { response: "Error: " + error.message };
      }

      const message = error instanceof Error ? error.message : String(error);
      await context.log("Unexpected error: " + message, "error");
      return { response: "Error: " + message };
    }
  }

  async teardown(): Promise<void> {
    this.client = null;
  }
}
