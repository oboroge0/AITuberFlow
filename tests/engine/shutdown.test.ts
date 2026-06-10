import { describe, it, expect, mock } from "bun:test";
import {
  shutdownGracefully,
  type ShutdownTarget,
} from "../../apps/server-ts/src/shutdown";

function makeExecutor(runningIds: string[], stopImpl?: (id: string) => Promise<void>) {
  const stopWorkflow = mock(stopImpl ?? (async (_id: string) => {}));
  const target: ShutdownTarget = {
    getRunningWorkflowIds: () => runningIds,
    stopWorkflow,
  };
  return { target, stopWorkflow };
}

describe("TestGracefulShutdown", () => {
  it("test_stops_all_running_workflows_then_closes_db", async () => {
    const { target, stopWorkflow } = makeExecutor(["wf-a", "wf-b", "wf-c"]);
    const order: string[] = [];
    const closeDatabase = mock(() => {
      order.push("close-db");
    });

    await shutdownGracefully(target, { closeDatabase });

    expect(stopWorkflow).toHaveBeenCalledTimes(3);
    expect(stopWorkflow.mock.calls.map((c) => c[0]).sort()).toEqual(["wf-a", "wf-b", "wf-c"]);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it("test_closes_db_when_nothing_is_running", async () => {
    const { target, stopWorkflow } = makeExecutor([]);
    const closeDatabase = mock(() => {});

    await shutdownGracefully(target, { closeDatabase });

    expect(stopWorkflow).not.toHaveBeenCalled();
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it("test_one_failing_workflow_does_not_skip_others_or_db_close", async () => {
    const { target, stopWorkflow } = makeExecutor(["wf-bad", "wf-ok"], async (id) => {
      if (id === "wf-bad") throw new Error("stop failed");
    });
    const closeDatabase = mock(() => {});

    await shutdownGracefully(target, { closeDatabase });

    expect(stopWorkflow).toHaveBeenCalledTimes(2);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it("test_db_close_failure_does_not_throw", async () => {
    const { target } = makeExecutor([]);
    const closeDatabase = mock(() => {
      throw new Error("db close failed");
    });

    await expect(shutdownGracefully(target, { closeDatabase })).resolves.toBeUndefined();
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it("test_getRunningWorkflowIds_failure_still_closes_db", async () => {
    const closeDatabase = mock(() => {});
    const target: ShutdownTarget = {
      getRunningWorkflowIds: () => {
        throw new Error("executor broken");
      },
      stopWorkflow: async () => {},
    };

    await expect(shutdownGracefully(target, { closeDatabase })).resolves.toBeUndefined();
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });
});
