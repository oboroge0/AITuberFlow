import { describe, it, expect, beforeEach } from "bun:test";
import {
  EventBus,
  EventFilter,
} from "../../apps/server-ts/src/engine/event-bus";
import type { Event } from "@aituber-flow/sdk";

function makeEvent(
  type: string,
  payload: Record<string, any> = {},
): Event {
  return { type, payload, timestamp: new Date().toISOString() };
}

// ─── TestEvent ──────────────────────────────────────────────────

describe("Event creation", () => {
  it("creates a minimal event", () => {
    const event = makeEvent("test.event");

    expect(event.type).toBe("test.event");
    expect(event.payload).toEqual({});
    expect(event.timestamp).toBeDefined();
    expect(event.sourceNodeId).toBeUndefined();
  });

  it("creates a full event with all fields", () => {
    const event: Event = {
      type: "message.received",
      payload: { text: "hello", author: "user1" },
      sourceNodeId: "node-42",
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe("message.received");
    expect(event.payload.text).toBe("hello");
    expect(event.payload.author).toBe("user1");
    expect(event.sourceNodeId).toBe("node-42");
    expect(event.timestamp).toBeDefined();
  });
});

// ─── TestEventFilter ────────────────────────────────────────────

describe("EventFilter", () => {
  it("matches exact event type", () => {
    const filter = new EventFilter("message.received");
    const event = makeEvent("message.received");

    expect(filter.matches(event)).toBe(true);
  });

  it("rejects non-matching exact event type", () => {
    const filter = new EventFilter("message.received");
    const event = makeEvent("message.sent");

    expect(filter.matches(event)).toBe(false);
  });

  it("matches suffix wildcard pattern", () => {
    const filter = new EventFilter("message.*");

    expect(filter.matches(makeEvent("message.received"))).toBe(true);
    expect(filter.matches(makeEvent("message.sent"))).toBe(true);
    expect(filter.matches(makeEvent("avatar.expression"))).toBe(false);
  });

  it("matches prefix wildcard pattern", () => {
    const filter = new EventFilter("*.received");

    expect(filter.matches(makeEvent("message.received"))).toBe(true);
    expect(filter.matches(makeEvent("chat.received"))).toBe(true);
    expect(filter.matches(makeEvent("message.sent"))).toBe(false);
  });

  it("evaluates string equality condition", () => {
    const filter = new EventFilter("*", 'event.author == "admin"');

    expect(
      filter.matches(makeEvent("test", { author: "admin" })),
    ).toBe(true);
    expect(
      filter.matches(makeEvent("test", { author: "user" })),
    ).toBe(false);
  });

  it("evaluates numeric comparison condition", () => {
    const filter = new EventFilter("*", "event.amount >= 100");

    expect(
      filter.matches(makeEvent("test", { amount: 150 })),
    ).toBe(true);
    expect(
      filter.matches(makeEvent("test", { amount: 50 })),
    ).toBe(false);
  });

  it("evaluates boolean condition", () => {
    const filter = new EventFilter("*", "event.is_member == true");

    expect(
      filter.matches(makeEvent("test", { is_member: true })),
    ).toBe(true);
    expect(
      filter.matches(makeEvent("test", { is_member: false })),
    ).toBe(false);
  });

  it("evaluates JavaScript logical operators (&&)", () => {
    const filter = new EventFilter(
      "*",
      "event.a === 1 && event.b === 2",
    );

    expect(
      filter.matches(makeEvent("test", { a: 1, b: 2 })),
    ).toBe(true);
    expect(
      filter.matches(makeEvent("test", { a: 1, b: 3 })),
    ).toBe(false);
  });

  it("returns false for condition referencing missing field", () => {
    const filter = new EventFilter(
      "*",
      'event.nonexistent == "value"',
    );

    expect(filter.matches(makeEvent("test", {}))).toBe(false);
  });

  it("returns false for condition with null resolution", () => {
    const filter = new EventFilter("*", "event.missing");

    expect(filter.matches(makeEvent("test", {}))).toBe(false);
  });
});

// ─── TestEventBus ───────────────────────────────────────────────

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("subscribe and emit delivers events to handlers", async () => {
    await bus.start();

    const received: Event[] = [];
    bus.subscribe("test.event", (event) => {
      received.push(event);
    });

    const event = makeEvent("test.event", { data: "hello" });
    const count = await bus.emit(event);

    expect(count).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0].payload.data).toBe("hello");
  });

  it("returns 0 when emitting while not running", async () => {
    const received: Event[] = [];
    bus.subscribe("test.event", (event) => {
      received.push(event);
    });

    const event = makeEvent("test.event");
    const count = await bus.emit(event);

    expect(count).toBe(0);
    expect(received).toHaveLength(0);
  });

  it("delivers events matching wildcard subscription", async () => {
    await bus.start();

    const received: Event[] = [];
    bus.subscribe("avatar.*", (event) => {
      received.push(event);
    });

    await bus.emit(makeEvent("avatar.expression"));
    await bus.emit(makeEvent("avatar.motion"));
    await bus.emit(makeEvent("audio.play"));

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe("avatar.expression");
    expect(received[1].type).toBe("avatar.motion");
  });

  it("unsubscribes by callback reference", async () => {
    await bus.start();

    const received: Event[] = [];
    const handler = (event: Event) => {
      received.push(event);
    };

    bus.subscribe("test.event", handler);
    await bus.emit(makeEvent("test.event"));
    expect(received).toHaveLength(1);

    bus.unsubscribe("test.event", handler);
    await bus.emit(makeEvent("test.event"));
    expect(received).toHaveLength(1);
  });

  it("unsubscribes by node ID", async () => {
    await bus.start();

    const received: Event[] = [];
    bus.subscribe(
      "test.event",
      (event) => {
        received.push(event);
      },
      undefined,
      "node-1",
    );

    await bus.emit(makeEvent("test.event"));
    expect(received).toHaveLength(1);

    bus.unsubscribe("test.event", undefined, "node-1");
    await bus.emit(makeEvent("test.event"));
    expect(received).toHaveLength(1);
  });

  it("clears all subscriptions", async () => {
    await bus.start();

    const received: Event[] = [];
    bus.subscribe("event.a", (event) => {
      received.push(event);
    });
    bus.subscribe("event.b", (event) => {
      received.push(event);
    });

    bus.clearSubscriptions();

    await bus.emit(makeEvent("event.a"));
    await bus.emit(makeEvent("event.b"));

    expect(received).toHaveLength(0);
  });

  it("clears subscriptions only for the specified node", async () => {
    await bus.start();

    const receivedNode1: Event[] = [];
    const receivedNode2: Event[] = [];

    bus.subscribe(
      "test.event",
      (event) => {
        receivedNode1.push(event);
      },
      undefined,
      "node-1",
    );
    bus.subscribe(
      "test.event",
      (event) => {
        receivedNode2.push(event);
      },
      undefined,
      "node-2",
    );

    bus.clearSubscriptions("node-1");

    await bus.emit(makeEvent("test.event"));

    expect(receivedNode1).toHaveLength(0);
    expect(receivedNode2).toHaveLength(1);
  });

  it("records and retrieves event history", async () => {
    await bus.start();

    await bus.emit(makeEvent("event.a", { value: 1 }));
    await bus.emit(makeEvent("event.b", { value: 2 }));
    await bus.emit(makeEvent("event.a", { value: 3 }));

    const allHistory = bus.getHistory(undefined, 10);
    expect(allHistory).toHaveLength(3);

    const filteredHistory = bus.getHistory("event.a");
    expect(filteredHistory).toHaveLength(2);
    expect(filteredHistory[0].payload.value).toBe(1);
    expect(filteredHistory[1].payload.value).toBe(3);
  });

  it("truncates event history at the configured limit", async () => {
    await bus.start();

    (bus as any)._maxHistory = 5;

    for (let i = 0; i < 10; i++) {
      await bus.emit(makeEvent("test.event", { index: i }));
    }

    const history = bus.getHistory(undefined, 100);
    expect(history).toHaveLength(5);
    expect(history[0].payload.index).toBe(5);
    expect(history[4].payload.index).toBe(9);
  });

  it("applies EventFilter array to subscriptions", async () => {
    await bus.start();

    const received: Event[] = [];
    const filters = [new EventFilter("*", "event.priority >= 5")];

    bus.subscribe(
      "test.event",
      (event) => {
        received.push(event);
      },
      filters,
    );

    await bus.emit(makeEvent("test.event", { priority: 10 }));
    await bus.emit(makeEvent("test.event", { priority: 2 }));
    await bus.emit(makeEvent("test.event", { priority: 5 }));

    expect(received).toHaveLength(2);
    expect(received[0].payload.priority).toBe(10);
    expect(received[1].payload.priority).toBe(5);
  });

  it("continues notifying other handlers when one throws", async () => {
    await bus.start();

    const received: Event[] = [];

    bus.subscribe("test.event", () => {
      throw new Error("handler explosion");
    });
    bus.subscribe("test.event", (event) => {
      received.push(event);
    });

    const count = await bus.emit(makeEvent("test.event"));

    expect(received).toHaveLength(1);
    expect(count).toBe(1);
  });

  it("delivers to multiple subscribers on the same event type", async () => {
    await bus.start();

    const receivedA: Event[] = [];
    const receivedB: Event[] = [];

    bus.subscribe("test.event", (event) => {
      receivedA.push(event);
    });
    bus.subscribe("test.event", (event) => {
      receivedB.push(event);
    });

    await bus.emit(makeEvent("test.event", { data: "shared" }));

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
    expect(receivedA[0].payload.data).toBe("shared");
    expect(receivedB[0].payload.data).toBe("shared");
  });
});

// ─── TestPatternMatching ────────────────────────────────────────

describe("Pattern matching (_patternMatches)", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  const patternMatches = (pattern: string, eventType: string): boolean =>
    (bus as any)._patternMatches(pattern, eventType);

  it("matches exact event type", () => {
    expect(patternMatches("test.event", "test.event")).toBe(true);
    expect(patternMatches("test.event", "other.event")).toBe(false);
  });

  it("matches all types with star wildcard", () => {
    expect(patternMatches("*", "test.event")).toBe(true);
    expect(patternMatches("*", "anything.at.all")).toBe(true);
    expect(patternMatches("*", "single")).toBe(true);
  });

  it("matches suffix wildcard", () => {
    expect(patternMatches("test.*", "test.event")).toBe(true);
    expect(patternMatches("test.*", "test.another")).toBe(true);
    expect(patternMatches("test.*", "other.event")).toBe(false);
  });

  it("matches prefix wildcard", () => {
    expect(patternMatches("*.event", "test.event")).toBe(true);
    expect(patternMatches("*.event", "other.event")).toBe(true);
    expect(patternMatches("*.event", "test.another")).toBe(false);
  });

  it("matches middle wildcard", () => {
    expect(patternMatches("a.*.c", "a.b.c")).toBe(true);
    expect(patternMatches("a.*.c", "a.x.c")).toBe(true);
    expect(patternMatches("a.*.c", "a.b.d")).toBe(false);
  });
});
