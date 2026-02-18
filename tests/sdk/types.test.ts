/**
 * Tests for Zod schemas in @aituber-flow/sdk
 */

import { describe, it, expect } from "bun:test";
import {
  PortDefinitionSchema,
  ConfigFieldSchema,
  PluginAuthorSchema,
  PluginNodeDefinitionSchema,
  PluginManifestSchema,
  MessageSchema,
  EmotionSchema,
  MemorySchema,
  CharacterStateSchema,
  StreamMessageSchema,
  StreamContextSchema,
} from "../../packages/sdk-ts/src/types";

describe("PortDefinitionSchema", () => {
  it("validates a valid port definition", () => {
    const result = PortDefinitionSchema.parse({
      id: "text",
      type: "string",
      description: "Text input",
    });
    expect(result.id).toBe("text");
    expect(result.type).toBe("string");
    expect(result.description).toBe("Text input");
  });

  it("allows optional description", () => {
    const result = PortDefinitionSchema.parse({ id: "out", type: "any" });
    expect(result.description).toBeUndefined();
  });

  it("rejects missing id", () => {
    expect(() => PortDefinitionSchema.parse({ type: "string" })).toThrow();
  });
});

describe("ConfigFieldSchema", () => {
  it("validates a string config field", () => {
    const result = ConfigFieldSchema.parse({
      type: "string",
      label: "API Key",
      required: true,
    });
    expect(result.type).toBe("string");
    expect(result.label).toBe("API Key");
    expect(result.required).toBe(true);
  });

  it("validates a select config field with options", () => {
    const result = ConfigFieldSchema.parse({
      type: "select",
      label: "Model",
      options: [{ label: "GPT-4", value: "gpt-4" }],
    });
    expect(result.type).toBe("select");
    expect(result.options).toHaveLength(1);
  });

  it("validates a number config field with min/max", () => {
    const result = ConfigFieldSchema.parse({
      type: "number",
      label: "Temperature",
      min: 0,
      max: 2,
      default: 1.0,
    });
    expect(result.min).toBe(0);
    expect(result.max).toBe(2);
  });

  it("defaults required to false", () => {
    const result = ConfigFieldSchema.parse({
      type: "boolean",
      label: "Enable",
    });
    expect(result.required).toBe(false);
  });

  it("rejects invalid type", () => {
    expect(() =>
      ConfigFieldSchema.parse({
        type: "invalid",
        label: "Bad",
      }),
    ).toThrow();
  });
});

describe("PluginAuthorSchema", () => {
  it("validates author with url", () => {
    const result = PluginAuthorSchema.parse({
      name: "Developer",
      url: "https://example.com",
    });
    expect(result.name).toBe("Developer");
    expect(result.url).toBe("https://example.com");
  });

  it("allows optional url", () => {
    const result = PluginAuthorSchema.parse({ name: "Developer" });
    expect(result.url).toBeUndefined();
  });
});

describe("PluginManifestSchema", () => {
  const validManifest = {
    id: "my-node",
    name: "My Node",
    version: "1.0.0",
    description: "A test node",
    author: { name: "Test" },
    category: "process",
    node: {
      inputs: [{ id: "text", type: "string" }],
      outputs: [{ id: "result", type: "string" }],
    },
  };

  it("validates a complete manifest", () => {
    const result = PluginManifestSchema.parse(validManifest);
    expect(result.id).toBe("my-node");
    expect(result.license).toBe("MIT"); // default
    expect(result.node.inputs).toHaveLength(1);
    expect(result.node.outputs).toHaveLength(1);
  });

  it("rejects invalid category", () => {
    expect(() =>
      PluginManifestSchema.parse({
        ...validManifest,
        category: "invalid",
      }),
    ).toThrow();
  });

  it("defaults config to empty object", () => {
    const result = PluginManifestSchema.parse(validManifest);
    expect(result.config).toEqual({});
  });

  it("defaults node inputs/outputs to empty arrays", () => {
    const result = PluginManifestSchema.parse({
      ...validManifest,
      node: {},
    });
    expect(result.node.inputs).toEqual([]);
    expect(result.node.outputs).toEqual([]);
  });
});

describe("MessageSchema", () => {
  it("validates a user message", () => {
    const result = MessageSchema.parse({
      role: "user",
      content: "Hello!",
      author: "viewer1",
    });
    expect(result.role).toBe("user");
    expect(result.content).toBe("Hello!");
    expect(result.author).toBe("viewer1");
    expect(result.timestamp).toBeDefined();
  });

  it("validates an assistant message", () => {
    const result = MessageSchema.parse({
      role: "assistant",
      content: "Hi there!",
    });
    expect(result.role).toBe("assistant");
    expect(result.author).toBeUndefined();
  });

  it("rejects invalid role", () => {
    expect(() =>
      MessageSchema.parse({ role: "system", content: "test" }),
    ).toThrow();
  });
});

describe("EmotionSchema", () => {
  it("validates emotion with defaults", () => {
    const result = EmotionSchema.parse({});
    expect(result.current).toBe("neutral");
    expect(result.intensity).toBe(0.5);
  });

  it("validates custom emotion", () => {
    const result = EmotionSchema.parse({
      current: "happy",
      intensity: 0.9,
    });
    expect(result.current).toBe("happy");
    expect(result.intensity).toBe(0.9);
  });
});

describe("CharacterStateSchema", () => {
  it("validates with all defaults", () => {
    const result = CharacterStateSchema.parse({});
    expect(result.name).toBe("AI Assistant");
    expect(result.personality).toBe("Friendly and helpful");
    expect(result.emotion.current).toBe("neutral");
    expect(result.shortTermMemory).toEqual([]);
    expect(result.longTermMemory).toEqual([]);
  });

  it("validates custom character state", () => {
    const result = CharacterStateSchema.parse({
      name: "Sakura",
      personality: "Cheerful",
      currentTopic: "cooking",
    });
    expect(result.name).toBe("Sakura");
    expect(result.currentTopic).toBe("cooking");
  });
});

describe("StreamMessageSchema", () => {
  it("validates a basic stream message", () => {
    const result = StreamMessageSchema.parse({
      id: "msg-1",
      content: "Hello stream!",
      author: "viewer1",
    });
    expect(result.id).toBe("msg-1");
    expect(result.isMember).toBe(false); // default
    expect(result.timestamp).toBeDefined();
  });

  it("validates a superchat message", () => {
    const result = StreamMessageSchema.parse({
      id: "msg-2",
      content: "Great stream!",
      author: "donor1",
      superchatAmount: 500,
      superchatCurrency: "JPY",
      isMember: true,
    });
    expect(result.superchatAmount).toBe(500);
    expect(result.superchatCurrency).toBe("JPY");
    expect(result.isMember).toBe(true);
  });
});

describe("StreamContextSchema", () => {
  it("validates with defaults", () => {
    const result = StreamContextSchema.parse({});
    expect(result.viewerCount).toBe(0);
    expect(result.likeCount).toBe(0);
    expect(result.messageQueue).toEqual([]);
    expect(result.superchatQueue).toEqual([]);
    expect(result.silenceDuration).toBe(0);
  });

  it("validates full stream context", () => {
    const result = StreamContextSchema.parse({
      platform: "youtube",
      videoId: "abc123",
      viewerCount: 150,
      likeCount: 42,
    });
    expect(result.platform).toBe("youtube");
    expect(result.videoId).toBe("abc123");
    expect(result.viewerCount).toBe(150);
  });
});
