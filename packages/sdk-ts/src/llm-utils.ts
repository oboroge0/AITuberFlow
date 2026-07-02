/**
 * Shared LLM error handling utilities.
 *
 * Provides unified error classification and handling
 * across all LLM plugins (OpenAI, Anthropic, Google, Ollama).
 */

import { ErrorCode, getErrorMessage } from "./errors";

export type LLMErrorCategory =
  | "connection"
  | "rate_limit"
  | "auth"
  | "api_error"
  | "unknown";

export interface LLMErrorResult {
  response: string;
  category: LLMErrorCategory;
}

/**
 * Classify an LLM error by examining its class name and message patterns.
 */
export function classifyLLMError(error: unknown): LLMErrorCategory {
  if (error == null) return "unknown";

  const errorName =
    error instanceof Error ? error.constructor.name : "";
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  // Connection errors
  if (
    errorName.includes("Connection") ||
    errorName.includes("Network") ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(
      errorMessage,
    )
  ) {
    return "connection";
  }

  // Rate limit errors
  if (
    errorName.includes("RateLimit") ||
    /rate.?limit|429|too many requests|quota/i.test(errorMessage)
  ) {
    return "rate_limit";
  }

  // Auth errors
  if (
    errorName.includes("Authentication") ||
    errorName.includes("Permission") ||
    /401|403|unauthorized|forbidden|invalid.*(api.?key|token)/i.test(
      errorMessage,
    )
  ) {
    return "auth";
  }

  // Generic API errors
  if (
    errorName.includes("APIError") ||
    errorName.includes("API") ||
    /4\d{2}|5\d{2}/.test(errorMessage)
  ) {
    return "api_error";
  }

  return "unknown";
}

/**
 * Resolve the system prompt an LLM node should use for a call.
 *
 * Prefers `system` (typically wired in from an upstream node such as
 * prompt-builder) when it is a non-empty string. Falls back to the node's
 * configured default otherwise — including when `system` is missing, an
 * empty string, or a non-string value (e.g. an object accidentally passed
 * through from an upstream node), so a bad upstream value never reaches the
 * provider API as-is.
 */
export function resolveSystemPrompt(system: unknown, fallback: string): string {
  if (typeof system === "string" && system !== "") {
    return system;
  }
  return fallback ?? "";
}

/**
 * Handle an LLM error: classify, log a localized message, and return a structured response.
 */
export async function handleLLMError(
  error: unknown,
  provider: string,
  context: { log: (message: string, level?: string) => Promise<void> },
): Promise<LLMErrorResult> {
  const category = classifyLLMError(error);
  const message = error instanceof Error ? error.message : String(error);

  switch (category) {
    case "connection": {
      const errorMsg = getErrorMessage(ErrorCode.LLM_CONNECTION_FAILED, "ja", {
        provider,
      });
      await context.log(errorMsg, "error");
      return { response: "Error: Connection failed", category };
    }
    case "rate_limit": {
      const errorMsg = getErrorMessage(ErrorCode.LLM_RATE_LIMIT, "ja", {
        provider,
      });
      await context.log(errorMsg, "error");
      return { response: "Error: Rate limit exceeded", category };
    }
    case "auth": {
      const errorMsg = getErrorMessage(ErrorCode.LLM_API_KEY_MISSING, "ja", {
        provider,
      });
      await context.log(errorMsg, "error");
      return { response: "Error: Authentication failed", category };
    }
    case "api_error": {
      const errorMsg = getErrorMessage(ErrorCode.LLM_API_ERROR, "ja", {
        provider,
        error: message,
      });
      await context.log(errorMsg, "error");
      return { response: `Error: ${message}`, category };
    }
    default: {
      await context.log(`Unexpected error: ${message}`, "error");
      return { response: `Error: ${message}`, category };
    }
  }
}
