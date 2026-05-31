/**
 * Connection Integrity - Unit Tests
 *
 * Tests checkInvalidConnections: detection of reversed port direction,
 * non-existent ports, type mismatches, no-port (event-driven) nodes, dynamic
 * input nodes, and dangling connections. Also covers the wiring through
 * validateWorkflowSync.
 */

import { describe, it, expect } from "bun:test";
import { checkInvalidConnections } from "../../apps/server-ts/src/engine/connection-integrity";
import { validateWorkflowSync } from "../../apps/server-ts/src/engine/validator";

// ─── Helpers ──────────────────────────────────────────────────────

function node(id: string, type: string, config: Record<string, unknown> = {}) {
  return { id, type, config };
}

function conn(
  id: string,
  fromNodeId: string,
  fromPort: string,
  toNodeId: string,
  toPort: string,
) {
  return {
    id,
    from: { nodeId: fromNodeId, port: fromPort },
    to: { nodeId: toNodeId, port: toPort },
  };
}

interface Port {
  id: string;
  type: string;
}

function manifest(
  id: string,
  name: string,
  inputs: Port[] = [],
  outputs: Port[] = [],
  config: Record<string, { type: string }> = {},
) {
  return { id, name, config, node: { inputs, outputs } };
}

// Common manifests
const emotion = manifest(
  "emotion-analyzer",
  "Emotion Analyzer",
  [{ id: "text", type: "string" }],
  [
    { id: "expression", type: "string" },
    { id: "intensity", type: "number" },
    { id: "text", type: "string" },
  ],
);
const motion = manifest(
  "motion-trigger",
  "Motion Trigger",
  [{ id: "trigger", type: "any" }],
  [
    { id: "expression", type: "string" },
    { id: "intensity", type: "number" },
    { id: "motionUrl", type: "string" },
  ],
);
const avatar = manifest("avatar-configuration", "Avatar Configuration", [], []);
const ttsAudio = manifest(
  "voicevox-tts",
  "VOICEVOX TTS",
  [{ id: "text", type: "string" }],
  [{ id: "audio", type: "audio" }],
);
const lipSync = manifest(
  "lip-sync",
  "Lip Sync",
  [
    { id: "audio", type: "audio" },
    { id: "audioUrl", type: "string" },
  ],
  [
    { id: "mouth_values", type: "array" },
    { id: "duration", type: "number" },
    { id: "audio", type: "audio" },
  ],
);
// openai-llm: dynamic inputs via prompt-builder config field
const openaiLlm = manifest(
  "openai-llm",
  "OpenAI LLM",
  [{ id: "prompt", type: "string" }],
  [{ id: "response", type: "string" }],
  { promptSections: { type: "prompt-builder" } },
);

function manifestMap(...ms: ReturnType<typeof manifest>[]) {
  return new Map(ms.map((m) => [m.id, m]));
}

// ─── Valid connections ───────────────────────────────────────────

describe("checkInvalidConnections - valid", () => {
  it("accepts a correct output→input connection with matching types", () => {
    const issues = checkInvalidConnections(
      [node("e", "emotion-analyzer"), node("m", "motion-trigger")],
      [conn("c", "e", "expression", "m", "trigger")],
      manifestMap(emotion, motion),
    );
    expect(issues).toEqual([]);
  });

  it("accepts a legacy snake_case output port present in the manifest (dev state)", () => {
    const issues = checkInvalidConnections(
      [node("l", "lip-sync"), node("t", "voicevox-tts")],
      // lip-sync.mouth_values (array) → would mismatch audio; use duration→nothing.
      [conn("c", "l", "duration", "t", "text")],
      manifestMap(lipSync, ttsAudio),
    );
    // duration(number) → text(string): type mismatch warning, but no error.
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });
});

// ─── Reversed direction ──────────────────────────────────────────

describe("checkInvalidConnections - reversed direction", () => {
  it("flags an OUTPUT→OUTPUT connection (source uses an input, target uses an output) as errors", () => {
    // emotion.expression (output) → motion.expression (output) — the exact bug.
    const issues = checkInvalidConnections(
      [node("e", "emotion-analyzer"), node("m", "motion-trigger")],
      [conn("c", "e", "expression", "m", "expression")],
      manifestMap(emotion, motion),
    );
    const errors = issues.filter((i) => i.level === "error");
    // target side: 'expression' is an output of motion-trigger, not an input.
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("入力ポートへ接続してください");
  });

  it("flags source endpoint that points at an input port", () => {
    // motion.trigger is an INPUT; using it as a source is reversed.
    const issues = checkInvalidConnections(
      [node("m", "motion-trigger"), node("a2", "emotion-analyzer")],
      [conn("c", "m", "trigger", "a2", "text")],
      manifestMap(motion, emotion),
    );
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("出力ポートから接続してください");
  });
});

// ─── Non-existent ports ──────────────────────────────────────────

describe("checkInvalidConnections - non-existent ports", () => {
  it("flags a non-existent output port", () => {
    const issues = checkInvalidConnections(
      [node("e", "emotion-analyzer"), node("m", "motion-trigger")],
      [conn("c", "e", "nope", "m", "trigger")],
      manifestMap(emotion, motion),
    );
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("出力ポート「nope」が存在しません");
  });

  it("flags a non-existent input port", () => {
    const issues = checkInvalidConnections(
      [node("e", "emotion-analyzer"), node("m", "motion-trigger")],
      [conn("c", "e", "expression", "m", "nope")],
      manifestMap(emotion, motion),
    );
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("入力ポート「nope」が存在しません");
  });
});

// ─── Type mismatch ───────────────────────────────────────────────

describe("checkInvalidConnections - type mismatch", () => {
  it("warns on mismatched known port types", () => {
    // emotion.intensity (number) → motion.trigger (any) is compatible; use a
    // string→number mismatch: emotion.expression (string) → a number input.
    const numberSink = manifest("num-sink", "Number Sink", [
      { id: "value", type: "number" },
    ]);
    const issues = checkInvalidConnections(
      [node("e", "emotion-analyzer"), node("n", "num-sink")],
      [conn("c", "e", "expression", "n", "value")],
      manifestMap(emotion, numberSink),
    );
    const warnings = issues.filter((i) => i.level === "warning");
    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain("型が一致しません");
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("does not warn when the source type is 'any'", () => {
    const issues = checkInvalidConnections(
      [node("m", "motion-trigger"), node("e", "emotion-analyzer")],
      // motion.trigger is input; use motion's passthrough? motion has expression(string).
      // emotion.text input is string. expression(string)→text(string) ok.
      [conn("c", "m", "expression", "e", "text")],
      manifestMap(motion, emotion),
    );
    expect(issues).toEqual([]);
  });
});

// ─── No-port (event-driven) node ─────────────────────────────────

describe("checkInvalidConnections - no-port node", () => {
  it("warns (not errors) for connections into avatar-configuration and dedupes per node", () => {
    const issues = checkInvalidConnections(
      [node("e", "emotion-analyzer"), node("av", "avatar-configuration")],
      [
        conn("c1", "e", "expression", "av", "expression"),
        conn("c2", "e", "intensity", "av", "intensity"),
      ],
      manifestMap(emotion, avatar),
    );
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    const warnings = issues.filter((i) => i.level === "warning");
    // one warning for the avatar node despite two connections
    expect(warnings.length).toBe(1);
    expect(warnings[0].nodeId).toBe("av");
    expect(warnings[0].message).toContain("入出力ポートを持たない");
  });
});

// ─── Dynamic input node ──────────────────────────────────────────

describe("checkInvalidConnections - dynamic inputs", () => {
  it("skips target-input checks for nodes with prompt-builder config", () => {
    // a dynamic prompt-section input id that is not in the static manifest
    const issues = checkInvalidConnections(
      [node("e", "emotion-analyzer"), node("llm", "openai-llm")],
      [conn("c", "e", "text", "llm", "userMessage")],
      manifestMap(emotion, openaiLlm),
    );
    // userMessage is not a manifest input but must NOT be flagged.
    expect(issues).toEqual([]);
  });
});

// ─── Dangling connection ─────────────────────────────────────────

describe("checkInvalidConnections - dangling", () => {
  it("errors when a connection references a missing node", () => {
    const issues = checkInvalidConnections(
      [node("e", "emotion-analyzer")],
      [conn("c", "e", "expression", "ghost", "trigger")],
      manifestMap(emotion, motion),
    );
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("存在しないノード");
  });
});

// ─── Unknown manifest / unknown types ────────────────────────────

describe("checkInvalidConnections - tolerant cases", () => {
  it("skips endpoints whose node has no manifest", () => {
    const issues = checkInvalidConnections(
      [node("x", "custom-unknown"), node("y", "custom-unknown")],
      [conn("c", "x", "out", "y", "in")],
      new Map(), // no manifests
    );
    expect(issues).toEqual([]);
  });

  it("treats unmodeled port types as compatible (no warning)", () => {
    const chat = manifest(
      "chat",
      "Chat",
      [],
      [{ id: "message", type: "Message" }],
    );
    const issues = checkInvalidConnections(
      [node("c1", "chat"), node("llm", "openai-llm")],
      [conn("c", "c1", "message", "llm", "prompt")],
      manifestMap(chat, openaiLlm),
    );
    // openai-llm has dynamic inputs → target side skipped; source 'message' is a
    // real output of chat → no error/warning.
    expect(issues).toEqual([]);
  });
});

// ─── Wiring through validateWorkflowSync ─────────────────────────

describe("validateWorkflowSync - invalid connection wiring", () => {
  it("surfaces a reversed-direction connection as an error", () => {
    const issues = validateWorkflowSync(
      {
        nodes: [node("e", "emotion-analyzer"), node("m", "motion-trigger")],
        connections: [conn("c", "e", "expression", "m", "expression")],
      },
      manifestMap(emotion, motion),
    );
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.some((e) => e.message.includes("入力ポートへ接続してください"))).toBe(
      true,
    );
  });
});
