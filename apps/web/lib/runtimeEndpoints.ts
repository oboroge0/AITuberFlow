/**
 * Runtime resolution of the backend API / WebSocket base URL.
 *
 * In production / desktop mode the frontend is served from the backend's own
 * origin, so `window.location.origin` is correct. In dev mode (Next.js on port
 * 3000-3010) the backend runs separately on port 8001 — but it may auto-switch
 * to 8002-8010 if 8001 is taken (see apps/server-ts/src/port.ts). We therefore
 * probe /health across the range once per session and cache the live port.
 *
 * The synchronous getters (getApiBaseUrl/getWsBaseUrl) stay synchronous for the
 * many existing call sites: they return the cached/last-known port, falling
 * back to 8001 before resolution completes. Call `ensureDevPortResolved()` (a
 * memoized, fire-once promise) at async entry points to guarantee the real port
 * is known before the first request/connection.
 */

const DEFAULT_PORT = 8001;
const MAX_PORT = 8010;
const PROBE_TIMEOUT_MS = 800;
const STORAGE_KEY = "aituber-flow-dev-port";

export interface PortResolution {
  /** The backend port currently in use. */
  port: number;
  /** The backend's default port (8001). */
  defaultPort: number;
  /** True when the backend is running on a non-default port. */
  switched: boolean;
}

let cachedPort: number | null = null;
let resolvePromise: Promise<PortResolution> | null = null;

function isNextDevPort(port: string): boolean {
  const value = Number(port);
  return Number.isInteger(value) && value >= 3000 && value <= 3010;
}

/** True only in the browser while served from a Next.js dev port. */
function inDevMode(): boolean {
  try {
    return typeof window !== "undefined" && !!window.location && isNextDevPort(window.location.port);
  } catch {
    return false;
  }
}

function readSessionPort(): number | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isInteger(n)) return n;
    }
  } catch {
    // sessionStorage unavailable (SSR / privacy mode)
  }
  return null;
}

function storeResolvedPort(port: number): void {
  cachedPort = port;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(port));
  } catch {
    // ignore
  }
}

/** Best-known dev backend port right now (cache → sessionStorage → default). */
function currentDevPort(): number {
  if (cachedPort !== null) return cachedPort;
  const stored = readSessionPort();
  if (stored !== null) {
    cachedPort = stored;
    return stored;
  }
  return DEFAULT_PORT;
}

/**
 * Resolve API base URL at runtime.
 *
 * IMPORTANT: Uses try/catch around `window` access to prevent
 * Turbopack/Next.js from statically evaluating and inlining the
 * fallback value during SSG/SSR builds.
 */
export function getApiBaseUrl(): string {
  try {
    if (window && window.location) {
      if (isNextDevPort(window.location.port)) {
        return `http://localhost:${currentDevPort()}`;
      }
      return window.location.origin;
    }
  } catch {
    // window not available during SSR/SSG
  }
  return `http://localhost:${DEFAULT_PORT}`;
}

export function getWsBaseUrl(): string {
  try {
    if (window && window.location) {
      if (isNextDevPort(window.location.port)) {
        return `ws://localhost:${currentDevPort()}`;
      }
      return window.location.origin.replace(/^http/, "ws");
    }
  } catch {
    // window not available during SSR/SSG
  }
  return `ws://localhost:${DEFAULT_PORT}`;
}

async function probeHealth(port: number): Promise<PortResolution | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { port?: number; defaultPort?: number };
    const actualPort = typeof data.port === "number" ? data.port : port;
    const defaultPort = typeof data.defaultPort === "number" ? data.defaultPort : DEFAULT_PORT;
    return { port: actualPort, defaultPort, switched: actualPort !== defaultPort };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveDevPort(): Promise<PortResolution> {
  // Verify a previously cached port first (fast path for reloads).
  const stored = readSessionPort();
  if (stored !== null) {
    const hit = await probeHealth(stored);
    if (hit) {
      storeResolvedPort(hit.port);
      return hit;
    }
  }

  for (let p = DEFAULT_PORT; p <= MAX_PORT; p++) {
    const hit = await probeHealth(p);
    if (hit) {
      storeResolvedPort(hit.port);
      return hit;
    }
  }

  // Nothing responded (backend down). Fall back to default; do not cache so a
  // later attempt can re-probe once the backend comes up.
  return { port: DEFAULT_PORT, defaultPort: DEFAULT_PORT, switched: false };
}

/**
 * Resolve the live backend port exactly once per page session. In production /
 * desktop mode this is a no-op (resolves immediately with the default). Safe to
 * call from many places — the underlying probe runs only once.
 */
export function ensureDevPortResolved(): Promise<PortResolution> {
  if (!inDevMode()) {
    return Promise.resolve({ port: DEFAULT_PORT, defaultPort: DEFAULT_PORT, switched: false });
  }
  if (!resolvePromise) {
    resolvePromise = resolveDevPort();
  }
  return resolvePromise;
}

/**
 * Synchronous snapshot of the resolution result for UI (e.g. the notification
 * bar). Returns null until `ensureDevPortResolved()` has completed.
 */
export function getResolvedPortInfo(): PortResolution | null {
  if (!inDevMode()) return null;
  if (cachedPort === null) return null;
  return { port: cachedPort, defaultPort: DEFAULT_PORT, switched: cachedPort !== DEFAULT_PORT };
}
