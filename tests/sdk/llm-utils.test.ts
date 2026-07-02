/**
 * Tests for the LLM error handling utilities in @aituber-flow/sdk
 */

import { describe, it, expect, mock } from "bun:test";
import {
  classifyLLMError,
  handleLLMError,
  LLMError,
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

  it("throws an LLMError for connection errors", async () => {
    const ctx = createMockContext();
    let caught: unknown;
    try {
      await handleLLMError(new Error("ECONNREFUSED"), "OpenAI", ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LLMError);
    expect((caught as LLMError).category).toBe("connection");
    expect(ctx.log).toHaveBeenCalledTimes(1);
    expect(ctx.logs[0].level).toBe("error");
    expect(ctx.logs[0].message).toContain("OpenAI");
  });

  it("throws an LLMError for rate limit errors", async () => {
    const ctx = createMockContext();
    let caught: unknown;
    try {
      await handleLLMError(new Error("429 Too Many Requests"), "Anthropic", ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LLMError);
    expect((caught as LLMError).category).toBe("rate_limit");
    expect(ctx.logs[0].message).toContain("Anthropic");
  });

  it("throws an LLMError for auth errors", async () => {
    const ctx = createMockContext();
    let caught: unknown;
    try {
      await handleLLMError(new Error("401 Unauthorized"), "Google", ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LLMError);
    expect((caught as LLMError).category).toBe("auth");
    expect(ctx.logs[0].message).toContain("Google");
  });

  it("throws an LLMError for generic API errors", async () => {
    const ctx = createMockContext();
    class APIError extends Error {
      constructor() {
        super("Model not found");
        this.name = "APIError";
      }
    }
    let caught: unknown;
    try {
      await handleLLMError(new APIError(), "Ollama", ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LLMError);
    expect((caught as LLMError).category).toBe("api_error");
    expect((caught as LLMError).message).toContain("Model not found");
    expect(ctx.logs[0].message).toContain("Ollama");
  });

  it("throws an LLMError for unknown errors", async () => {
    const ctx = createMockContext();
    let caught: unknown;
    try {
      await handleLLMError(new Error("something unexpected"), "OpenAI", ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LLMError);
    expect((caught as LLMError).category).toBe("unknown");
    expect((caught as LLMError).message).toContain("something unexpected");
    expect(ctx.logs[0].level).toBe("error");
  });

  it("throws an LLMError for non-Error values", async () => {
    const ctx = createMockContext();
    let caught: unknown;
    try {
      await handleLLMError("string error", "OpenAI", ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LLMError);
    expect((caught as LLMError).message).toContain("string error");
  });

  it("preserves the original error via cause", async () => {
    const ctx = createMockContext();
    const original = new Error("ECONNREFUSED");
    let caught: unknown;
    try {
      await handleLLMError(original, "OpenAI", ctx);
    } catch (err) {
      caught = err;
    }
    expect((caught as LLMError).cause).toBe(original);
  });
});
