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

/**
 * Error thrown by {@link handleLLMError} once an LLM call has failed.
 *
 * `message` is a user-facing, classified message (localized where possible)
 * followed by a short summary of the original error. `category` retains the
 * classification so callers (e.g. retry logic) can branch on it.
 */
export class LLMError extends Error {
  readonly category: LLMErrorCategory;

  constructor(message: string, category: LLMErrorCategory, options?: ErrorOptions) {
    super(message, options);
    this.name = "LLMError";
    this.category = category;
  }
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
 * Handle an LLM error: classify, log a localized message, and throw.
 *
 * This never returns a value — LLM failures must not be mistaken for
 * successful responses by downstream nodes (e.g. a TTS node reading an
 * error string aloud on stream). Callers should `return await
 * handleLLMError(...)` from their `catch` block; the executor is
 * responsible for catching the thrown {@link LLMError}, logging it, and
 * marking the node as errored so execution does not continue downstream.
 */
export async function handleLLMError(
  error: unknown,
  provider: string,
  context: { log: (message: string, level?: string) => Promise<void> },
): Promise<never> {
  const category = classifyLLMError(error);
  const message = error instanceof Error ? error.message : String(error);

  let errorMsg: string;
  let llmErrorMessage: string;

  switch (category) {
    case "connection": {
      errorMsg = getErrorMessage(ErrorCode.LLM_CONNECTION_FAILED, "ja", {
        provider,
      });
      llmErrorMessage = `${errorMsg} (${message})`;
      break;
    }
    case "rate_limit": {
      errorMsg = getErrorMessage(ErrorCode.LLM_RATE_LIMIT, "ja", {
        provider,
      });
      llmErrorMessage = `${errorMsg} (${message})`;
      break;
    }
    case "auth": {
      errorMsg = getErrorMessage(ErrorCode.LLM_API_KEY_MISSING, "ja", {
        provider,
      });
      llmErrorMessage = `${errorMsg} (${message})`;
      break;
    }
    case "api_error": {
      errorMsg = getErrorMessage(ErrorCode.LLM_API_ERROR, "ja", {
        provider,
        error: message,
      });
      llmErrorMessage = errorMsg;
      break;
    }
    default: {
      errorMsg = `Unexpected error: ${message}`;
      llmErrorMessage = errorMsg;
      break;
    }
  }

  await context.log(errorMsg, "error");
  throw new LLMError(llmErrorMessage, category, { cause: error });
}
