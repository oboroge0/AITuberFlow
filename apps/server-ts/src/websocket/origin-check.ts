/**
 * WebSocket Origin validation.
 *
 * Browsers attach an Origin header to WebSocket handshakes, but CORS does
 * NOT apply to WebSocket connections — without an explicit check, JavaScript
 * on any web page the user visits can open ws://127.0.0.1:8001/ws and send
 * commands such as workflow_stop. This module rejects handshakes whose
 * Origin is present but not in the allowlist.
 *
 * Requests without an Origin header (native clients, CLI tools, health
 * probes) are allowed: this check defends against browser-mediated
 * cross-site connections, not local processes, which can connect regardless.
 */

import type { Context, Next } from "hono";

/**
 * Build the WS origin allowlist from the HTTP CORS allowlist plus the
 * server's own origin (desktop mode serves the UI from the sidecar itself).
 */
export function buildAllowedWsOrigins(corsOrigins: string[], port: number): Set<string> {
  const origins = new Set<string>();
  for (const origin of corsOrigins) {
    origins.add(origin.toLowerCase());
  }
  origins.add(`http://localhost:${port}`);
  origins.add(`http://127.0.0.1:${port}`);
  // Tauri WebView origins (kept for safety even though the desktop app
  // currently loads the UI over http://localhost — see PR #280).
  origins.add("tauri://localhost");
  origins.add("https://tauri.localhost");
  return origins;
}

/**
 * True when the handshake may proceed: no Origin header, or an Origin
 * present in the allowlist. `Origin: null` (file:// pages, sandboxed
 * iframes) is rejected.
 */
export function isAllowedWsOrigin(origin: string | undefined, allowed: Set<string>): boolean {
  if (origin === undefined) return true;
  return allowed.has(origin.toLowerCase());
}

/** Hono middleware rejecting WS upgrade requests from disallowed origins. */
export function createWsOriginGuard(allowed: Set<string>) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header("origin");
    if (!isAllowedWsOrigin(origin, allowed)) {
      console.warn(`[ws] rejected WebSocket handshake from disallowed origin: ${origin}`);
      return c.text("Forbidden: origin not allowed", 403);
    }
    await next();
  };
}
