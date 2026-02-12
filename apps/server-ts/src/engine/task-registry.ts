/**
 * Task Registry - Manages background tasks tied to workflow lifetime.
 *
 * Uses AbortController for cancellation instead of Python's asyncio.Task.
 */

export class TaskRegistry {
  private controllers: Map<string, AbortController> = new Map();
  private promises: Map<string, Promise<void>> = new Map();

  /**
   * Register and start a background task.
   * The task receives an AbortSignal it should respect for cancellation.
   */
  register(
    id: string,
    fn: (signal: AbortSignal) => Promise<void>
  ): void {
    // Cancel existing task with same ID
    this.cancel(id);

    const controller = new AbortController();
    this.controllers.set(id, controller);

    const promise = fn(controller.signal)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.error(`Background task ${id} error:`, err);
        }
      })
      .finally(() => {
        this.controllers.delete(id);
        this.promises.delete(id);
      });

    this.promises.set(id, promise);
  }

  /** Cancel a specific task by ID. */
  cancel(id: string): void {
    const controller = this.controllers.get(id);
    if (controller) {
      controller.abort();
      this.controllers.delete(id);
    }
  }

  /** Cancel all registered tasks. */
  cancelAll(): void {
    for (const [id, controller] of this.controllers) {
      controller.abort();
    }
    this.controllers.clear();
  }

  /** Wait for all tasks to complete (after cancellation). */
  async awaitAll(): Promise<void> {
    const promises = Array.from(this.promises.values());
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
    this.promises.clear();
  }

  /** Get count of active tasks. */
  get size(): number {
    return this.controllers.size;
  }

  /** Check if a task is registered. */
  has(id: string): boolean {
    return this.controllers.has(id);
  }
}
