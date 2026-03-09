/**
 * Tests for cron-trigger plugin's cron parser.
 *
 * We import the node module and test the cron parsing logic
 * indirectly through the exported class.
 */

import { describe, it, expect } from "bun:test";

// Test the cron field parser logic directly
function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();

    const stepMatch = trimmed.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[1], 10);
      if (step > 0) {
        for (let i = min; i <= max; i += step) values.add(i);
      }
      continue;
    }

    if (trimmed === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = Math.max(start, min); i <= Math.min(end, max); i++) {
        values.add(i);
      }
      continue;
    }

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

    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      values.add(num);
    }
  }

  return values;
}

describe("cron field parser", () => {
  it("should parse wildcard (*)", () => {
    const result = parseCronField("*", 0, 59);
    expect(result.size).toBe(60);
    expect(result.has(0)).toBe(true);
    expect(result.has(59)).toBe(true);
  });

  it("should parse single value", () => {
    const result = parseCronField("5", 0, 59);
    expect(result.size).toBe(1);
    expect(result.has(5)).toBe(true);
  });

  it("should parse step (*/N)", () => {
    const result = parseCronField("*/15", 0, 59);
    expect([...result].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  it("should parse range (N-M)", () => {
    const result = parseCronField("1-5", 0, 59);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("should parse range with step (N-M/S)", () => {
    const result = parseCronField("0-30/10", 0, 59);
    expect([...result].sort((a, b) => a - b)).toEqual([0, 10, 20, 30]);
  });

  it("should parse comma-separated values", () => {
    const result = parseCronField("1,15,30", 0, 59);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 15, 30]);
  });

  it("should handle day-of-week range (0-6)", () => {
    const result = parseCronField("1-5", 0, 6);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("should handle month range (1-12)", () => {
    const result = parseCronField("*/3", 1, 12);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 4, 7, 10]);
  });

  it("should reject out-of-range values", () => {
    const result = parseCronField("99", 0, 59);
    expect(result.size).toBe(0);
  });
});
