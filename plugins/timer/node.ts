/**
 * Timer Node
 *
 * Triggers at regular intervals using event-driven architecture.
 */

import { InputNode } from "@aituber-flow/sdk";
import type { NodeContext } from "@aituber-flow/sdk";
import { createEvent } from "@aituber-flow/sdk";

export default class TimerNode extends InputNode {
  private intervalMs: number = 5000;
  private maxTicks: number = 0;
  private immediate: boolean = true;
  private tickCount: number = 0;
  private running: boolean = false;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.intervalMs = config.intervalMs ?? 5000;
    this.maxTicks = config.maxTicks ?? 0;
    this.immediate = config.immediate ?? true;
    this.tickCount = 0;
    this.running = true;

    await context.log(`Timer configured: interval=${this.intervalMs}ms`);

    // Start the timer loop in the background
    context.createTask((signal) => this.timerLoop(signal, context));
  }

  private async timerLoop(
    signal: AbortSignal,
    context: NodeContext,
  ): Promise<void> {
    // Emit immediately if configured
    if (this.immediate) {
      await this.emitTick(context);
    }

    while (!signal.aborted && this.running) {
      // Check max ticks limit
      if (this.maxTicks > 0 && this.tickCount >= this.maxTicks) {
        await context.log(`Timer reached max ticks (${this.maxTicks})`);
        break;
      }

      // Wait for interval, checking abort
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, this.intervalMs);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      });

      if (signal.aborted || !this.running) break;

      await this.emitTick(context);
    }
  }

  private async emitTick(context: NodeContext): Promise<void> {
    this.tickCount += 1;
    const timestamp = new Date().toISOString();

    await context.log(`Timer tick #${this.tickCount}`);
    await context.emitEvent(
      createEvent("timer.tick", {
        tick: this.tickCount,
        timestamp,
      }),
    );
  }

  async execute(
    _inputs: Record<string, any>,
    _context: NodeContext,
  ): Promise<Record<string, any>> {
    return {
      running: this.running,
      tickCount: this.tickCount,
      intervalMs: this.intervalMs,
      maxTicks: this.maxTicks,
    };
  }

  async teardown(): Promise<void> {
    this.running = false;
    // Background tasks are cancelled by the context's AbortControllers
  }
}
