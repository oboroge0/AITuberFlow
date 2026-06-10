/**
 * Graceful shutdown sequence, extracted from the index.ts signal handlers so
 * it can be unit-tested. process.exit and the watchdog timeout stay in
 * index.ts — this module only knows how to wind down cleanly.
 */
import { closeDb } from "./db/database";

export interface ShutdownTarget {
  getRunningWorkflowIds(): string[];
  stopWorkflow(workflowId: string): Promise<void>;
}

export async function shutdownGracefully(
  executor: ShutdownTarget,
  options: { closeDatabase?: () => void } = {},
): Promise<void> {
  const closeDatabase = options.closeDatabase ?? closeDb;

  try {
    const runningIds = executor.getRunningWorkflowIds();
    if (runningIds.length > 0) {
      console.log(`Stopping ${runningIds.length} running workflow(s)...`);
      // allSettled: one workflow failing to stop must not skip the others
      // (or the DB close below)
      await Promise.allSettled(runningIds.map((id) => executor.stopWorkflow(id)));
    }
  } catch (err) {
    console.error("Error stopping workflows on shutdown:", err);
  }

  try {
    closeDatabase();
  } catch (err) {
    console.error("Error closing database on shutdown:", err);
  }
}
