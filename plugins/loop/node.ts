/**
 * Loop Node
 *
 * Iterates execution a specified number of times or while a condition is true.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

type ConditionOperand = string | number | boolean | null;

function parseConditionOperand(token: string): ConditionOperand {
  const trimmed = token.trim();

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;

  const num = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(num)) {
    return num;
  }

  return trimmed;
}

function compareCondition(
  left: ConditionOperand,
  operator: string,
  right: ConditionOperand,
): boolean {
  switch (operator) {
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case "==":
      return left == right;
    case "!=":
      return left != right;
    case ">":
      return Number(left) > Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<":
      return Number(left) < Number(right);
    case "<=":
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

function evaluateSafeCondition(
  template: string,
  inputValue: unknown,
  iteration: number,
): boolean {
  const condition = template
    .replace(/\{\{value\}\}/g, JSON.stringify(inputValue ?? null))
    .replace(/\{\{iteration\}\}/g, String(iteration))
    .trim();

  if (!condition) return false;
  if (condition === "true") return true;
  if (condition === "false") return false;

  const match = condition.match(
    /^(?<left>.+?)\s*(===|!==|>=|<=|==|!=|>|<)\s*(?<right>.+)$/u,
  );
  if (!match?.groups) {
    throw new Error(
      "Unsupported condition format. Use {{value}}/{{iteration}} with comparison operators.",
    );
  }

  const left = parseConditionOperand(match.groups.left);
  const right = parseConditionOperand(match.groups.right);
  return compareCondition(left, match[2], right);
}

export default class LoopNode extends BaseNode {
  private mode = "count";
  private count = 3;
  private condition = "";
  private maxIterations = 100;
  private currentIteration = 0;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.mode = config.mode ?? "count";
    this.count = config.count ?? 3;
    this.condition = config.condition ?? "";
    this.maxIterations = config.maxIterations ?? 100;
    this.currentIteration = 0;

    await context.log(
      `Loop node initialized: mode=${this.mode}, count=${this.count}`,
    );
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const inputValue = inputs.input ?? inputs.loopback;

    this.currentIteration += 1;

    // Check safety limit
    if (this.currentIteration > this.maxIterations) {
      await context.log(
        `Loop reached max iterations (${this.maxIterations})`,
        "warning",
      );
      return { done: inputValue, loop: null };
    }

    let shouldContinue = false;

    if (this.mode === "count") {
      shouldContinue = this.currentIteration <= this.count;
    } else if (this.mode === "while") {
      try {
        shouldContinue = evaluateSafeCondition(
          this.condition,
          inputValue,
          this.currentIteration,
        );
      } catch (e) {
        await context.log(`Condition evaluation error: ${e}`, "error");
        shouldContinue = false;
      }
    } else if (this.mode === "infinite") {
      shouldContinue = true;
    }

    await context.log(
      `Loop iteration ${this.currentIteration}: continue=${shouldContinue}`,
    );

    // Emit loop event
    await context.emitEvent(
      createEvent("loop.iteration", {
        iteration: this.currentIteration,
        continue: shouldContinue,
        value: inputValue,
      }),
    );

    if (shouldContinue) {
      return { loop: inputValue, done: null };
    } else {
      // Reset for next run
      this.currentIteration = 0;
      return { done: inputValue, loop: null };
    }
  }

  async teardown(): Promise<void> {
    // Reset iteration counter.
    this.currentIteration = 0;
  }
}
