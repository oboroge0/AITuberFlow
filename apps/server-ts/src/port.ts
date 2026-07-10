/**
 * Port resolution for the development / web-mode server.
 *
 * In desktop mode the Tauri host assigns a dynamic port and passes it via the
 * PORT env var, so there is never a conflict. In web mode (`bun run dev`) the
 * server binds a fixed default port and previously failed hard when it was
 * already taken. These helpers let the server fall back to the next free port
 * in a small range when PORT is not explicitly set.
 */

export const DEFAULT_PORT = 8001;
export const MAX_PORT = 8010;

/** A function that attempts to bind a port and returns whether it succeeded. */
export type PortProbe = (port: number, hostname: string) => boolean;

/**
 * Real port probe using Bun.serve: try to bind, immediately stop on success.
 *
 * Bun.serve throws synchronously with `code === "EADDRINUSE"` when the port is
 * taken (verified against Bun 1.3.x). Any other error is re-thrown so genuine
 * problems (e.g. permission denied) are not silently swallowed.
 */
export const bunPortProbe: PortProbe = (port, hostname) => {
  try {
    const probe = Bun.serve({ port, hostname, fetch: () => new Response(null) });
    probe.stop(true);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "EADDRINUSE") return false;
    throw err;
  }
};

/**
 * Find the first bindable port in [start, end] (inclusive), scanning upward.
 * Throws if none are available. `probe` is injectable for testing.
 */
export function findAvailablePort(
  start: number,
  end: number,
  hostname: string,
  probe: PortProbe = bunPortProbe,
): number {
  for (let p = start; p <= end; p++) {
    if (probe(p, hostname)) return p;
  }
  throw new Error(`No available port found in range ${start}-${end}`);
}

export interface ResolvedPort {
  /** The port the server will actually bind. */
  port: number;
  /** The default port (8001); lets clients detect that a switch happened. */
  defaultPort: number;
  /** True when the server ended up on a non-default port. */
  switched: boolean;
  /** True when the port came from an explicit PORT env var (no auto-switch). */
  explicit: boolean;
}

/**
 * Decide which port to bind.
 *
 * - Explicit `PORT` (non-empty): use it verbatim, never auto-switch. A bind
 *   failure later surfaces as a normal error, matching prior behavior.
 * - `reusePort` (set on `--hot` reloads via env) is reused so the port stays
 *   stable across hot reloads within the same process.
 * - Otherwise scan DEFAULT_PORT..MAX_PORT for the first free port.
 */
export function resolvePort(options: {
  portEnv?: string;
  reusePort?: string;
  hostname: string;
  probe?: PortProbe;
  start?: number;
  end?: number;
}): ResolvedPort {
  const { portEnv, reusePort, hostname, probe = bunPortProbe } = options;
  const start = options.start ?? DEFAULT_PORT;
  const end = options.end ?? MAX_PORT;

  if (portEnv !== undefined && portEnv.trim() !== "") {
    const parsed = Number(portEnv);
    const port = Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
    return { port, defaultPort: DEFAULT_PORT, switched: port !== DEFAULT_PORT, explicit: true };
  }

  if (reusePort !== undefined && reusePort.trim() !== "") {
    const parsed = Number(reusePort);
    if (Number.isFinite(parsed)) {
      return {
        port: parsed,
        defaultPort: DEFAULT_PORT,
        switched: parsed !== DEFAULT_PORT,
        explicit: false,
      };
    }
  }

  const port = findAvailablePort(start, end, hostname, probe);
  return { port, defaultPort: DEFAULT_PORT, switched: port !== DEFAULT_PORT, explicit: false };
}

/** Build the /health JSON payload including the resolved port information. */
export function healthPayload(port: number, defaultPort: number = DEFAULT_PORT) {
  return {
    status: "healthy",
    version: "2.0.0",
    runtime: "bun",
    port,
    defaultPort,
  } as const;
}
