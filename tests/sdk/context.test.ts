/**
 * Tests for createEvent and NodeContext in @aituber-flow/sdk
 */

import { describe, it, expect, mock } from "bun:test";
import { createEvent, NodeContext } from "../../packages/sdk-ts/src/context";
import type { Event } from "../../packages/sdk-ts/src/context";

// ─── createEvent ───────────────────────────────────────────────

describe("createEvent", () => {
  it("creates event with type and payload", () => {
    const event = createEvent("audio.play", { filename: "test.wav" });

    expect(event.type).toBe("audio.play");
    expect(event.payload).toEqual({ filename: "test.wav" });
    expect(event.timestamp).toBeDefined();
    expect(event.sourceNodeId).toBeUndefined();
  });

  it("creates event with sourceNodeId", () => {
    const event = createEvent("avatar.expression", { expression: "happy" }, "node-42");

    expect(event.type).toBe("avatar.expression");
    expect(event.sourceNodeId).toBe("node-42");
  });

  it("generates ISO timestamp", () => {
    const before = new Date().toISOString();
    const event = createEvent("test", {});
    const after = new Date().toISOString();

    expect(event.timestamp >= before).toBe(true);
    expect(event.timestamp <= after).toBe(true);
  });

  it("creates event with empty payload", () => {
    const event = createEvent("heartbeat", {});

    expect(event.type).toBe("heartbeat");
    expect(event.payload).toEqual({});
  });
});

// ─── NodeContext ────────────────────────────────────────────────

describe("NodeContext", () => {
  it("exposes workflowId and nodeId", () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
    });

    expect(ctx.workflowId).toBe("wf-1");
    expect(ctx.nodeId).toBe("n-1");
  });

  it("log calls logCallback", async () => {
    const logs: Array<{ message: string; level: string }> = [];
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
      logCallback: async (message, level) => {
        logs.push({ message, level });
      },
    });

    await ctx.log("hello");
    await ctx.log("error occurred", "error");

    expect(logs).toEqual([
      { message: "hello", level: "info" },
      { message: "error occurred", level: "error" },
    ]);
  });

  it("log does nothing without callback", async () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
    });

    // Should not throw
    await ctx.log("message");
  });

  it("emitEvent calls emitCallback with sourceNodeId stamped", async () => {
    const emitted: Event[] = [];
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
      emitCallback: async (event) => {
        emitted.push(event);
      },
    });

    await ctx.emitEvent(createEvent("test.event", { key: "value" }));

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe("test.event");
    expect(emitted[0].sourceNodeId).toBe("n-1");
    expect(emitted[0].payload.key).toBe("value");
  });

  it("emitEvent does nothing without callback", async () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
    });

    // Should not throw
    await ctx.emitEvent(createEvent("test", {}));
  });

  it("emitEvent handles plain object input", async () => {
    const emitted: Event[] = [];
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "emit-node",
      character: {},
      emitCallback: async (event) => {
        emitted.push(event);
      },
    });

    // Plain object without full Event shape (missing timestamp/payload)
    await ctx.emitEvent({ type: "custom.event", data: "hello" } as any);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe("custom.event");
    expect(emitted[0].sourceNodeId).toBe("emit-node");
  });

  it("getCharacterName returns name", () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: { name: "Sakura" },
    });

    expect(ctx.getCharacterName()).toBe("Sakura");
  });

  it("getCharacterName returns default when not set", () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
    });

    expect(ctx.getCharacterName()).toBe("AI Assistant");
  });

  it("getCharacterPersonality returns personality", () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: { personality: "cheerful" },
    });

    expect(ctx.getCharacterPersonality()).toBe("cheerful");
  });

  it("getCharacterPersonality returns empty string default", () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
    });

    expect(ctx.getCharacterPersonality()).toBe("");
  });

  it("getEmotion returns emotion from character", () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: { emotion: { current: "happy", intensity: 0.9 } },
    });

    expect(ctx.getEmotion()).toEqual({ current: "happy", intensity: 0.9 });
  });

  it("getEmotion returns default when not set", () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
    });

    expect(ctx.getEmotion()).toEqual({ current: "neutral", intensity: 0.5 });
  });

  it("updateCharacter updates local character and calls callback", async () => {
    const updates: Record<string, any>[] = [];
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: { name: "Bot", mood: "neutral" },
      updateCharacterCallback: async (u) => {
        updates.push(u);
      },
    });

    await ctx.updateCharacter({ mood: "happy", topic: "cooking" });

    expect(ctx.character.mood).toBe("happy");
    expect(ctx.character.topic).toBe("cooking");
    expect(ctx.character.name).toBe("Bot"); // unchanged
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ mood: "happy", topic: "cooking" });
  });

  it("updateCharacter refuses __proto__/constructor keys (prototype pollution guard)", async () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: { name: "Bot" },
    });

    const malicious = JSON.parse('{"__proto__": {"polluted": true}, "mood": "ok"}');
    await ctx.updateCharacter(malicious);

    expect(ctx.character.mood).toBe("ok");
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    await ctx.updateCharacter({ constructor: { malicious: true } } as Record<string, any>);
    // Object prototype should not be overwritten
    expect(({}).constructor).toBe(Object);
  });

  it("createTask returns AbortController and cleans up", async () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
    });

    let taskRan = false;
    const controller = ctx.createTask(async (_signal) => {
      taskRan = true;
    });

    expect(controller).toBeInstanceOf(AbortController);

    // Wait for task to complete
    await new Promise((r) => setTimeout(r, 50));
    expect(taskRan).toBe(true);
  });

  it("cancelBackgroundTasks aborts running tasks", async () => {
    const ctx = new NodeContext({
      workflowId: "wf-1",
      nodeId: "n-1",
      character: {},
    });

    let aborted = false;
    ctx.createTask(async (signal) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          aborted = true;
          reject(new Error("aborted"));
        });
      });
    });

    await ctx.cancelBackgroundTasks();
    // Give the abort handler time to fire
    await new Promise((r) => setTimeout(r, 50));
    expect(aborted).toBe(true);
  });
});
