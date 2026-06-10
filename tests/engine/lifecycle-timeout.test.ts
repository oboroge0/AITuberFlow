import { describe, it, expect, mock } from "bun:test";
import { WorkflowExecutor } from "../../apps/server-ts/src/engine/executor";

// Regression tests for issue #239: a plugin whose setup/teardown never
// settles (e.g. a chat client stuck in a connect-retry loop) must not hang
// workflow start/stop.

function never(): Promise<void> {
  return new Promise(() => {});
}

function plantRuntime(
  executor: WorkflowExecutor,
  workflowId: string,
  entries: Array<{ nodeId: string; nodeType: string; instance: unknown }>,
): void {
  const runtimes = new Map();
  for (const e of entries) {
    runtimes.set(e.nodeId, {
      nodeId: e.nodeId,
      nodeType: e.nodeType,
      config: {},
      instance: e.instance,
      context: null,
    });
  }
  (executor as any).nodeInstances.set(workflowId, runtimes);
}

describe("TestLifecycleTimeouts", () => {
  it("test_runWithTimeout_resolves_for_fast_promise", async () => {
    const executor = new WorkflowExecutor();
    await expect(
      (executor as any).runWithTimeout(Promise.resolve("ok"), 1000, "fast"),
    ).resolves.toBeUndefined();
  });

  it("test_runWithTimeout_rejects_for_hung_promise", async () => {
    const executor = new WorkflowExecutor();
    await expect(
      (executor as any).runWithTimeout(never(), 50, "hung op"),
    ).rejects.toThrow("hung op timed out after 50ms");
  });

  it("test_hung_teardown_does_not_block_other_nodes_or_stop", async () => {
    const executor = new WorkflowExecutor();
    (executor as any).teardownTimeoutMs = 50;

    const okTeardown = mock(async () => {});
    plantRuntime(executor, "wf1", [
      { nodeId: "n-hung", nodeType: "hung-plugin", instance: { teardown: never } },
      { nodeId: "n-ok", nodeType: "ok-plugin", instance: { teardown: okTeardown } },
    ]);

    const start = Date.now();
    await (executor as any).teardownNodes("wf1");
    const elapsed = Date.now() - start;

    expect(okTeardown).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(1000);
    // Runtimes map is released even when a teardown hung
    expect((executor as any).nodeInstances.has("wf1")).toBe(false);
  });

  it("test_teardown_error_does_not_block_others", async () => {
    const executor = new WorkflowExecutor();
    (executor as any).teardownTimeoutMs = 50;

    const okTeardown = mock(async () => {});
    plantRuntime(executor, "wf2", [
      {
        nodeId: "n-throw",
        nodeType: "throwing-plugin",
        instance: {
          teardown: async () => {
            throw new Error("teardown exploded");
          },
        },
      },
      { nodeId: "n-ok", nodeType: "ok-plugin", instance: { teardown: okTeardown } },
    ]);

    await expect((executor as any).teardownNodes("wf2")).resolves.toBeUndefined();
    expect(okTeardown).toHaveBeenCalledTimes(1);
  });

  it("test_stopWorkflowInternal_completes_with_hung_teardown", async () => {
    const executor = new WorkflowExecutor();
    (executor as any).teardownTimeoutMs = 50;

    (executor as any).runningWorkflows.set("wf3", {
      status: "running",
      started_at: new Date(),
      workflow_data: { nodes: [], connections: [] },
    });
    plantRuntime(executor, "wf3", [
      { nodeId: "n-hung", nodeType: "hung-plugin", instance: { teardown: never } },
    ]);

    const start = Date.now();
    await executor.stopWorkflow("wf3");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect((executor as any).runningWorkflows.has("wf3")).toBe(false);
  });
});
