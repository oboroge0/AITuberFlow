/**
 * Port resolution tests (apps/server-ts/src/port.ts).
 *
 * Covers the auto-switch scan, the "explicit PORT never switches" contract,
 * hot-reload reuse, and the /health payload shape. The port-scan logic takes an
 * injectable probe so most tests run without binding real sockets; one
 * integration test exercises the real Bun.serve probe against an occupied port.
 */

import { describe, it, expect, afterEach } from "bun:test";
import {
  findAvailablePort,
  resolvePort,
  healthPayload,
  bunPortProbe,
  DEFAULT_PORT,
  MAX_PORT,
  type PortProbe,
} from "../../apps/server-ts/src/port";

// A probe that treats the given set of ports as "in use".
function probeExcept(occupied: Set<number>): PortProbe {
  return (port) => !occupied.has(port);
}

describe("findAvailablePort", () => {
  it("returns the first free port, skipping occupied ones", () => {
    const probe = probeExcept(new Set([8001, 8002]));
    expect(findAvailablePort(8001, 8010, "127.0.0.1", probe)).toBe(8003);
  });

  it("returns the start port when it is free", () => {
    const probe = probeExcept(new Set());
    expect(findAvailablePort(8001, 8010, "127.0.0.1", probe)).toBe(8001);
  });

  it("throws when the whole range is occupied", () => {
    const all = new Set<number>();
    for (let p = 8001; p <= 8010; p++) all.add(p);
    const probe = probeExcept(all);
    expect(() => findAvailablePort(8001, 8010, "127.0.0.1", probe)).toThrow(/No available port/);
  });
});

describe("resolvePort", () => {
  it("uses an explicit PORT verbatim and never scans", () => {
    const probe: PortProbe = () => {
      throw new Error("probe must not be called when PORT is explicit");
    };
    const result = resolvePort({ portEnv: "9000", hostname: "127.0.0.1", probe });
    expect(result).toEqual({ port: 9000, defaultPort: 8001, switched: true, explicit: true });
  });

  it("treats an explicit default PORT as not switched", () => {
    const probe: PortProbe = () => {
      throw new Error("probe must not be called");
    };
    const result = resolvePort({ portEnv: "8001", hostname: "127.0.0.1", probe });
    expect(result).toEqual({ port: 8001, defaultPort: 8001, switched: false, explicit: true });
  });

  it("scans for a free port when PORT is unset (default free)", () => {
    const probe = probeExcept(new Set());
    const result = resolvePort({ hostname: "127.0.0.1", probe });
    expect(result).toEqual({ port: 8001, defaultPort: 8001, switched: false, explicit: false });
  });

  it("auto-switches to the next free port when 8001 is taken", () => {
    const probe = probeExcept(new Set([8001]));
    const result = resolvePort({ hostname: "127.0.0.1", probe });
    expect(result).toEqual({ port: 8002, defaultPort: 8001, switched: true, explicit: false });
  });

  it("reuses the hot-reload port without probing", () => {
    const probe: PortProbe = () => {
      throw new Error("probe must not be called when reusePort is set");
    };
    const result = resolvePort({ reusePort: "8003", hostname: "127.0.0.1", probe });
    expect(result).toEqual({ port: 8003, defaultPort: 8001, switched: true, explicit: false });
  });

  it("ignores an empty PORT string and scans instead", () => {
    const probe = probeExcept(new Set([8001, 8002]));
    const result = resolvePort({ portEnv: "", hostname: "127.0.0.1", probe });
    expect(result.port).toBe(8003);
    expect(result.explicit).toBe(false);
  });
});

describe("healthPayload", () => {
  it("includes the actual port and defaultPort", () => {
    expect(healthPayload(8002)).toEqual({
      status: "healthy",
      version: "2.0.0",
      runtime: "bun",
      port: 8002,
      defaultPort: 8001,
    });
  });

  it("defaults defaultPort to 8001", () => {
    expect(healthPayload(8001).defaultPort).toBe(DEFAULT_PORT);
  });
});

describe("bunPortProbe (integration)", () => {
  let occupied: ReturnType<typeof Bun.serve> | null = null;

  afterEach(() => {
    occupied?.stop(true);
    occupied = null;
  });

  it("skips a genuinely occupied port and picks the next", () => {
    // Occupy DEFAULT_PORT with a real server, then let the real probe scan.
    occupied = Bun.serve({ port: DEFAULT_PORT, hostname: "127.0.0.1", fetch: () => new Response("x") });
    const chosen = findAvailablePort(DEFAULT_PORT, MAX_PORT, "127.0.0.1", bunPortProbe);
    expect(chosen).toBeGreaterThan(DEFAULT_PORT);
    expect(chosen).toBeLessThanOrEqual(MAX_PORT);
  });
});
