/**
 * Tests for the LLM error handling utilities in @aituber-flow/sdk
 */

import { describe, it, expect, mock } from "bun:test";
import {
  clampTemperature,
  classifyLLMError,
  handleLLMError,
} from "../../packages/sdk-ts/src/llm-utils";

describe("classifyLLMError", () => {
  it("returns 'unknown' for null/undefined", () => {
    expect(classifyLLMError(null)).toBe("unknown");
    expect(classifyLLMError(undefined)).toBe("unknown");
  });

  it("classifies connection errors by class name", () => {
    class APIConnectionError extends Error {
      constructor() {
        super("Connection refused");
        this.name = "APIConnectionError";
      }
    }
    expect(classifyLLMError(new APIConnectionError())).toBe("connection");
  });

  it("classifies connection errors by message pattern", () => {
    expect(classifyLLMError(new Error("ECONNREFUSED"))).toBe("connection");
    expect(classifyLLMError(new Error("ENOTFOUND"))).toBe("connection");
    expect(classifyLLMError(new Error("ETIMEDOUT"))).toBe("connection");
    expect(classifyLLMError(new Error("fetch failed"))).toBe("connection");
  });

  it("classifies rate limit errors by class name", () => {
    class RateLimitError extends Error {
      constructor() {
        super("Too many requests");
        this.name = "RateLimitError";
      }
    }
    expect(classifyLLMError(new RateLimitError())).toBe("rate_limit");
  });

  it("classifies rate limit errors by message pattern", () => {
    expect(classifyLLMError(new Error("429 Too Many Requests"))).toBe("rate_limit");
    expect(classifyLLMError(new Error("rate limit exceeded"))).toBe("rate_limit");
    expect(classifyLLMError(new Error("quota exceeded"))).toBe("rate_limit");
  });

  it("classifies auth errors by class name", () => {
    class AuthenticationError extends Error {
      constructor() {
        super("Invalid key");
        this.name = "AuthenticationError";
      }
    }
    expect(classifyLLMError(new AuthenticationError())).toBe("auth");
  });

  it("classifies auth errors by message pattern", () => {
    expect(classifyLLMError(new Error("401 Unauthorized"))).toBe("auth");
    expect(classifyLLMError(new Error("403 Forbidden"))).toBe("auth");
    expect(classifyLLMError(new Error("invalid api key"))).toBe("auth");
  });

  it("classifies generic API errors by class name", () => {
    class APIError extends Error {
      constructor() {
        super("Bad request");
        this.name = "APIError";
      }
    }
    expect(classifyLLMError(new APIError())).toBe("api_error");
  });

  it("classifies HTTP errors by status code in message", () => {
    expect(classifyLLMError(new Error("HTTP 500: Internal Server Error"))).toBe("api_error");
    expect(classifyLLMError(new Error("HTTP 400: Bad Request"))).toBe("api_error");
  });

  it("returns 'unknown' for unrecognized errors", () => {
    expect(classifyLLMError(new Error("something went wrong"))).toBe("unknown");
    expect(classifyLLMError("plain string error")).toBe("unknown");
  });
});

describe("handleLLMError", () => {
  function createMockContext() {
    const logs: { message: string; level?: string }[] = [];
    return {
      log: mock(async (message: string, level?: string) => {
        logs.push({ message, level });
      }),
      logs,
    };
  }

  it("handles connection errors", async () => {
    const ctx = createMockContext();
    const result = await handleLLMError(
      new Error("ECONNREFUSED"),
      "OpenAI",
      ctx,
    );
    expect(result.category).toBe("connection");
    expect(result.response).toBe("Error: Connection failed");
    expect(ctx.log).toHaveBeenCalledTimes(1);
    expect(ctx.logs[0].level).toBe("error");
    expect(ctx.logs[0].message).toContain("OpenAI");
  });

  it("handles rate limit errors", async () => {
    const ctx = createMockContext();
    const result = await handleLLMError(
      new Error("429 Too Many Requests"),
      "Anthropic",
      ctx,
    );
    expect(result.category).toBe("rate_limit");
    expect(result.response).toBe("Error: Rate limit exceeded");
    expect(ctx.logs[0].message).toContain("Anthropic");
  });

  it("handles auth errors", async () => {
    const ctx = createMockContext();
    const result = await handleLLMError(
      new Error("401 Unauthorized"),
      "Google",
      ctx,
    );
    expect(result.category).toBe("auth");
    expect(result.response).toBe("Error: Authentication failed");
    expect(ctx.logs[0].message).toContain("Google");
  });

  it("handles generic API errors", async () => {
    const ctx = createMockContext();
    class APIError extends Error {
      constructor() {
        super("Model not found");
        this.name = "APIError";
      }
    }
    const result = await handleLLMError(new APIError(), "Ollama", ctx);
    expect(result.category).toBe("api_error");
    expect(result.response).toContain("Model not found");
    expect(ctx.logs[0].message).toContain("Ollama");
  });

  it("handles unknown errors", async () => {
    const ctx = createMockContext();
    const result = await handleLLMError(
      new Error("something unexpected"),
      "OpenAI",
      ctx,
    );
    expect(result.category).toBe("unknown");
    expect(result.response).toContain("something unexpected");
    expect(ctx.logs[0].level).toBe("error");
  });

  it("handles non-Error values", async () => {
    const ctx = createMockContext();
    const result = await handleLLMError("string error", "OpenAI", ctx);
    expect(result.response).toContain("string error");
  });
});

describe("clampTemperature", () => {
  it("returns valid numbers unchanged", () => {
    expect(clampTemperature(0)).toBe(0);
    expect(clampTemperature(0.7)).toBe(0.7);
    expect(clampTemperature(2)).toBe(2);
  });

  it("clamps to [0, 2]", () => {
    expect(clampTemperature(-1)).toBe(0);
    expect(clampTemperature(5)).toBe(2);
  });

  it("coerces numeric strings", () => {
    expect(clampTemperature("0.5")).toBe(0.5);
    expect(clampTemperature("1.5")).toBe(1.5);
  });

  it("falls back when not a finite number", () => {
    expect(clampTemperature(undefined)).toBe(0.7);
    expect(clampTemperature(null)).toBe(0.7);
    expect(clampTemperature("abc")).toBe(0.7);
    expect(clampTemperature(Number.NaN)).toBe(0.7);
    expect(clampTemperature(Number.POSITIVE_INFINITY)).toBe(0.7);
    expect(clampTemperature(undefined, 0.3)).toBe(0.3);
  });
});
