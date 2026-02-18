/**
 * Tests for the error system in @aituber-flow/sdk
 */

import { describe, it, expect } from "bun:test";
import {
  ErrorCode,
  getErrorMessage,
  formatErrorWithAction,
  NodeExecutionError,
  NodeConfigError,
  NodeConnectionError,
} from "../../packages/sdk-ts/src/errors";

describe("getErrorMessage", () => {
  it("returns Japanese message by default", () => {
    const msg = getErrorMessage(ErrorCode.TTS_CONNECTION_FAILED, "ja", {
      service: "VOICEVOX",
      host: "http://localhost:50021",
    });
    expect(msg).toContain("VOICEVOXに接続できません");
    expect(msg).toContain("http://localhost:50021");
    expect(msg).toContain("対処法");
  });

  it("returns English message", () => {
    const msg = getErrorMessage(ErrorCode.TTS_CONNECTION_FAILED, "en", {
      service: "VOICEVOX",
      host: "http://localhost:50021",
    });
    expect(msg).toContain("Cannot connect to VOICEVOX");
    expect(msg).toContain("http://localhost:50021");
    expect(msg).toContain("Action Required");
  });

  it("falls back to English for unknown language", () => {
    const msg = getErrorMessage(ErrorCode.LLM_API_KEY_MISSING, "fr", {
      provider: "OpenAI",
    });
    expect(msg).toContain("OpenAI API key not configured");
  });

  it("preserves placeholder when kwarg is missing", () => {
    const msg = getErrorMessage(ErrorCode.TTS_CONNECTION_FAILED, "en", {
      service: "VOICEVOX",
      // host is intentionally missing
    });
    expect(msg).toContain("{host}");
  });

  it("handles all error codes without crashing", () => {
    for (const code of Object.values(ErrorCode)) {
      const msgJa = getErrorMessage(code, "ja");
      const msgEn = getErrorMessage(code, "en");
      expect(typeof msgJa).toBe("string");
      expect(typeof msgEn).toBe("string");
      expect(msgJa.length).toBeGreaterThan(0);
      expect(msgEn.length).toBeGreaterThan(0);
    }
  });

  it("substitutes multiple placeholders", () => {
    const msg = getErrorMessage(ErrorCode.TTS_SYNTHESIS_FAILED, "en", {
      service: "COEIROINK",
      error: "timeout",
    });
    expect(msg).toContain("timeout");
    expect(msg).toContain("COEIROINK");
  });
});

describe("formatErrorWithAction", () => {
  it("formats Japanese error with actions", () => {
    const msg = formatErrorWithAction("音声合成エラー", [
      "テキストを短くしてください",
      "ログを確認してください",
    ], "ja");
    expect(msg).toContain("音声合成エラー");
    expect(msg).toContain("[対処法]");
    expect(msg).toContain("1. テキストを短くしてください");
    expect(msg).toContain("2. ログを確認してください");
  });

  it("formats English error with actions", () => {
    const msg = formatErrorWithAction("Synthesis error", [
      "Shorten the text",
      "Check the logs",
    ], "en");
    expect(msg).toContain("Synthesis error");
    expect(msg).toContain("[Action Required]");
    expect(msg).toContain("1. Shorten the text");
    expect(msg).toContain("2. Check the logs");
  });

  it("handles single action", () => {
    const msg = formatErrorWithAction("Error", ["Retry"], "en");
    expect(msg).toContain("1. Retry");
    expect(msg).not.toContain("2.");
  });
});

describe("NodeExecutionError", () => {
  it("creates error with localized message", () => {
    const error = new NodeExecutionError(ErrorCode.LLM_API_KEY_MISSING, "ja", {
      provider: "OpenAI",
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NodeExecutionError);
    expect(error.name).toBe("NodeExecutionError");
    expect(error.code).toBe(ErrorCode.LLM_API_KEY_MISSING);
    expect(error.lang).toBe("ja");
    expect(error.message).toContain("OpenAI APIキーが設定されていません");
  });

  it("stores format kwargs", () => {
    const error = new NodeExecutionError(ErrorCode.TTS_CONNECTION_FAILED, "en", {
      service: "VOICEVOX",
      host: "localhost:50021",
    });
    expect(error.formatKwargs).toEqual({
      service: "VOICEVOX",
      host: "localhost:50021",
    });
  });
});

describe("NodeConfigError", () => {
  it("extends NodeExecutionError", () => {
    const error = new NodeConfigError(ErrorCode.INVALID_INPUT, "en", {
      field: "speaker_id",
    });
    expect(error).toBeInstanceOf(NodeExecutionError);
    expect(error).toBeInstanceOf(NodeConfigError);
    expect(error.name).toBe("NodeConfigError");
    expect(error.message).toContain("speaker_id");
  });
});

describe("NodeConnectionError", () => {
  it("extends NodeExecutionError", () => {
    const error = new NodeConnectionError(ErrorCode.CONNECTION_TIMEOUT, "ja", {
      service: "VOICEVOX",
      host: "localhost:50021",
    });
    expect(error).toBeInstanceOf(NodeExecutionError);
    expect(error).toBeInstanceOf(NodeConnectionError);
    expect(error.name).toBe("NodeConnectionError");
    expect(error.message).toContain("タイムアウト");
  });
});
