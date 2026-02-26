/**
 * Workflow Executor - Core execution engine for AITuberFlow.
 *
 * Supports two execution modes:
 * 1. Linear: Entry point → DAG order → completion
 * 2. Event-driven: Source nodes emit events → downstream nodes react
 *
 * Ported from Python apps/server/engine/executor.py (1173 lines).
 */

import { db } from "../db/database";
import { globalSettings } from "../db/schema";
import { vtsClient } from "../integrations/vtube-studio";
import type { Event } from "./event-bus";
import { EventBus, EventFilter } from "./event-bus";
import { EventQueue } from "./event-queue";
import { SOURCE_NODE_TYPES, loadPlugin } from "./plugin-loader";
import { resolvePortId } from "./port-aliases";
import { TaskRegistry } from "./task-registry";

// ─── Types ───────────────────────────────────────────────────────

interface NodeData {
  id: string;
  type: string;
  config?: Record<string, unknown>;
  eventFilters?: EventFilterDef[];
  event_filters?: EventFilterDef[];
  position?: { x: number; y: number };
}

interface ConnectionData {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

interface WorkflowData {
  id?: string;
  name?: string;
  nodes: NodeData[];
  connections: ConnectionData[];
  character: Record<string, unknown>;
}

interface EventFilterDef {
  event: string;
  condition?: string;
}

type LogCallback = (nodeId: string | null, message: string, level: string) => Promise<void>;

type EventCallback = (event: Event) => Promise<void>;

type StatusCallback = (
  nodeId: string,
  status: string,
  data?: Record<string, unknown> | null,
) => Promise<void>;

// ─── NodeContext (executor-internal) ─────────────────────────────

export class NodeContext {
  workflowId: string;
  nodeId: string;
  character: Record<string, unknown>;
  private eventBus: EventBus | null;
  private logCallback: LogCallback | null;
  private taskRegistry: TaskRegistry | null;
  private taskIds = new Set<string>();
  private localControllers = new Set<AbortController>();

  constructor(opts: {
    workflowId: string;
    nodeId: string;
    character: Record<string, unknown>;
    eventBus?: EventBus | null;
    logCallback?: LogCallback | null;
    taskRegistry?: TaskRegistry | null;
  }) {
    this.workflowId = opts.workflowId;
    this.nodeId = opts.nodeId;
    this.character = opts.character;
    this.eventBus = opts.eventBus ?? null;
    this.logCallback = opts.logCallback ?? null;
    this.taskRegistry = opts.taskRegistry ?? null;
  }

  async emitEvent(event: Event | Record<string, any>): Promise<void> {
    if (!this.eventBus) return;

    let evt: Event;
    if ("type" in event && typeof event.type === "string") {
      // biome-ignore lint/suspicious/noExplicitAny: plugin event may be loosely typed
      const { type, source_node_id, sourceNodeId, timestamp, ...payload } = event as any;
      evt = {
        type,
        payload: (event as Event).payload ?? payload,
        sourceNodeId: this.nodeId,
        timestamp: timestamp ?? new Date().toISOString(),
      };
    } else {
      evt = {
        type: "unknown",
        payload: event as Record<string, any>,
        sourceNodeId: this.nodeId,
        timestamp: new Date().toISOString(),
      };
    }

    evt.sourceNodeId = this.nodeId;
    await this.eventBus.emit(evt);
  }

  async log(message: string, level = "info"): Promise<void> {
    if (this.logCallback) {
      await this.logCallback(this.nodeId, message, level);
    }
  }

  createTask(fn: (signal: AbortSignal) => Promise<void>): AbortController {
    const taskId = `${this.nodeId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (this.taskRegistry) {
      this.taskIds.add(taskId);
      return this.taskRegistry.register(taskId, async (signal) => {
        try {
          await fn(signal);
        } finally {
          this.taskIds.delete(taskId);
        }
      });
    }

    const controller = new AbortController();
    this.localControllers.add(controller);

    fn(controller.signal)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.error(`Background task ${taskId} error:`, err);
        }
      })
      .finally(() => {
        this.localControllers.delete(controller);
      });

    return controller;
  }

  // biome-ignore lint/suspicious/noExplicitAny: plugin API boundary — character state is dynamic
  async updateCharacter(updates: Record<string, unknown>): Promise<void> {
    // Guard against prototype pollution: never copy __proto__/constructor/prototype
    // keys from user-controllable updates into the character state.
    for (const [key, value] of Object.entries(updates)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      (this.character as Record<string, unknown>)[key] = value;
    }
  }

  getCharacterName(): string {
    return (this.character.name as string) ?? "AI Assistant";
  }

  getCharacterPersonality(): string {
    return (this.character.personality as string) ?? "";
  }

  // biome-ignore lint/suspicious/noExplicitAny: emotion shape defined by plugin
  getEmotion(): Record<string, any> {
    return (
      (this.character.emotion as Record<string, any>) ?? {
        current: "neutral",
        intensity: 0.5,
      }
    );
  }

  async cancelBackgroundTasks(): Promise<void> {
    for (const taskId of this.taskIds) {
      this.taskRegistry?.cancel(taskId);
    }
    this.taskIds.clear();

    for (const controller of this.localControllers) {
      controller.abort();
    }
    this.localControllers.clear();
  }
}

// ─── NodeRuntime ─────────────────────────────────────────────────

interface NodeRuntime {
  nodeId: string;
  nodeType: string;
  // biome-ignore lint/suspicious/noExplicitAny: plugin config is dynamic
  config: Record<string, any>;
  // biome-ignore lint/suspicious/noExplicitAny: plugin instance shape is unknown at compile time
  instance: unknown;
  context: NodeContext;
}

// ─── Error ───────────────────────────────────────────────────────

export class WorkflowCycleError extends Error {
  cycleNodes: string[];
  constructor(cycleNodes: string[]) {
    super(`Cycle detected in workflow: ${cycleNodes.join(", ")}`);
    this.name = "WorkflowCycleError";
    this.cycleNodes = cycleNodes;
  }
}

// ─── Global Settings ─────────────────────────────────────────────

/**
 * Maps node types to their config fields and corresponding global setting keys.
 * When a node's config field is empty, the global setting value is used instead.
 */
const GLOBAL_SETTINGS_MAP: Record<string, Record<string, string>> = {
  "openai-llm": { apiKey: "openai.apiKey", model: "openai.model" },
  "anthropic-llm": { apiKey: "anthropic.apiKey", model: "anthropic.model" },
  "google-llm": { apiKey: "google.apiKey", model: "google.model" },
  "ollama-llm": { host: "ollama.host", model: "ollama.model" },
  "mistral-llm": { apiKey: "mistral.apiKey", model: "mistral.model" },
  "groq-llm": { apiKey: "groq.apiKey", model: "groq.model" },
  "voicevox-tts": { host: "voicevox.host" },
  "coeiroink-tts": { host: "coeiroink.host" },
  "sbv2-tts": { host: "sbv2.host" },
  "aivis-tts": { host: "aivis.host" },
  "openai-tts": { apiKey: "openai.apiKey" },
};

function loadGlobalSettings(): Record<string, string> {
  const rows = db.select().from(globalSettings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

function mergeGlobalSettings(
  nodeType: string,
  config: Record<string, unknown>,
  settings: Record<string, string>,
): Record<string, unknown> {
  const mapping = GLOBAL_SETTINGS_MAP[nodeType];
  if (!mapping) return config;

  const merged = { ...config };
  for (const [configField, settingsKey] of Object.entries(mapping)) {
    const currentValue = merged[configField];
    if (
      (currentValue === undefined || currentValue === null || currentValue === "") &&
      settings[settingsKey]
    ) {
      merged[configField] = settings[settingsKey];
    }
  }
  return merged;
}

// ─── Executor ────────────────────────────────────────────────────

export class WorkflowExecutor {
  private runningWorkflows = new Map<string, Record<string, unknown>>();
  private eventBuses = new Map<string, EventBus>();
  private logCallbacks = new Map<string, LogCallback>();
  private eventCallbacks = new Map<string, EventCallback>();
  private statusCallbacks = new Map<string, StatusCallback>();
  private nodeInstances = new Map<string, Map<string, NodeRuntime>>();
  private eventQueues = new Map<string, EventQueue>();
  private sourceNodes = new Map<string, Map<string, unknown>>();
  private queueProcessors = new Map<string, AbortController>();
  private taskRegistries = new Map<string, TaskRegistry>();
  private vtsWorkflows = new Set<string>();
  private workflowLocks = new Map<string, Promise<void>>();

  // ─── Callbacks ────────────────────

  setLogCallback(workflowId: string, callback: LogCallback): void {
    this.logCallbacks.set(workflowId, callback);
  }

  setEventCallback(workflowId: string, callback: EventCallback): void {
    this.eventCallbacks.set(workflowId, callback);
  }

  setStatusCallback(workflowId: string, callback: StatusCallback): void {
    this.statusCallbacks.set(workflowId, callback);
  }

  clearCallbacks(workflowId: string): void {
    this.logCallbacks.delete(workflowId);
    this.eventCallbacks.delete(workflowId);
    this.statusCallbacks.delete(workflowId);
  }

  // ─── Status ───────────────────────

  getRunningWorkflowIds(): string[] {
    return [...this.runningWorkflows.keys()];
  }

  getStatus(workflowId: string): Record<string, unknown> {
    const status = this.runningWorkflows.get(workflowId);
    if (!status) return { status: "idle" };

    const result = { ...status };
    const queue = this.eventQueues.get(workflowId);
    if (queue) {
      result.queue_size = queue.qsize;
      result.queue_processing = queue.isProcessing;
      result.queue_dropped = queue.droppedCount;
    }
    return result;
  }

  // ─── VTube Studio ─────────────────

  private async setupVtsIfNeeded(workflowId: string, workflowData: WorkflowData): Promise<void> {
    const nodes = workflowData.nodes;
    const avatarConfig = nodes.find((n) => n.type === "avatar-configuration")?.config;
    if (!avatarConfig) return;

    if (avatarConfig.renderer !== "vtube-studio") return;

    const port = (avatarConfig.vtubePort ?? avatarConfig.vtube_port ?? 8001) as number;
    const mouthParam = (avatarConfig.vtubeMouthParam ?? avatarConfig.vtube_mouth_param ?? "MouthOpen") as string;

    let expressionMap: Record<string, string> | undefined;
    const rawMap = avatarConfig.vtubeExpressionMap ?? avatarConfig.vtube_expression_map;
    if (rawMap) {
      try {
        expressionMap = typeof rawMap === "string" ? JSON.parse(rawMap) : rawMap;
      } catch {
        console.warn("Failed to parse VTS expression map");
      }
    }

    vtsClient.configure(port, mouthParam, expressionMap);
    console.log(`Workflow ${workflowId} uses VTube Studio mode, connecting...`);

    const success = await vtsClient.connect();
    if (success) {
      this.vtsWorkflows.add(workflowId);
      console.log(`VTube Studio connected for workflow ${workflowId}`);
    } else {
      console.warn(`Failed to connect to VTube Studio for workflow ${workflowId}`);
    }
  }

  private async disconnectVtsIfNeeded(workflowId: string): Promise<void> {
    if (this.vtsWorkflows.has(workflowId)) {
      this.vtsWorkflows.delete(workflowId);
      if (this.vtsWorkflows.size === 0) {
        await vtsClient.disconnect();
        console.log("VTube Studio disconnected (no active VTS workflows)");
      }
    }
  }

  // ─── Node Context Creation ────────

  private createNodeContext(
    workflowId: string,
    nodeId: string,
    character: Record<string, any>,
  ): NodeContext {
    return new NodeContext({
      workflowId,
      nodeId,
      character,
      eventBus: this.eventBuses.get(workflowId),
      logCallback: (nid, msg, lvl) => this.log(workflowId, nid, msg, lvl),
      taskRegistry: this.taskRegistries.get(workflowId),
    });
  }

  // ─── Node Lifecycle ───────────────

  private async initializeNodes(
    workflowId: string,
    nodes: NodeData[],
    character: Record<string, unknown>,
    settings: Record<string, string>,
  ): Promise<void> {
    const runtimes = new Map<string, NodeRuntime>();
    this.nodeInstances.set(workflowId, runtimes);

    for (const node of nodes) {
      const context = this.createNodeContext(workflowId, node.id, character);
      const instance = await loadPlugin(node.type);
      const mergedConfig = mergeGlobalSettings(node.type, node.config ?? {}, settings);

      const runtime: NodeRuntime = {
        nodeId: node.id,
        nodeType: node.type,
        config: mergedConfig,
        instance,
        context,
      };
      runtimes.set(node.id, runtime);

      const pluginInstance = instance as Record<string, any> | null;
      if (pluginInstance?.setup) {
        try {
          await pluginInstance.setup(mergedConfig, context);
        } catch (err) {
          await this.log(workflowId, node.id, `Node setup error: ${err}`, "error");
        }
      }
    }
  }

  private getNodeRuntime(workflowId: string, nodeId: string): NodeRuntime | undefined {
    return this.nodeInstances.get(workflowId)?.get(nodeId);
  }

  private async executeNodeRuntime(
    runtime: NodeRuntime,
    inputs: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (runtime.instance) {
      // biome-ignore lint/suspicious/noExplicitAny: plugin instance shape defined at runtime
      const inst = runtime.instance as Record<string, any>;
      return await inst.execute(inputs, runtime.context);
    }
    return await this.executeBuiltinNode(runtime.nodeType, runtime.config, inputs, runtime.context);
  }

  private async teardownNodes(workflowId: string): Promise<void> {
    const runtimes = this.nodeInstances.get(workflowId);
    if (!runtimes) return;
    this.nodeInstances.delete(workflowId);

    for (const runtime of runtimes.values()) {
      // biome-ignore lint/suspicious/noExplicitAny: plugin instance shape defined at runtime
      const inst = runtime.instance as Record<string, any> | null;
      if (inst?.teardown) {
        try {
          await inst.teardown();
        } catch (err) {
          console.error(`Error tearing down node ${runtime.nodeId}:`, err);
        }
      }
    }
  }

  // ─── Event Filter Check ───────────

  private nodeAcceptsEvent(node: NodeData, event: Event): boolean {
    const filters = node.eventFilters ?? node.event_filters;
    if (!filters || filters.length === 0) return true;

    for (const filterDef of filters) {
      if (!filterDef.event) continue;
      const ef = new EventFilter(filterDef.event, filterDef.condition);
      if (ef.matches(event)) return true;
    }
    return false;
  }

  // ─── Workflow Lock ──────────────

  private async withWorkflowLock<T>(workflowId: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing operation on this workflow to complete
    while (this.workflowLocks.has(workflowId)) {
      await this.workflowLocks.get(workflowId);
    }

    let resolve: (() => void) | undefined;
    const lock = new Promise<void>((r) => {
      resolve = r;
    });
    this.workflowLocks.set(workflowId, lock);

    try {
      return await fn();
    } finally {
      this.workflowLocks.delete(workflowId);
      resolve?.();
    }
  }

  // ─── Workflow Start/Stop ──────────

  async startWorkflow(
    workflowId: string,
    workflowData: WorkflowData,
    startNodeId?: string | null,
  ): Promise<void> {
    await this.withWorkflowLock(workflowId, async () => {
      if (this.runningWorkflows.has(workflowId)) {
        console.log(`Workflow ${workflowId} is already running, restarting...`);
        // Preserve callbacks before stop clears them so event forwarding
        // continues after restart without requiring the WS client to re-join
        const savedEventCallback = this.eventCallbacks.get(workflowId);
        const savedLogCallback = this.logCallbacks.get(workflowId);
        const savedStatusCallback = this.statusCallbacks.get(workflowId);
        await this.stopWorkflowInternal(workflowId);
        if (savedEventCallback) this.eventCallbacks.set(workflowId, savedEventCallback);
        if (savedLogCallback) this.logCallbacks.set(workflowId, savedLogCallback);
        if (savedStatusCallback) this.statusCallbacks.set(workflowId, savedStatusCallback);
      }

      // Create event bus
      const eventBus = new EventBus();
      await eventBus.start();
      this.eventBuses.set(workflowId, eventBus);

      // Create task registry
      this.taskRegistries.set(workflowId, new TaskRegistry());

      // Create event queue
      this.eventQueues.set(workflowId, new EventQueue(100));

      // Check VTube Studio
      await this.setupVtsIfNeeded(workflowId, workflowData);

      // Subscribe to events and forward
      const eventCallback = this.eventCallbacks.get(workflowId);
      if (eventCallback) {
        const forwardEvent = async (event: Event) => {
          if (
            event.type.startsWith("audio.") ||
            event.type.startsWith("avatar.") ||
            event.type === "subtitle"
          ) {
            await eventCallback(event);
          }

          // VTube Studio forwarding
          if (this.vtsWorkflows.has(workflowId) && vtsClient.isConnected) {
            if (event.type === "avatar.mouth") {
              const value = (event.payload.value as number) ?? 0;
              await vtsClient.setMouthOpen(value);
            } else if (event.type === "avatar.expression") {
              const expression = event.payload.expression as string;
              if (expression) {
                await vtsClient.triggerExpression(expression);
              }
            }
          }
        };

        eventBus.subscribe("audio.*", forwardEvent);
        eventBus.subscribe("avatar.*", forwardEvent);
        eventBus.subscribe("subtitle", forwardEvent);
      }

      // Filter subgraph if start node specified
      let data = workflowData;
      if (startNodeId) {
        data = this.filterSubgraph(workflowData, startNodeId);
        console.log(`Filtered workflow to subgraph starting from node: ${startNodeId}`);
      }

      // Track running state
      this.runningWorkflows.set(workflowId, {
        status: "running",
        started_at: new Date(),
        workflow_data: data,
      });

      // Start execution in background (non-blocking). Errors here reach the
      // top-level promise; record them on the workflow status so the HTTP
      // /status endpoint and WebSocket clients can observe the failure.
      this.executeWorkflow(workflowId, data).catch((err) => {
        console.error("Workflow execution error:", err);
        const status = this.runningWorkflows.get(workflowId);
        if (status) {
          status.status = "error";
          status.error = err instanceof Error ? err.message : String(err);
        }
      });

      console.log(`Started workflow: ${workflowId}`);
    });
  }

  async stopWorkflow(workflowId: string): Promise<void> {
    await this.withWorkflowLock(workflowId, async () => {
      await this.stopWorkflowInternal(workflowId);
    });
  }

  private async stopWorkflowInternal(workflowId: string): Promise<void> {
    if (!this.runningWorkflows.has(workflowId)) return;

    // Stop queue processor
    const qpController = this.queueProcessors.get(workflowId);
    if (qpController) {
      qpController.abort();
      this.queueProcessors.delete(workflowId);
    }

    // Teardown nodes
    await this.teardownNodes(workflowId);

    // Clean up source nodes
    this.sourceNodes.delete(workflowId);

    // Stop event bus
    const eventBus = this.eventBuses.get(workflowId);
    if (eventBus) {
      await eventBus.stop();
      this.eventBuses.delete(workflowId);
    }

    // Clean up event queue
    this.eventQueues.delete(workflowId);

    // Cancel and clean up background tasks
    const registry = this.taskRegistries.get(workflowId);
    if (registry) {
      registry.cancelAll();
      this.taskRegistries.delete(workflowId);
    }

    // Disconnect VTS
    await this.disconnectVtsIfNeeded(workflowId);

    // Clean up callbacks
    this.clearCallbacks(workflowId);

    // Update status
    this.runningWorkflows.delete(workflowId);
    console.log(`Stopped workflow: ${workflowId}`);
  }

  // ─── Main Execution ───────────────

  private async executeWorkflow(workflowId: string, workflowData: WorkflowData): Promise<void> {
    try {
      const { nodes, connections, character } = workflowData;
      if (!nodes?.length) {
        console.warn(`No nodes in workflow ${workflowId}`);
        return;
      }

      const settings = loadGlobalSettings();
      await this.initializeNodes(workflowId, nodes, character, settings);

      const sourceNodes = nodes.filter((n) => SOURCE_NODE_TYPES.has(n.type));
      const regularNodes = nodes.filter((n) => !SOURCE_NODE_TYPES.has(n.type));
      const adjacency = this.buildAdjacency(nodes, connections);

      const hasStartNode = nodes.some((n) => n.type === "start");
      const hasSourceNodes = sourceNodes.length > 0;

      if (hasSourceNodes) {
        await this.log(
          workflowId,
          null,
          `Event-driven workflow: ${sourceNodes.length} source node(s), ${regularNodes.length} regular node(s)`,
          "info",
        );
        await this.runEventDriven(
          workflowId,
          nodes,
          connections,
          character,
          sourceNodes,
          adjacency,
        );
      } else if (hasStartNode) {
        await this.log(workflowId, null, `Linear workflow (${nodes.length} nodes)`, "info");
        await this.runLinear(workflowId, nodes, connections, character);
      } else {
        await this.log(workflowId, null, `Workflow started (${nodes.length} nodes)`, "info");
        await this.runLinear(workflowId, nodes, connections, character);
      }
    } catch (err) {
      console.error("Workflow execution error:", err);
      const status = this.runningWorkflows.get(workflowId);
      if (status) {
        status.status = "error";
        status.error = String(err);
      }
    }
  }

  // ─── Event-Driven Mode ────────────

  private async runEventDriven(
    workflowId: string,
    nodes: NodeData[],
    connections: ConnectionData[],
    character: Record<string, any>,
    sourceNodes: NodeData[],
    adjacency: Map<string, string[]>,
  ): Promise<void> {
    const sources = new Map<string, any>();
    this.sourceNodes.set(workflowId, sources);

    // Start source nodes
    for (const node of sourceNodes) {
      const runtime = this.getNodeRuntime(workflowId, node.id);
      if (!runtime?.instance) {
        await this.log(workflowId, node.id, `Failed to load source node: ${node.type}`, "error");
        await this.updateNodeStatus(workflowId, node.id, "error", {
          error: "Plugin not found",
        });
        continue;
      }

      sources.set(node.id, {
        instance: runtime.instance,
        node,
        context: runtime.context,
      });
      await this.updateNodeStatus(workflowId, node.id, "listening");
      await this.log(workflowId, node.id, `Source node started: ${node.type}`, "info");
    }

    // Subscribe to source events
    const eventBus = this.eventBuses.get(workflowId);
    if (eventBus) {
      const onSourceEvent = async (event: Event) => {
        const queue = this.eventQueues.get(workflowId);
        if (queue) {
          const added = queue.put({
            event,
            source_node_id: event.sourceNodeId,
          });
          if (!added) {
            await this.log(workflowId, null, "Event queue full, dropping event", "warning");
          }
        }
      };

      eventBus.subscribe("message.*", onSourceEvent);
      eventBus.subscribe("timer.*", onSourceEvent);
    }

    // Start queue processor
    const controller = new AbortController();
    this.queueProcessors.set(workflowId, controller);

    this.processEventQueue(
      workflowId,
      nodes,
      connections,
      character,
      adjacency,
      controller.signal,
    ).catch(() => {
      // Cancelled or errored - handled internally
    });

    await this.log(workflowId, null, "Listening for events...", "info");
  }

  private async processEventQueue(
    workflowId: string,
    nodes: NodeData[],
    connections: ConnectionData[],
    character: Record<string, any>,
    adjacency: Map<string, string[]>,
    signal: AbortSignal,
  ): Promise<void> {
    const queue = this.eventQueues.get(workflowId);
    if (!queue) return;

    while (this.runningWorkflows.has(workflowId) && !signal.aborted) {
      try {
        const eventData = await queue.get(1000);
        if (!eventData || signal.aborted) continue;

        queue.processing = true;

        const event: Event = (eventData as any).event;
        const sourceNodeId: string = (eventData as any).source_node_id;

        await this.log(workflowId, sourceNodeId, `Processing event: ${event.type}`, "info");

        const downstreamIds = this.getDownstreamNodes(sourceNodeId, adjacency);

        if (downstreamIds.length === 0) {
          await this.log(workflowId, sourceNodeId, "No downstream nodes connected", "warning");
          queue.processing = false;
          continue;
        }

        // Node outputs tracking
        const nodeOutputs = new Map<string, Record<string, any>>();
        nodeOutputs.set(sourceNodeId, event.payload);

        // Inbound connection counts
        const inboundCounts = new Map<string, number>();
        for (const conn of connections) {
          const toId = conn.to.nodeId;
          inboundCounts.set(toId, (inboundCounts.get(toId) ?? 0) + 1);
        }

        // Execute downstream in order
        const executionOrder = this.getExecutionOrderFrom(
          sourceNodeId,
          nodes,
          connections,
          adjacency,
        );

        for (const node of executionOrder) {
          if (!this.runningWorkflows.has(workflowId) || signal.aborted) break;

          if (SOURCE_NODE_TYPES.has(node.type)) continue;
          if (!this.nodeAcceptsEvent(node, event)) continue;

          const inputs = this.getNodeInputs(node.id, connections, nodeOutputs);
          if (Object.keys(inputs).length === 0 && (inboundCounts.get(node.id) ?? 0) > 0) continue;

          const runtime = this.getNodeRuntime(workflowId, node.id);
          if (!runtime) {
            await this.log(workflowId, node.id, `Node runtime missing: ${node.type}`, "warning");
            continue;
          }

          await this.updateNodeStatus(workflowId, node.id, "running");

          try {
            const outputs = await this.executeNodeRuntime(runtime, inputs);
            nodeOutputs.set(node.id, outputs ?? {});
            await this.updateNodeStatus(workflowId, node.id, "completed", { outputs });
          } catch (err) {
            await this.updateNodeStatus(workflowId, node.id, "error", { error: String(err) });
            await this.log(workflowId, node.id, `Node error: ${err}`, "error");
          }
        }

        queue.processing = false;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") break;

        if (err instanceof WorkflowCycleError) {
          const errorMsg = `ワークフローに循環参照が検出されました / Cycle detected: ${err.cycleNodes.join(", ")}`;
          await this.log(workflowId, null, errorMsg, "error");
          console.error(`Cycle detected in workflow ${workflowId}:`, err.cycleNodes);
          queue.processing = false;

          const status = this.runningWorkflows.get(workflowId);
          if (status) {
            status.status = "error";
            status.error = errorMsg;
          }

          // Cleanup
          this.queueProcessors.delete(workflowId);
          const registry = this.taskRegistries.get(workflowId);
          if (registry) registry.cancelAll();
          await this.teardownNodes(workflowId);
          this.sourceNodes.delete(workflowId);
          const eventBus = this.eventBuses.get(workflowId);
          if (eventBus) {
            await eventBus.stop();
            this.eventBuses.delete(workflowId);
          }
          this.eventQueues.delete(workflowId);
          await this.disconnectVtsIfNeeded(workflowId);
          break;
        }

        console.error("Queue processor error:", err);
        queue.processing = false;
      }
    }
  }

  // ─── Linear Mode ──────────────────

  private async runLinear(
    workflowId: string,
    nodes: NodeData[],
    connections: ConnectionData[],
    character: Record<string, any>,
  ): Promise<void> {
    let executionOrder: NodeData[];
    try {
      executionOrder = this.getExecutionOrder(nodes, connections);
    } catch (err) {
      if (err instanceof WorkflowCycleError) {
        const msg = `ワークフローに循環参照が検出されました / Cycle detected: ${err.cycleNodes.join(", ")}`;
        await this.log(workflowId, null, msg, "error");
      }
      throw err;
    }

    if (executionOrder.length === 0) {
      await this.log(workflowId, null, "No executable nodes found", "warning");
      return;
    }

    const nodeOutputs = new Map<string, Record<string, any>>();

    for (const node of executionOrder) {
      if (!this.runningWorkflows.has(workflowId)) break;

      const inputs = this.getNodeInputs(node.id, connections, nodeOutputs);
      const runtime = this.getNodeRuntime(workflowId, node.id);
      if (!runtime) {
        await this.log(workflowId, node.id, `Node runtime missing: ${node.type}`, "warning");
        continue;
      }

      await this.log(workflowId, node.id, `Executing node: ${node.type}`, "info");
      await this.updateNodeStatus(workflowId, node.id, "running");

      try {
        const outputs = await this.executeNodeRuntime(runtime, inputs);
        nodeOutputs.set(node.id, outputs ?? {});
        await this.updateNodeStatus(workflowId, node.id, "completed", {
          outputs,
        });
        await this.log(workflowId, node.id, `Node completed: ${node.type}`, "info");
      } catch (err) {
        await this.updateNodeStatus(workflowId, node.id, "error", {
          error: String(err),
        });
        await this.log(workflowId, node.id, `Node error: ${err}`, "error");
        throw err;
      }
    }

    await this.log(workflowId, null, "Workflow execution completed", "info");

    const status = this.runningWorkflows.get(workflowId);
    if (status) {
      status.status = "completed";
    }

    await this.cleanupCompletedWorkflow(workflowId);
  }

  // ─── Cleanup ──────────────────────

  private async cleanupCompletedWorkflow(workflowId: string): Promise<void> {
    // Wait for background tasks
    const registry = this.taskRegistries.get(workflowId);
    if (registry) {
      registry.cancelAll();
      let awaitTimedOut = false;
      await Promise.race([
        registry.awaitAll(),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            awaitTimedOut = true;
            resolve();
          }, 30_000);
        }),
      ]);
      if (awaitTimedOut) {
        console.warn(`Timed out waiting for background tasks to finish for workflow ${workflowId}`);
      }
      this.taskRegistries.delete(workflowId);
    }

    // Stop queue processor
    const qpController = this.queueProcessors.get(workflowId);
    if (qpController) {
      qpController.abort();
      this.queueProcessors.delete(workflowId);
    }

    // Teardown nodes
    await this.teardownNodes(workflowId);

    // Clean up source nodes
    this.sourceNodes.delete(workflowId);

    // Stop event bus
    const eventBus = this.eventBuses.get(workflowId);
    if (eventBus) {
      await eventBus.stop();
      this.eventBuses.delete(workflowId);
    }

    // Clean up event queue
    this.eventQueues.delete(workflowId);

    // Completed workflows should not stay in memory.
    this.runningWorkflows.delete(workflowId);
  }

  // ─── Graph Algorithms ─────────────

  private filterSubgraph(workflowData: WorkflowData, startNodeId: string): WorkflowData {
    const { nodes, connections } = workflowData;
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) adjacency.set(node.id, []);
    for (const conn of connections) {
      const fromId = conn.from.nodeId;
      const toId = conn.to.nodeId;
      if (adjacency.has(fromId)) {
        adjacency.get(fromId)?.push(toId);
      }
    }

    // BFS to find reachable nodes
    const reachable = new Set<string>([startNodeId]);
    const queue = [startNodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return {
      ...workflowData,
      nodes: nodes.filter((n) => reachable.has(n.id)),
      connections: connections.filter(
        (c) => reachable.has(c.from.nodeId) && reachable.has(c.to.nodeId),
      ),
    };
  }

  private buildAdjacency(nodes: NodeData[], connections: ConnectionData[]): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) adjacency.set(node.id, []);
    for (const conn of connections) {
      const fromId = conn.from.nodeId;
      const toId = conn.to.nodeId;
      const neighbors = adjacency.get(fromId);
      if (neighbors && !neighbors.includes(toId)) {
        neighbors.push(toId);
      }
    }
    return adjacency;
  }

  private getDownstreamNodes(sourceId: string, adjacency: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const queue = [...(adjacency.get(sourceId) ?? [])];
    const result: string[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (nodeId === undefined) break;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      result.push(nodeId);
      queue.push(...(adjacency.get(nodeId) ?? []));
    }
    return result;
  }

  private getExecutionOrderFrom(
    sourceId: string,
    nodes: NodeData[],
    connections: ConnectionData[],
    adjacency: Map<string, string[]>,
  ): NodeData[] {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const downstreamIds = this.getDownstreamNodes(sourceId, adjacency);
    if (downstreamIds.length === 0) return [];

    const downstreamSet = new Set(downstreamIds);
    const inDegree = new Map<string, number>();
    for (const id of downstreamIds) inDegree.set(id, 0);

    // Compute in-degree from adjacency (which deduplicates multi-edges)
    // to stay consistent with what Kahn's algorithm traverses.
    for (const [fromId, neighbors] of adjacency) {
      if (!downstreamSet.has(fromId)) continue;
      for (const toId of neighbors) {
        if (inDegree.has(toId)) {
          inDegree.set(toId, (inDegree.get(toId) ?? 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);
    const order: NodeData[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (nodeId === undefined) break;
      const node = nodeMap.get(nodeId);
      if (node) order.push(node);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (inDegree.has(neighbor)) {
          const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
          inDegree.set(neighbor, newDeg);
          if (newDeg === 0) queue.push(neighbor);
        }
      }
    }

    if (order.length < downstreamIds.length) {
      const cycleNodes = [...inDegree.entries()].filter(([, deg]) => deg > 0).map(([id]) => id);
      throw new WorkflowCycleError(cycleNodes);
    }

    return order;
  }

  private getExecutionOrder(nodes: NodeData[], connections: ConnectionData[]): NodeData[] {
    if (nodes.length === 0) return [];

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const conn of connections) {
      const fromId = conn.from.nodeId;
      const toId = conn.to.nodeId;
      if (adjacency.has(fromId) && inDegree.has(toId)) {
        adjacency.get(fromId)?.push(toId);
        inDegree.set(toId, (inDegree.get(toId) ?? 0) + 1);
      }
    }

    // Find Start nodes
    const startNodes = nodes.filter((n) => n.type === "start").map((n) => n.id);
    const hasStartNode = startNodes.length > 0;

    const entryPoints = hasStartNode
      ? startNodes
      : [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);

    if (entryPoints.length === 0) return [];

    // BFS reachable
    const reachable = new Set<string>();
    const bfsQueue = [...entryPoints];
    while (bfsQueue.length > 0) {
      const nodeId = bfsQueue.shift();
      if (nodeId === undefined) break;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (!reachable.has(neighbor)) bfsQueue.push(neighbor);
      }
    }

    // Recalculate in-degree for reachable
    const filteredInDegree = new Map<string, number>();
    for (const id of reachable) filteredInDegree.set(id, 0);
    for (const conn of connections) {
      if (reachable.has(conn.from.nodeId) && reachable.has(conn.to.nodeId)) {
        filteredInDegree.set(conn.to.nodeId, (filteredInDegree.get(conn.to.nodeId) ?? 0) + 1);
      }
    }

    // Kahn's algorithm
    const execQueue = [...filteredInDegree.entries()]
      .filter(([, deg]) => deg === 0)
      .map(([id]) => id);
    const order: NodeData[] = [];

    while (execQueue.length > 0) {
      const nodeId = execQueue.shift();
      if (nodeId === undefined) break;
      const node = nodeMap.get(nodeId);
      if (node) order.push(node);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (filteredInDegree.has(neighbor)) {
          const newDeg = (filteredInDegree.get(neighbor) ?? 0) - 1;
          filteredInDegree.set(neighbor, newDeg);
          if (newDeg === 0) execQueue.push(neighbor);
        }
      }
    }

    if (order.length < reachable.size) {
      const cycleNodes = [...filteredInDegree.entries()]
        .filter(([, deg]) => deg > 0)
        .map(([id]) => id);
      throw new WorkflowCycleError(cycleNodes);
    }

    return order;
  }

  /**
   * Port IDs renamed from snake_case to camelCase in the config-naming
   * refactor. Workflows saved before the rename still reference the old IDs in
   * their connections, so resolve old → new here to avoid silently passing the
   * wrong value (or the whole upstream output object) downstream. Shared with
   * the validator (port-aliases.ts) so the two cannot drift.
   */
  private getNodeInputs(
    nodeId: string,
    connections: ConnectionData[],
    nodeOutputs: Map<string, Record<string, any>>,
  ): Record<string, any> {
    const inputs: Record<string, any> = {};

    for (const conn of connections) {
      if (conn.to.nodeId !== nodeId) continue;

      const upstreamOutputs = nodeOutputs.get(conn.from.nodeId);
      if (!upstreamOutputs) continue;

      const fromPort = resolvePortId(conn.from.port);
      const toPort = resolvePortId(conn.to.port);

      if (fromPort in upstreamOutputs) {
        inputs[toPort] = upstreamOutputs[fromPort];
      } else {
        inputs[toPort] = upstreamOutputs;
      }
    }

    return inputs;
  }

  // ─── Built-in Nodes ───────────────

  private async executeBuiltinNode(
    nodeType: string,
    config: Record<string, any>,
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    switch (nodeType) {
      case "start":
        await context.log("Workflow started from Start node");
        return { trigger: true };

      case "end":
        await context.log(`Workflow ended: ${config.message ?? "Workflow completed"}`);
        return {};

      case "manual-input": {
        const text = (config.inputText as string) ?? "";
        await context.log(`Input: ${text}`);
        return { text };
      }

      case "console-output": {
        const text = (inputs.text as string) ?? "";
        const prefix = (config.prefix as string) ?? "[Output]";
        await context.log(`${prefix} ${text}`);
        return {};
      }

      default:
        await context.log(`Unknown node type: ${nodeType}`, "warning");
        return {};
    }
  }

  // ─── Logging & Status ─────────────

  private async log(
    workflowId: string,
    nodeId: string | null,
    message: string,
    level: string,
  ): Promise<void> {
    const callback = this.logCallbacks.get(workflowId);
    if (callback) {
      await callback(nodeId, message, level);
    }
  }

  private async updateNodeStatus(
    workflowId: string,
    nodeId: string,
    status: string,
    data?: Record<string, any> | null,
  ): Promise<void> {
    const callback = this.statusCallbacks.get(workflowId);
    if (callback) {
      await callback(nodeId, status, data);
    }
  }
}
