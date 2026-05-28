/**
 * Cron Trigger Node
 *
 * Triggers workflow execution based on a cron schedule.
 * Supports standard 5-field cron expressions:
 *   minute hour day-of-month month day-of-week
 *
 * Examples:
 *   "0 9 * * *"    → daily at 9:00
 *   "*/5 * * * *"  → every 5 minutes
 *   "0 9 * * 1"    → every Monday at 9:00
 */

import { InputNode } from "@aituber-flow/sdk";
import type { NodeContext } from "@aituber-flow/sdk";
import { createEvent } from "@aituber-flow/sdk";

/** Parse a single cron field into a set of matching values. */
function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();

    // */N  (step from min)
    const stepMatch = trimmed.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[1], 10);
      if (step > 0) {
        for (let i = min; i <= max; i += step) values.add(i);
      }
      continue;
    }

    // *  (all values)
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    // N-M  (range)
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = Math.max(start, min); i <= Math.min(end, max); i++) {
        values.add(i);
      }
      continue;
    }

    // N-M/S  (range with step)
    const rangeStepMatch = trimmed.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (rangeStepMatch) {
      const start = parseInt(rangeStepMatch[1], 10);
      const end = parseInt(rangeStepMatch[2], 10);
      const step = parseInt(rangeStepMatch[3], 10);
      if (step > 0) {
        for (let i = Math.max(start, min); i <= Math.min(end, max); i += step) {
          values.add(i);
        }
      }
      continue;
    }

    // N  (single value)
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      values.add(num);
    }
  }

  return values;
}

interface CronSchedule {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

function parseCron(expression: string): CronSchedule {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  return {
    minutes: parseCronField(fields[0], 0, 59),
    hours: parseCronField(fields[1], 0, 23),
    daysOfMonth: parseCronField(fields[2], 1, 31),
    months: parseCronField(fields[3], 1, 12),
    daysOfWeek: parseCronField(fields[4], 0, 6), // 0=Sunday
  };
}

function matchesCron(schedule: CronSchedule, date: Date): boolean {
  return (
    schedule.minutes.has(date.getMinutes()) &&
    schedule.hours.has(date.getHours()) &&
    schedule.daysOfMonth.has(date.getDate()) &&
    schedule.months.has(date.getMonth() + 1) &&
    schedule.daysOfWeek.has(date.getDay())
  );
}

function getNextCronTime(schedule: CronSchedule, from: Date): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Search up to 366 days ahead
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(schedule, next)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  // Fallback: 1 hour from now
  return new Date(from.getTime() + 3600_000);
}

export default class CronTriggerNode extends InputNode {
  private cronExpression: string = "0 * * * *";
  private enabled: boolean = true;
  private executionCount: number = 0;
  private running: boolean = false;
  private schedule: CronSchedule | null = null;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.cronExpression = config.cron ?? "0 * * * *";
    this.enabled = config.enabled ?? true;
    this.executionCount = 0;
    this.running = true;

    if (!this.enabled) {
      await context.log("Cron trigger is disabled");
      return;
    }

    try {
      this.schedule = parseCron(this.cronExpression);
    } catch (e) {
      await context.log(`Invalid cron expression: ${e}`, "error");
      return;
    }

    const nextRun = getNextCronTime(this.schedule, new Date());
    await context.log(
      `Cron configured: "${this.cronExpression}" — next run: ${nextRun.toLocaleString()}`,
    );

    context.createTask((signal) => this.cronLoop(signal, context));
  }

  private async cronLoop(
    signal: AbortSignal,
    context: NodeContext,
  ): Promise<void> {
    if (!this.schedule) return;

    while (!signal.aborted && this.running) {
      const now = new Date();
      const nextRun = getNextCronTime(this.schedule, now);
      const delayMs = nextRun.getTime() - now.getTime();

      // Wait until the next cron time
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, Math.max(delayMs, 1000));
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

      // Verify we're at the right time (within 30s tolerance)
      const currentTime = new Date();
      if (matchesCron(this.schedule, currentTime)) {
        await this.emitTick(context);

        // Wait until the current minute passes to avoid double-firing
        const remainingMs = 60_000 - (currentTime.getSeconds() * 1000 + currentTime.getMilliseconds());
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, remainingMs + 1000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
  }

  private async emitTick(context: NodeContext): Promise<void> {
    this.executionCount += 1;
    const timestamp = new Date().toISOString();

    await context.log(
      `Cron fired #${this.executionCount} at ${new Date().toLocaleString()}`,
    );
    await context.emitEvent(
      createEvent("timer.tick", {
        tick: this.executionCount,
        timestamp,
        cronExpression: this.cronExpression,
      }),
    );
  }

  async execute(
    _inputs: Record<string, any>,
    _context: NodeContext,
  ): Promise<Record<string, any>> {
    return {
      timestamp: new Date().toISOString(),
      executionCount: this.executionCount,
    };
  }

  async teardown(): Promise<void> {
    this.running = false;
  }
}
