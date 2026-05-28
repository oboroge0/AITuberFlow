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
 *
 * Timezone support uses the IANA timezone database via Intl.DateTimeFormat.
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

/**
 * Get the local time parts (minute/hour/date/month/weekday) in the given IANA timezone.
 * Falls back to system local time if the timezone is empty or invalid.
 */
function getTimeParts(
  date: Date,
  timezone: string,
): { minute: number; hour: number; day: number; month: number; weekday: number } {
  try {
    const tz = timezone || undefined;
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      minute: "numeric",
      hour: "numeric",
      day: "numeric",
      month: "numeric",
      weekday: "narrow",
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(date).map((p) => [p.type, p.value]),
    );
    // Intl weekday narrow: Sun=Su, Mon=Mo, Tue=Tu, Wed=We, Thu=Th, Fri=Fr, Sat=Sa
    const weekdayMap: Record<string, number> = {
      Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
    };
    return {
      minute: parseInt(parts.minute, 10),
      hour: parseInt(parts.hour, 10) % 24, // 24:xx → 0:xx
      day: parseInt(parts.day, 10),
      month: parseInt(parts.month, 10),
      weekday: weekdayMap[parts.weekday] ?? date.getDay(),
    };
  } catch {
    // Invalid timezone — fall back to system local
    return {
      minute: date.getMinutes(),
      hour: date.getHours(),
      day: date.getDate(),
      month: date.getMonth() + 1,
      weekday: date.getDay(),
    };
  }
}

function matchesCron(schedule: CronSchedule, date: Date, timezone: string): boolean {
  const { minute, hour, day, month, weekday } = getTimeParts(date, timezone);
  return (
    schedule.minutes.has(minute) &&
    schedule.hours.has(hour) &&
    schedule.daysOfMonth.has(day) &&
    schedule.months.has(month) &&
    schedule.daysOfWeek.has(weekday)
  );
}

function getNextCronTime(schedule: CronSchedule, from: Date, timezone: string): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Search up to 366 days ahead
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(schedule, next, timezone)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  // Fallback: 1 hour from now
  return new Date(from.getTime() + 3600_000);
}

export default class CronTriggerNode extends InputNode {
  private cronExpression: string = "0 * * * *";
  private timezone: string = "";
  private enabled: boolean = true;
  private executionCount: number = 0;
  private running: boolean = false;
  private schedule: CronSchedule | null = null;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.cronExpression = config.cron ?? "0 * * * *";
    this.timezone = config.timezone ?? "";
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

    const tzLabel = this.timezone || "system local";
    const nextRun = getNextCronTime(this.schedule, new Date(), this.timezone);
    await context.log(
      `Cron configured: "${this.cronExpression}" (timezone: ${tzLabel}) — next run: ${nextRun.toLocaleString()}`,
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
      const nextRun = getNextCronTime(this.schedule, now, this.timezone);
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
      if (matchesCron(this.schedule, currentTime, this.timezone)) {
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
        executionCount: this.executionCount,
        timestamp,
        cronExpression: this.cronExpression,
        timezone: this.timezone || null,
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
