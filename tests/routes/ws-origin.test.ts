/**
 * WebSocket Origin validation - Tests
 *
 * CORS does not apply to WebSocket handshakes, so the server validates the
 * Origin header explicitly before upgrading. These tests cover the
 * allowlist construction, the predicate, and the Hono middleware guard
 * (via `app.request()`, no running server needed).
 */

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  buildAllowedWsOrigins,
  createWsOriginGuard,
  isAllowedWsOrigin,
} from "../../apps/server-ts/src/websocket/origin-check";

const CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

describe("buildAllowedWsOrigins", () => {
  it("includes CORS origins, the server's own origin, and Tauri origins", () => {
    const allowed = buildAllowedWsOrigins(CORS_ORIGINS, 8001);
    expect(allowed.has("http://localhost:3000")).toBe(true);
    expect(allowed.has("http://127.0.0.1:3000")).toBe(true);
    expect(allowed.has("http://localhost:8001")).toBe(true);
    expect(allowed.has("http://127.0.0.1:8001")).toBe(true);
    expect(allowed.has("tauri://localhost")).toBe(true);
    expect(allowed.has("https://tauri.localhost")).toBe(true);
  });

  it("normalizes CORS origins to lowercase", () => {
    const allowed = buildAllowedWsOrigins(["http://LocalHost:3000"], 8001);
    expect(allowed.has("http://localhost:3000")).toBe(true);
  });
});

describe("isAllowedWsOrigin", () => {
  const allowed = buildAllowedWsOrigins(CORS_ORIGINS, 8001);

  it("allows requests without an Origin header (native clients)", () => {
    expect(isAllowedWsOrigin(undefined, allowed)).toBe(true);
  });

  it("allows allowlisted origins regardless of case", () => {
    expect(isAllowedWsOrigin("http://localhost:3000", allowed)).toBe(true);
    expect(isAllowedWsOrigin("HTTP://LOCALHOST:3000", allowed)).toBe(true);
  });

  it("rejects cross-site origins", () => {
    expect(isAllowedWsOrigin("https://evil.example.com", allowed)).toBe(false);
  });

  it("rejects Origin: null (file:// pages, sandboxed iframes)", () => {
    expect(isAllowedWsOrigin("null", allowed)).toBe(false);
  });

  it("rejects lookalike origins (prefix/suffix tricks)", () => {
    expect(isAllowedWsOrigin("http://localhost:3000.evil.example.com", allowed)).toBe(false);
    expect(isAllowedWsOrigin("http://evil-localhost:3000", allowed)).toBe(false);
  });
});

describe("createWsOriginGuard middleware", () => {
  function buildApp(): Hono {
    const app = new Hono();
    const allowed = buildAllowedWsOrigins(CORS_ORIGINS, 8001);
    app.get("/ws", createWsOriginGuard(allowed), (c) => c.text("upgraded"));
    return app;
  }

  it("passes through requests without an Origin header", async () => {
    const res = await buildApp().request("/ws");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("upgraded");
  });

  it("passes through requests from allowlisted origins", async () => {
    const res = await buildApp().request("/ws", {
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects requests from disallowed origins with 403", async () => {
    const res = await buildApp().request("/ws", {
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("origin not allowed");
  });
});
