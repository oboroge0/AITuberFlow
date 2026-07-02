import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  WorkflowExecutor,
  NodeContext,
  WorkflowCycleError,
} from "../../apps/server-ts/src/engine/executor";
import { EventBus, EventFilter } from "../../apps/server-ts/src/engine/event-bus";
import { EventQueue } from "../../apps/server-ts/src/engine/event-queue";
import { getPluginsDir } from "../../apps/server-ts/src/engine/plugin-loader";
import type { Event } from "@aituber-flow/sdk";

// ─── Helpers ──────────────────────────────────────────────────────

function makeEvent(
  type: string,
  payload: Record<string, any> = {},
): Event {
  return { type, payload, timestamp: new Date().toISOString() };
}

function makeNode(
  id: string,
  type = "process",
  config: Record<string, any> = {},
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

// ─── TestWorkflowExecutorInit ─────────────────────────────────────

describe("TestWorkflowExecutorInit", () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  it("test_init_creates_empty_maps", () => {
    const e = executor as any;
    expect(e.runningWorkflows).toBeInstanceOf(Map);
    expect(e.runningWorkflows.size).toBe(0);
    expect(e.eventBuses).toBeInstanceOf(Map);
    expect(e.eventBuses.size).toBe(0);
    expect(e.logCallbacks).toBeInstanceOf(Map);
    expect(e.logCallbacks.size).toBe(0);
    expect(e.eventCallbacks).toBeInstanceOf(Map);
    expect(e.eventCallbacks.size).toBe(0);
    expect(e.statusCallbacks).toBeInstanceOf(Map);
    expect(e.statusCallbacks.size).toBe(0);
    expect(e.nodeInstances).toBeInstanceOf(Map);
    expect(e.nodeInstances.size).toBe(0);
    expect(e.eventQueues).toBeInstanceOf(Map);
    expect(e.eventQueues.size).toBe(0);
    expect(e.sourceNodes).toBeInstanceOf(Map);
    expect(e.sourceNodes.size).toBe(0);
    expect(e.queueProcessors).toBeInstanceOf(Map);
    expect(e.queueProcessors.size).toBe(0);
    expect(e.taskRegistries).toBeInstanceOf(Map);
    expect(e.taskRegistries.size).toBe(0);
  });

  it("test_set_log_callback", () => {
    const cb = mock(async () => {});
    executor.setLogCallback("wf1", cb);
    expect((executor as any).logCallbacks.get("wf1")).toBe(cb);
  });

  it("test_set_event_callback", () => {
    const cb = mock(async () => {});
    executor.setEventCallback("wf1", cb);
    expect((executor as any).eventCallbacks.get("wf1")).toBe(cb);
  });

  it("test_set_status_callback", () => {
    const cb = mock(async () => {});
    executor.setStatusCallback("wf1", cb);
    expect((executor as any).statusCallbacks.get("wf1")).toBe(cb);
  });
});

// ─── TestEventQueue ───────────────────────────────────────────────

describe("TestEventQueue", () => {
  it("test_put_and_get", async () => {
    const queue = new EventQueue(10);
    const event = makeEvent("test.event", { data: "hello" });

    const added = queue.put(event);
    expect(added).toBe(true);
    expect(queue.qsize).toBe(1);

    const result = await queue.get();
    expect(result).toEqual(event);
    expect(queue.qsize).toBe(0);
  });

  it("test_queue_respects_max_size", () => {
    const queue = new EventQueue(2);

    const e1 = makeEvent("e1");
    const e2 = makeEvent("e2");
    const e3 = makeEvent("e3");

    expect(queue.put(e1)).toBe(true);
    expect(queue.put(e2)).toBe(true);
    expect(queue.put(e3)).toBe(false);
    expect(queue.droppedCount).toBe(1);
    expect(queue.qsize).toBe(2);
  });

  it("test_is_processing", () => {
    const queue = new EventQueue(10);

    expect(queue.isProcessing).toBe(false);

    queue.processing = true;
    expect(queue.isProcessing).toBe(true);

    queue.processing = false;
    expect(queue.isProcessing).toBe(false);
  });

  it("test_qsize", () => {
    const queue = new EventQueue(10);

    expect(queue.qsize).toBe(0);

    queue.put(makeEvent("a"));
    queue.put(makeEvent("b"));
    expect(queue.qsize).toBe(2);

    queue.put(makeEvent("c"));
    expect(queue.qsize).toBe(3);
  });
});

// ─── TestGraphTraversal ───────────────────────────────────────────

describe("TestGraphTraversal", () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  it("test_build_adjacency_simple", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "b", "out", "c", "in"),
    ];

    const adjacency: Map<string, string[]> = (executor as any).buildAdjacency(
      nodes,
      connections,
    );

    expect(adjacency).toBeInstanceOf(Map);
    expect(adjacency.get("a")).toEqual(["b"]);
    expect(adjacency.get("b")).toEqual(["c"]);
    expect(adjacency.get("c")).toEqual([]);
  });

  it("test_build_adjacency_branching", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "a", "out2", "c", "in"),
    ];

    const adjacency: Map<string, string[]> = (executor as any).buildAdjacency(
      nodes,
      connections,
    );

    expect(adjacency.get("a")).toEqual(["b", "c"]);
    expect(adjacency.get("b")).toEqual([]);
    expect(adjacency.get("c")).toEqual([]);
  });

  it("test_build_adjacency_no_duplicates", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const connections = [
      makeConnection("c1", "a", "out1", "b", "in1"),
      makeConnection("c2", "a", "out2", "b", "in2"),
    ];

    const adjacency: Map<string, string[]> = (executor as any).buildAdjacency(
      nodes,
      connections,
    );

    expect(adjacency.get("a")).toEqual(["b"]);
  });

  it("test_get_downstream_nodes", () => {
    const nodes = [
      makeNode("a"),
      makeNode("b"),
      makeNode("c"),
      makeNode("d"),
    ];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "a", "out2", "c", "in"),
      makeConnection("c3", "b", "out", "d", "in"),
      makeConnection("c4", "c", "out", "d", "in2"),
    ];

    const adjacency: Map<string, string[]> = (executor as any).buildAdjacency(
      nodes,
      connections,
    );
    const downstream: string[] = (executor as any).getDownstreamNodes(
      "a",
      adjacency,
    );

    expect(new Set(downstream)).toEqual(new Set(["b", "c", "d"]));
  });

  it("test_get_downstream_nodes_handles_cycles", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "b", "out", "c", "in"),
      makeConnection("c3", "c", "out", "b", "in2"),
    ];

    const adjacency: Map<string, string[]> = (executor as any).buildAdjacency(
      nodes,
      connections,
    );
    const downstream: string[] = (executor as any).getDownstreamNodes(
      "a",
      adjacency,
    );

    expect(new Set(downstream)).toEqual(new Set(["b", "c"]));
    expect(downstream.length).toBe(2);
  });
});

// ─── TestExecutionOrder ───────────────────────────────────────────

describe("TestExecutionOrder", () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  it("test_execution_order_linear", () => {
    const nodes = [
      makeNode("a", "start"),
      makeNode("b", "process"),
      makeNode("c", "end"),
    ];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "b", "out", "c", "in"),
    ];

    const order = (executor as any).getExecutionOrder(nodes, connections);
    const ids = order.map((n: any) => n.id);

    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
  });

  it("test_execution_order_branching", () => {
    const nodes = [
      makeNode("a", "start"),
      makeNode("b", "process"),
      makeNode("c", "process"),
      makeNode("d", "end"),
    ];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "a", "out2", "c", "in"),
      makeConnection("c3", "b", "out", "d", "in"),
      makeConnection("c4", "c", "out", "d", "in2"),
    ];

    const order = (executor as any).getExecutionOrder(nodes, connections);
    const ids = order.map((n: any) => n.id);

    expect(ids[0]).toBe("a");
    expect(ids[ids.length - 1]).toBe("d");
    expect(ids.includes("b")).toBe(true);
    expect(ids.includes("c")).toBe(true);
  });

  it("test_execution_order_no_start_node", () => {
    const nodes = [
      makeNode("a", "process"),
      makeNode("b", "process"),
      makeNode("c", "process"),
    ];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "b", "out", "c", "in"),
    ];

    const order = (executor as any).getExecutionOrder(nodes, connections);
    const ids = order.map((n: any) => n.id);

    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
  });

  it("test_execution_order_empty", () => {
    const order = (executor as any).getExecutionOrder([], []);
    expect(order).toEqual([]);
  });

  it("test_execution_order_isolated_nodes", () => {
    const nodes = [
      makeNode("a", "start"),
      makeNode("b", "process"),
      makeNode("c", "process"),
    ];
    const connections = [makeConnection("c1", "a", "out", "b", "in")];

    const order = (executor as any).getExecutionOrder(nodes, connections);
    const ids = order.map((n: any) => n.id);

    expect(ids.includes("a")).toBe(true);
    expect(ids.includes("b")).toBe(true);
    expect(ids.includes("c")).toBe(false);
  });

  it("test_execution_order_detects_simple_cycle", () => {
    const nodes = [
      makeNode("a", "start"),
      makeNode("b", "process"),
      makeNode("c", "process"),
    ];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "b", "out", "c", "in"),
      makeConnection("c3", "c", "out", "b", "in2"),
    ];

    expect(() => {
      (executor as any).getExecutionOrder(nodes, connections);
    }).toThrow(WorkflowCycleError);
  });

  it("test_execution_order_detects_self_loop", () => {
    const nodes = [
      makeNode("a", "start"),
      makeNode("b", "process"),
    ];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "b", "out", "b", "in2"),
    ];

    expect(() => {
      (executor as any).getExecutionOrder(nodes, connections);
    }).toThrow(WorkflowCycleError);
  });

  it("test_execution_order_from_detects_cycle", () => {
    const nodes = [
      makeNode("a", "start"),
      makeNode("b", "process"),
      makeNode("c", "process"),
    ];
    const connections = [
      makeConnection("c1", "a", "out", "b", "in"),
      makeConnection("c2", "b", "out", "c", "in"),
      makeConnection("c3", "c", "out", "b", "in2"),
    ];

    const adjacency: Map<string, string[]> = (executor as any).buildAdjacency(
      nodes,
      connections,
    );

    expect(() => {
      (executor as any).getExecutionOrderFrom(
        "a",
        nodes,
        connections,
        adjacency,
      );
    }).toThrow(WorkflowCycleError);
  });
});

// ─── TestFilterSubgraph ───────────────────────────────────────────

describe("TestFilterSubgraph", () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  it("test_filter_subgraph_basic", () => {
    const workflowData = {
      nodes: [
        makeNode("a"),
        makeNode("b"),
        makeNode("c"),
        makeNode("d"),
      ],
      connections: [
        makeConnection("c1", "d", "out", "a", "in"),
        makeConnection("c2", "a", "out", "b", "in"),
        makeConnection("c3", "b", "out", "c", "in"),
      ],
      character: {},
    };

    const result = (executor as any).filterSubgraph(workflowData, "b");
    const nodeIds = result.nodes.map((n: any) => n.id);

    expect(new Set(nodeIds)).toEqual(new Set(["b", "c"]));
    expect(nodeIds.includes("a")).toBe(false);
    expect(nodeIds.includes("d")).toBe(false);
  });

  it("test_filter_subgraph_preserves_connections", () => {
    const workflowData = {
      nodes: [
        makeNode("a"),
        makeNode("b"),
        makeNode("c"),
        makeNode("d"),
      ],
      connections: [
        makeConnection("c1", "d", "out", "a", "in"),
        makeConnection("c2", "a", "out", "b", "in"),
        makeConnection("c3", "b", "out", "c", "in"),
      ],
      character: {},
    };

    const result = (executor as any).filterSubgraph(workflowData, "b");
    const connectionIds = result.connections.map((c: any) => c.id);

    expect(connectionIds).toEqual(["c3"]);
    expect(connectionIds.includes("c1")).toBe(false);
    expect(connectionIds.includes("c2")).toBe(false);
  });
});

// ─── TestGetNodeInputs ────────────────────────────────────────────

describe("TestGetNodeInputs", () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  it("test_get_node_inputs_simple", () => {
    const connections = [
      makeConnection("c1", "a", "output", "b", "input"),
    ];

    const nodeOutputs = new Map<string, Record<string, any>>();
    nodeOutputs.set("a", { output: "hello" });

    const inputs = (executor as any).getNodeInputs("b", connections, nodeOutputs);
    expect(inputs).toEqual({ input: "hello" });
  });

  it("test_get_node_inputs_multiple_ports", () => {
    const connections = [
      makeConnection("c1", "a", "text", "c", "input1"),
      makeConnection("c2", "b", "value", "c", "input2"),
    ];

    const nodeOutputs = new Map<string, Record<string, any>>();
    nodeOutputs.set("a", { text: "hello" });
    nodeOutputs.set("b", { value: 42 });

    const inputs = (executor as any).getNodeInputs("c", connections, nodeOutputs);
    expect(inputs).toEqual({ input1: "hello", input2: 42 });
  });

  it("test_get_node_inputs_missing_upstream", () => {
    const connections = [
      makeConnection("c1", "a", "output", "b", "input"),
    ];

    const nodeOutputs = new Map<string, Record<string, any>>();

    const inputs = (executor as any).getNodeInputs("b", connections, nodeOutputs);
    expect(inputs).toEqual({});
  });
});

// ─── TestNodeAcceptsEvent ─────────────────────────────────────────

describe("TestNodeAcceptsEvent", () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  it("test_node_accepts_event_no_filters", () => {
    const node = makeNode("n1", "process");
    const event = makeEvent("message.received", { text: "hi" });

    const result = (executor as any).nodeAcceptsEvent(node, event);
    expect(result).toBe(true);
  });

  it("test_node_accepts_event_matching_filter", () => {
    const node = {
      id: "n1",
      type: "process",
      eventFilters: [{ event: "message.*" }],
    };
    const event = makeEvent("message.received", { text: "hi" });

    const result = (executor as any).nodeAcceptsEvent(node, event);
    expect(result).toBe(true);
  });

  it("test_node_accepts_event_non_matching_filter", () => {
    const node = {
      id: "n1",
      type: "process",
      eventFilters: [{ event: "message.*" }],
    };
    const event = makeEvent("timer.tick", {});

    const result = (executor as any).nodeAcceptsEvent(node, event);
    expect(result).toBe(false);
  });

  it("test_node_accepts_event_or_semantics", () => {
    const node = {
      id: "n1",
      type: "process",
      eventFilters: [{ event: "message.*" }, { event: "timer.*" }],
    };

    const messageEvent = makeEvent("message.received", { text: "hi" });
    const timerEvent = makeEvent("timer.tick", {});
    const otherEvent = makeEvent("audio.play", {});

    expect((executor as any).nodeAcceptsEvent(node, messageEvent)).toBe(true);
    expect((executor as any).nodeAcceptsEvent(node, timerEvent)).toBe(true);
    expect((executor as any).nodeAcceptsEvent(node, otherEvent)).toBe(false);
  });

  it("test_node_accepts_event_with_condition", () => {
    const node = {
      id: "n1",
      type: "process",
      eventFilters: [{ event: "donation", condition: "event.amount > 100" }],
    };

    const bigDonation = makeEvent("donation", { amount: 500 });
    const smallDonation = makeEvent("donation", { amount: 10 });

    expect((executor as any).nodeAcceptsEvent(node, bigDonation)).toBe(true);
    expect((executor as any).nodeAcceptsEvent(node, smallDonation)).toBe(false);
  });
});

// ─── TestGetStatus ────────────────────────────────────────────────

describe("TestGetStatus", () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  it("test_get_status_not_running", () => {
    const status = executor.getStatus("nonexistent");
    expect(status).toEqual({ status: "idle" });
  });

  it("test_get_status_running", () => {
    (executor as any).runningWorkflows.set("wf1", {
      status: "running",
      started_at: new Date(),
    });

    const status = executor.getStatus("wf1");
    expect(status.status).toBe("running");
    expect(status.started_at).toBeDefined();
  });

  it("test_get_status_with_queue", () => {
    (executor as any).runningWorkflows.set("wf1", {
      status: "running",
    });

    const queue = new EventQueue(100);
    queue.put(makeEvent("test"));
    queue.put(makeEvent("test2"));
    queue.processing = true;
    (executor as any).eventQueues.set("wf1", queue);

    const status = executor.getStatus("wf1");
    expect(status.status).toBe("running");
    expect(status.queue_size).toBe(2);
    expect(status.queue_processing).toBe(true);
    expect(status.queue_dropped).toBe(0);
  });
});

// ─── TestNodeContext ──────────────────────────────────────────────

describe("TestNodeContext", () => {
  it("test_node_context_log", async () => {
    const logMessages: Array<{ nodeId: string | null; message: string; level: string }> = [];

    const ctx = new NodeContext({
      workflowId: "wf1",
      nodeId: "n1",
      character: { name: "TestBot" },
      logCallback: async (nodeId, message, level) => {
        logMessages.push({ nodeId, message, level });
      },
    });

    await ctx.log("Hello from node");
    await ctx.log("Something went wrong", "error");

    expect(logMessages).toHaveLength(2);
    expect(logMessages[0]).toEqual({
      nodeId: "n1",
      message: "Hello from node",
      level: "info",
    });
    expect(logMessages[1]).toEqual({
      nodeId: "n1",
      message: "Something went wrong",
      level: "error",
    });
  });

  it("test_node_context_emit_event", async () => {
    const eventBus = new EventBus();
    await eventBus.start();

    const received: Event[] = [];
    eventBus.subscribe("test.*", (event) => {
      received.push(event);
    });

    const ctx = new NodeContext({
      workflowId: "wf1",
      nodeId: "n1",
      character: { name: "TestBot" },
      eventBus,
    });

    await ctx.emitEvent({
      type: "test.hello",
      payload: { greeting: "hi" },
      timestamp: new Date().toISOString(),
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("test.hello");
    expect(received[0].payload.greeting).toBe("hi");
    expect(received[0].sourceNodeId).toBe("n1");

    await eventBus.stop();
  });

  it("test_node_context_character_access", () => {
    const ctx = new NodeContext({
      workflowId: "wf1",
      nodeId: "n1",
      character: { name: "Sakura", personality: "Cheerful and energetic" },
    });

    expect(ctx.getCharacterName()).toBe("Sakura");
    expect(ctx.getCharacterPersonality()).toBe("Cheerful and energetic");
  });

  it("test_node_context_character_defaults", () => {
    const ctx = new NodeContext({
      workflowId: "wf1",
      nodeId: "n1",
      character: {},
    });

    expect(ctx.getCharacterName()).toBe("AI Assistant");
    expect(ctx.getCharacterPersonality()).toBe("");
  });
});

// ─── TestPluginLoadFailureNotification ────────────────────────────
//
// loadPlugin() distinguishes "no plugin for this node type" (returns null,
// falls through to a built-in node) from "plugin exists but failed to load"
// (throws PluginLoadError). initializeNodes() must surface the latter via
// the log and status callbacks instead of silently registering a no-op node.

describe("TestPluginLoadFailureNotification", () => {
  let executor: WorkflowExecutor;
  const PLUGINS_DIR = getPluginsDir();
  const fixtureDirs: string[] = [];

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  afterEach(async () => {
    while (fixtureDirs.length > 0) {
      const dir = fixtureDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  async function makeBrokenPlugin(name: string): Promise<string> {
    const dir = join(PLUGINS_DIR, name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "node.ts"), `throw new Error("boom");\n`, "utf-8");
    fixtureDirs.push(dir);
    return name;
  }

  it("rejects a path-traversal node type without touching the filesystem", async () => {
    const logs: Array<{ nodeId: string | null; message: string; level: string }> = [];
    const statuses: Array<{ nodeId: string; status: string; data?: any }> = [];
    executor.setLogCallback("wf1", async (nodeId, message, level) => {
      logs.push({ nodeId, message, level });
    });
    executor.setStatusCallback("wf1", async (nodeId, status, data) => {
      statuses.push({ nodeId, status, data });
    });

    const nodes = [makeNode("n1", "../../evil")];
    await (executor as any).initializeNodes("wf1", nodes, {}, {});

    const runtime = (executor as any).getNodeRuntime("wf1", "n1");
    expect(runtime.instance).toBeNull();
    expect(runtime.loadError).toContain("Invalid plugin type");

    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({ nodeId: "n1", status: "error" });
    expect(statuses[0].data.error).toContain("Invalid plugin type");

    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("error");
    expect(logs[0].message).toContain("プラグインの読み込みに失敗しました");
  });

  it("reports a broken plugin (import failure) via log + status callbacks", async () => {
    const nodeType = await makeBrokenPlugin("__test-exec-broken-plugin__");

    const logs: Array<{ nodeId: string | null; message: string; level: string }> = [];
    const statuses: Array<{ nodeId: string; status: string; data?: any }> = [];
    executor.setLogCallback("wf1", async (nodeId, message, level) => {
      logs.push({ nodeId, message, level });
    });
    executor.setStatusCallback("wf1", async (nodeId, status, data) => {
      statuses.push({ nodeId, status, data });
    });

    const nodes = [makeNode("n1", nodeType)];
    await (executor as any).initializeNodes("wf1", nodes, {}, {});

    const runtime = (executor as any).getNodeRuntime("wf1", "n1");
    expect(runtime.instance).toBeNull();
    expect(runtime.loadError).toContain("boom");

    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({ nodeId: "n1", status: "error" });

    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("error");
    expect(logs[0].message).toContain("プラグインの読み込みに失敗しました");
    expect(logs[0].message).toContain("boom");
  });

  it("leaves a missing (never-existed) plugin type to the built-in-node fallback silently", async () => {
    const logs: Array<{ nodeId: string | null; message: string; level: string }> = [];
    const statuses: Array<{ nodeId: string; status: string; data?: any }> = [];
    executor.setLogCallback("wf1", async (nodeId, message, level) => {
      logs.push({ nodeId, message, level });
    });
    executor.setStatusCallback("wf1", async (nodeId, status, data) => {
      statuses.push({ nodeId, status, data });
    });

    const nodes = [makeNode("n1", "console-output")];
    await (executor as any).initializeNodes("wf1", nodes, {}, {});

    const runtime = (executor as any).getNodeRuntime("wf1", "n1");
    expect(runtime.instance).not.toBeNull();
    expect(runtime.loadError).toBeUndefined();
    expect(statuses).toHaveLength(0);
  });

  it("executeBuiltinNode surfaces the load-error reason instead of a generic warning", async () => {
    const logs: Array<{ message: string; level: string }> = [];
    const ctx = new NodeContext({
      workflowId: "wf1",
      nodeId: "n1",
      character: {},
      logCallback: async (_nid, message, level) => {
        logs.push({ message, level });
      },
    });

    await (executor as any).executeBuiltinNode(
      "some-nonexistent-node-type",
      {},
      {},
      ctx,
      "boom during import",
    );

    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("error");
    expect(logs[0].message).toContain("boom during import");
  });

  it("executeBuiltinNode falls back to a plain warning when there is no load error", async () => {
    const logs: Array<{ message: string; level: string }> = [];
    const ctx = new NodeContext({
      workflowId: "wf1",
      nodeId: "n1",
      character: {},
      logCallback: async (_nid, message, level) => {
        logs.push({ message, level });
      },
    });

    await (executor as any).executeBuiltinNode("some-nonexistent-node-type", {}, {}, ctx);

    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("warning");
  });
});
