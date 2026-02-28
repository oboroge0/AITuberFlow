/**
 * Workflow Validator - Unit Tests
 *
 * Tests the validateWorkflowSync function which performs
 * pre-execution validation checks on workflow data.
 */

import { describe, it, expect } from "bun:test";
import { validateWorkflowSync } from "../../apps/server-ts/src/engine/validator";
import type { ValidationIssue } from "../../apps/server-ts/src/engine/validator";

// ─── Helpers ──────────────────────────────────────────────────────

function makeNode(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
) {
  return { id, type, config };
}

function makeConnection(
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

function makeManifest(
  id: string,
  name: string,
  config: Record<string, any> = {},
  inputs: Array<{ id: string; type: string }> = [],
) {
  return {
    id,
    name,
    config,
    node: { inputs, outputs: [] },
  };
}

// ─── Empty Workflow ──────────────────────────────────────────────

describe("validateWorkflowSync - empty workflow", () => {
  it("returns no issues for empty workflow", () => {
    const issues = validateWorkflowSync(
      { nodes: [], connections: [] },
      new Map(),
    );
    expect(issues).toEqual([]);
  });
});

// ─── Required Config Fields ─────────────────────────────────────

describe("validateWorkflowSync - required config fields", () => {
  it("reports error when required field is missing", () => {
    const manifests = new Map([
      [
        "youtube-chat",
        makeManifest("youtube-chat", "YouTube Chat", {
          videoId: { type: "string", label: "Video ID", required: true },
          apiKey: { type: "string", label: "API Key", required: true },
        }),
      ],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "youtube-chat", {})],
        connections: [],
      },
      manifests,
    );

    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(2);
    expect(errors[0].nodeId).toBe("n1");
    expect(errors[0].message).toContain("Video ID");
    expect(errors[1].message).toContain("API Key");
  });

  it("does not report error when required field is set", () => {
    const manifests = new Map([
      [
        "youtube-chat",
        makeManifest("youtube-chat", "YouTube Chat", {
          videoId: { type: "string", label: "Video ID", required: true },
        }),
      ],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "youtube-chat", { videoId: "abc123" })],
        connections: [],
      },
      manifests,
    );

    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(0);
  });

  it("reports error when required field is empty string", () => {
    const manifests = new Map([
      [
        "youtube-chat",
        makeManifest("youtube-chat", "YouTube Chat", {
          videoId: { type: "string", label: "Video ID", required: true },
        }),
      ],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "youtube-chat", { videoId: "" })],
        connections: [],
      },
      manifests,
    );

    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(1);
  });

  it("ignores non-required fields", () => {
    const manifests = new Map([
      [
        "openai-llm",
        makeManifest("openai-llm", "OpenAI LLM", {
          temperature: { type: "number", label: "Temperature", required: false },
          systemPrompt: { type: "textarea", label: "System Prompt" },
        }),
      ],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "openai-llm", {})],
        connections: [],
      },
      manifests,
    );

    const errors = issues.filter((i) => i.level === "error");
    expect(errors.length).toBe(0);
  });
});

// ─── Unconnected Input Ports ─────────────────────────────────────

describe("validateWorkflowSync - unconnected input ports", () => {
  it("reports warning for unconnected input port", () => {
    const manifests = new Map([
      [
        "openai-llm",
        makeManifest(
          "openai-llm",
          "OpenAI LLM",
          {},
          [{ id: "prompt", type: "string" }],
        ),
      ],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "openai-llm")],
        connections: [],
      },
      manifests,
    );

    const warnings = issues.filter((i) => i.level === "warning");
    expect(warnings.some((w) => w.message.includes("prompt"))).toBe(true);
  });

  it("does not report warning for connected input port", () => {
    const manifests = new Map([
      [
        "openai-llm",
        makeManifest(
          "openai-llm",
          "OpenAI LLM",
          {},
          [{ id: "prompt", type: "string" }],
        ),
      ],
      ["start", makeManifest("start", "Start")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "start"), makeNode("n2", "openai-llm")],
        connections: [makeConnection("c1", "n1", "trigger", "n2", "prompt")],
      },
      manifests,
    );

    const warnings = issues.filter(
      (i) => i.level === "warning" && i.message.includes("prompt"),
    );
    expect(warnings.length).toBe(0);
  });

  it("skips source nodes for unconnected input check", () => {
    const manifests = new Map([
      [
        "youtube-chat",
        makeManifest(
          "youtube-chat",
          "YouTube Chat",
          {},
          [], // source nodes have no inputs
        ),
      ],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "youtube-chat")],
        connections: [],
      },
      manifests,
    );

    const inputWarnings = issues.filter(
      (i) => i.level === "warning" && i.message.includes("入力ポート"),
    );
    expect(inputWarnings.length).toBe(0);
  });
});

// ─── Unreachable Nodes ──────────────────────────────────────────

describe("validateWorkflowSync - unreachable nodes", () => {
  it("reports warning for unreachable node", () => {
    const manifests = new Map([
      ["start", makeManifest("start", "Start")],
      ["openai-llm", makeManifest("openai-llm", "OpenAI LLM")],
      ["console-output", makeManifest("console-output", "Console Output")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [
          makeNode("n1", "start"),
          makeNode("n2", "openai-llm"),
          makeNode("n3", "console-output"), // Unreachable - no connections to it
        ],
        connections: [makeConnection("c1", "n1", "trigger", "n2", "prompt")],
      },
      manifests,
    );

    const unreachable = issues.filter(
      (i) => i.message.includes("到達できません"),
    );
    expect(unreachable.length).toBe(1);
    expect(unreachable[0].nodeId).toBe("n3");
  });

  it("does not report warning when all nodes are reachable", () => {
    const manifests = new Map([
      ["start", makeManifest("start", "Start")],
      ["openai-llm", makeManifest("openai-llm", "OpenAI LLM")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "start"), makeNode("n2", "openai-llm")],
        connections: [makeConnection("c1", "n1", "trigger", "n2", "prompt")],
      },
      manifests,
    );

    const unreachable = issues.filter(
      (i) => i.message.includes("到達できません"),
    );
    expect(unreachable.length).toBe(0);
  });

  it("uses source nodes as entry points", () => {
    const manifests = new Map([
      ["youtube-chat", makeManifest("youtube-chat", "YouTube Chat")],
      ["openai-llm", makeManifest("openai-llm", "OpenAI LLM")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [
          makeNode("n1", "youtube-chat"),
          makeNode("n2", "openai-llm"),
        ],
        connections: [makeConnection("c1", "n1", "text", "n2", "prompt")],
      },
      manifests,
    );

    const unreachable = issues.filter(
      (i) => i.message.includes("到達できません"),
    );
    expect(unreachable.length).toBe(0);
  });
});

// ─── Circular References ─────────────────────────────────────────

describe("validateWorkflowSync - circular references", () => {
  it("detects simple cycle", () => {
    const manifests = new Map([
      ["process", makeManifest("process", "Process")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [
          makeNode("n1", "process"),
          makeNode("n2", "process"),
        ],
        connections: [
          makeConnection("c1", "n1", "output", "n2", "input"),
          makeConnection("c2", "n2", "output", "n1", "input"),
        ],
      },
      manifests,
    );

    const cycleErrors = issues.filter(
      (i) => i.level === "error" && i.message.includes("循環参照"),
    );
    expect(cycleErrors.length).toBe(1);
  });

  it("detects self-loop", () => {
    const manifests = new Map([
      ["process", makeManifest("process", "Process")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "process")],
        connections: [
          makeConnection("c1", "n1", "output", "n1", "input"),
        ],
      },
      manifests,
    );

    const cycleErrors = issues.filter(
      (i) => i.level === "error" && i.message.includes("循環参照"),
    );
    expect(cycleErrors.length).toBe(1);
  });

  it("does not report cycle for DAG", () => {
    const manifests = new Map([
      ["start", makeManifest("start", "Start")],
      ["process", makeManifest("process", "Process")],
      ["end", makeManifest("end", "End")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [
          makeNode("n1", "start"),
          makeNode("n2", "process"),
          makeNode("n3", "end"),
        ],
        connections: [
          makeConnection("c1", "n1", "trigger", "n2", "input"),
          makeConnection("c2", "n2", "output", "n3", "input"),
        ],
      },
      manifests,
    );

    const cycleErrors = issues.filter(
      (i) => i.level === "error" && i.message.includes("循環参照"),
    );
    expect(cycleErrors.length).toBe(0);
  });

  it("detects cycle in larger graph", () => {
    const manifests = new Map([
      ["process", makeManifest("process", "Process")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [
          makeNode("n1", "process"),
          makeNode("n2", "process"),
          makeNode("n3", "process"),
        ],
        connections: [
          makeConnection("c1", "n1", "out", "n2", "in"),
          makeConnection("c2", "n2", "out", "n3", "in"),
          makeConnection("c3", "n3", "out", "n1", "in"),
        ],
      },
      manifests,
    );

    const cycleErrors = issues.filter(
      (i) => i.level === "error" && i.message.includes("循環参照"),
    );
    expect(cycleErrors.length).toBe(1);
  });
});

// ─── API Key Check ───────────────────────────────────────────────

describe("validateWorkflowSync - API key check", () => {
  it("reports warning when API key is missing on LLM node", () => {
    const manifests = new Map([
      ["openai-llm", makeManifest("openai-llm", "OpenAI LLM")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "openai-llm", {})],
        connections: [],
      },
      manifests,
      {}, // empty global settings
    );

    const apiKeyWarnings = issues.filter(
      (i) => i.level === "warning" && i.message.includes("APIキー"),
    );
    expect(apiKeyWarnings.length).toBe(1);
  });

  it("does not report warning when API key is set on node", () => {
    const manifests = new Map([
      ["openai-llm", makeManifest("openai-llm", "OpenAI LLM")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "openai-llm", { apiKey: "sk-test123" })],
        connections: [],
      },
      manifests,
      {},
    );

    const apiKeyWarnings = issues.filter(
      (i) => i.level === "warning" && i.message.includes("APIキー"),
    );
    expect(apiKeyWarnings.length).toBe(0);
  });

  it("does not report warning when API key is set in global settings", () => {
    const manifests = new Map([
      ["openai-llm", makeManifest("openai-llm", "OpenAI LLM")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "openai-llm", {})],
        connections: [],
      },
      manifests,
      { "openai.apiKey": "sk-global-key" },
    );

    const apiKeyWarnings = issues.filter(
      (i) => i.level === "warning" && i.message.includes("APIキー"),
    );
    expect(apiKeyWarnings.length).toBe(0);
  });

  it("checks all LLM node types", () => {
    const manifests = new Map([
      ["openai-llm", makeManifest("openai-llm", "OpenAI LLM")],
      ["anthropic-llm", makeManifest("anthropic-llm", "Claude")],
      ["google-llm", makeManifest("google-llm", "Gemini")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [
          makeNode("n1", "openai-llm", {}),
          makeNode("n2", "anthropic-llm", {}),
          makeNode("n3", "google-llm", {}),
        ],
        connections: [],
      },
      manifests,
      {},
    );

    const apiKeyWarnings = issues.filter(
      (i) => i.level === "warning" && i.message.includes("APIキー"),
    );
    expect(apiKeyWarnings.length).toBe(3);
  });

  it("does not check API key for ollama (local-only)", () => {
    const manifests = new Map([
      ["ollama-llm", makeManifest("ollama-llm", "Ollama")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [makeNode("n1", "ollama-llm", {})],
        connections: [],
      },
      manifests,
      {},
    );

    const apiKeyWarnings = issues.filter(
      (i) => i.level === "warning" && i.message.includes("APIキー"),
    );
    expect(apiKeyWarnings.length).toBe(0);
  });
});

// ─── Combined Validation ─────────────────────────────────────────

describe("validateWorkflowSync - combined checks", () => {
  it("returns multiple issues from different checks", () => {
    const manifests = new Map([
      [
        "youtube-chat",
        makeManifest("youtube-chat", "YouTube Chat", {
          videoId: { type: "string", label: "Video ID", required: true },
          apiKey: { type: "string", label: "API Key", required: true },
        }),
      ],
      [
        "openai-llm",
        makeManifest(
          "openai-llm",
          "OpenAI LLM",
          {},
          [{ id: "prompt", type: "string" }],
        ),
      ],
      ["console-output", makeManifest("console-output", "Console Output")],
    ]);

    const issues = validateWorkflowSync(
      {
        nodes: [
          makeNode("n1", "youtube-chat", {}),
          makeNode("n2", "openai-llm", {}),
          makeNode("n3", "console-output"),
        ],
        connections: [makeConnection("c1", "n1", "text", "n2", "prompt")],
      },
      manifests,
      {},
    );

    // Should have:
    // - 2 required field errors (videoId, apiKey on youtube-chat)
    // - 1 unreachable node warning (console-output)
    // - 1 API key warning (openai-llm)
    const errors = issues.filter((i) => i.level === "error");
    const warnings = issues.filter((i) => i.level === "warning");

    expect(errors.length).toBe(2);
    expect(warnings.length).toBeGreaterThanOrEqual(2); // unreachable + API key
  });
});
