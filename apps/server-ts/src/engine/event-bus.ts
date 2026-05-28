/**
 * Event Bus for AITuberFlow
 *
 * Manages event routing between nodes with support for
 * wildcard pattern matching and safe condition filtering.
 */

import type { Event } from "@aituber-flow/sdk";
export type { Event } from "@aituber-flow/sdk";

// ─── EventFilter ─────────────────────────────────────────────────

/**
 * Defines a filter for events.
 * Supports wildcard patterns (e.g. "message.*") and
 * safe condition expressions (e.g. "event.amount > 100").
 */
export class EventFilter {
  readonly event: string;
  readonly condition?: string;

  constructor(event: string, condition?: string) {
    this.event = event;
    this.condition = condition;
  }

  matches(event: Event): boolean {
    if (!this._matchPattern(event.type)) return false;
    if (this.condition) return this._checkCondition(event);
    return true;
  }

  /**
   * Match event type against pattern (supports wildcards).
   * "message.*" matches "message.received", "message.sent", etc.
   */
  private _matchPattern(eventType: string): boolean {
    const pattern = this.event;
    if (!pattern.includes("*")) return pattern === eventType;

    const regex = new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`);
    return regex.test(eventType);
  }

  /**
   * Check a condition expression against event payload.
   *
   * Safely parses simple comparison expressions using manual parsing.
   * Supports: event.field references, comparison operators
   * (==, !=, >, <, >=, <=), logical operators (and/&&, or/||).
   */
  private _checkCondition(event: Event): boolean {
    if (!this.condition) return true;

    try {
      // Normalize logical operators
      const normalized = this.condition.replace(/\band\b/g, "&&").replace(/\bor\b/g, "||");

      // Split on logical operators and check each clause
      return this._parseLogical(normalized, event);
    } catch {
      return false;
    }
  }

  /**
   * Parse a logical expression (handles && and ||).
   */
  private _parseLogical(expr: string, event: Event): boolean {
    // Handle || (lowest precedence)
    const orParts = this._splitOnOperator(expr, "||");
    if (orParts.length > 1) {
      return orParts.some((part) => this._parseLogical(part, event));
    }

    // Handle && (higher precedence)
    const andParts = this._splitOnOperator(expr, "&&");
    if (andParts.length > 1) {
      return andParts.every((part) => this._parseLogical(part, event));
    }

    // Single comparison
    return this._parseComparison(expr.trim(), event);
  }

  /**
   * Split expression on an operator, respecting quoted strings.
   */
  private _splitOnOperator(expr: string, op: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inString = false;
    let stringChar = "";
    let current = "";

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];

      if (inString) {
        current += char;
        if (char === stringChar) inString = false;
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        current += char;
        continue;
      }

      if (char === "(") depth++;
      if (char === ")") depth--;

      if (depth === 0 && expr.slice(i, i + op.length) === op) {
        parts.push(current);
        current = "";
        i += op.length - 1;
        continue;
      }

      current += char;
    }

    parts.push(current);
    return parts;
  }

  /**
   * Parse a single comparison expression (e.g. "event.amount > 100").
   */
  private _parseComparison(expr: string, event: Event): boolean {
    // Match: value operator value
    const match = expr.match(/^\s*(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+?)\s*$/);
    if (!match) {
      // Try as a single truthy value
      const val = this._resolveValue(expr.trim(), event);
      return Boolean(val);
    }

    const [, leftRaw, operator, rightRaw] = match;
    const left = this._resolveValue(leftRaw, event);
    const right = this._resolveValue(rightRaw, event);

    switch (operator) {
      case "==":
      case "===":
        return left === right;
      case "!=":
      case "!==":
        return left !== right;
      case ">":
        return Number(left) > Number(right);
      case "<":
        return Number(left) < Number(right);
      case ">=":
        return Number(left) >= Number(right);
      case "<=":
        return Number(left) <= Number(right);
      default:
        return false;
    }
  }

  /**
   * Resolve a value reference against the event.
   * Handles: event.field paths, string literals, numbers, booleans.
   */
  private _resolveValue(raw: string, event: Event): string | number | boolean | null {
    const trimmed = raw.trim();

    // String literal
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    // Boolean literals
    if (trimmed === "true" || trimmed === "True") return true;
    if (trimmed === "false" || trimmed === "False") return false;

    // Null
    if (trimmed === "null" || trimmed === "None") return null;

    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

    // Event payload property path (e.g. "event.amount" or "event.user.name")
    if (trimmed.startsWith("event.")) {
      const path = trimmed.slice(6); // strip "event."
      return this._resolvePath(event.payload, path);
    }

    // Bare string fallback
    return trimmed;
  }

  /**
   * Safely resolve a dot-separated property path on an object.
   */
  private _resolvePath(
    obj: Record<string, unknown>,
    path: string,
  ): string | number | boolean | null {
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[part];
    }
    if (current == null) return null;
    if (
      typeof current === "string" ||
      typeof current === "number" ||
      typeof current === "boolean"
    ) {
      return current;
    }
    return null;
  }
}

// ─── Subscription ────────────────────────────────────────────────

export interface Subscription {
  callback: (event: Event) => void | Promise<void>;
  filters: EventFilter[];
  nodeId?: string;
}

// ─── EventBus ────────────────────────────────────────────────────

/**
 * Event bus for managing workflow events.
 * Supports event filtering and wildcard pattern matching.
 */
export class EventBus {
  private _subscriptions: Map<string, Subscription[]> = new Map();
  private _running = false;
  private _eventHistory: Event[] = [];
  private _maxHistory = 100;

  async start(): Promise<void> {
    this._running = true;
    this._eventHistory = [];
  }

  async stop(): Promise<void> {
    this._running = false;
  }

  /**
   * Subscribe to an event type with optional filters.
   *
   * @param eventType - Event type pattern (supports wildcards)
   * @param callback  - Async or sync callback
   * @param filters   - Optional additional filters
   * @param nodeId    - Optional node ID for tracking
   * @returns Subscription ID
   */
  subscribe(
    eventType: string,
    callback: (event: Event) => void | Promise<void>,
    filters?: EventFilter[],
    nodeId?: string,
  ): string {
    if (!this._subscriptions.has(eventType)) {
      this._subscriptions.set(eventType, []);
    }

    const subs = this._subscriptions.get(eventType);
    if (!subs) return "";
    subs.push({ callback, filters: filters ?? [], nodeId });

    return `${eventType}:${subs.length - 1}`;
  }

  /**
   * Unsubscribe from an event type by callback or nodeId.
   */
  unsubscribe(
    eventType: string,
    callback?: (event: Event) => void | Promise<void>,
    nodeId?: string,
  ): void {
    const subs = this._subscriptions.get(eventType);
    if (!subs) return;

    if (callback) {
      this._subscriptions.set(
        eventType,
        subs.filter((s) => s.callback !== callback),
      );
    } else if (nodeId) {
      this._subscriptions.set(
        eventType,
        subs.filter((s) => s.nodeId !== nodeId),
      );
    }
  }

  /**
   * Emit an event to all matching subscribers.
   *
   * @returns Number of subscribers notified
   */
  async emit(event: Event): Promise<number> {
    if (!this._running) return 0;

    // Store in history
    this._eventHistory.push(event);
    if (this._eventHistory.length > this._maxHistory) {
      this._eventHistory = this._eventHistory.slice(-this._maxHistory);
    }

    let notified = 0;

    for (const [pattern, subscriptions] of this._subscriptions) {
      if (!this._patternMatches(pattern, event.type)) continue;

      for (const sub of subscriptions) {
        if (sub.filters.length > 0) {
          if (!sub.filters.every((f) => f.matches(event))) continue;
        }

        try {
          await sub.callback(event);
          notified++;
        } catch (err) {
          console.error(`Error in event handler for ${event.type}:`, err);
        }
      }
    }

    return notified;
  }

  /**
   * Check if a subscription pattern matches an event type.
   */
  private _patternMatches(pattern: string, eventType: string): boolean {
    if (pattern === "*") return true;
    if (!pattern.includes("*")) return pattern === eventType;

    const regex = new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`);
    return regex.test(eventType);
  }

  /**
   * Clear subscriptions, optionally for a specific node.
   */
  clearSubscriptions(nodeId?: string): void {
    if (nodeId) {
      for (const [eventType, subs] of this._subscriptions) {
        this._subscriptions.set(
          eventType,
          subs.filter((s) => s.nodeId !== nodeId),
        );
      }
    } else {
      this._subscriptions.clear();
    }
  }

  /**
   * Get recent event history, optionally filtered by type.
   */
  getHistory(eventType?: string, limit = 10): Event[] {
    const events = eventType
      ? this._eventHistory.filter((e) => e.type === eventType)
      : this._eventHistory;
    return events.slice(-limit);
  }
}

/** Global event bus instance */
export const eventBus = new EventBus();
