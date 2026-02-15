function isNextDevPort(port: string): boolean {
  const value = Number(port);
  return Number.isInteger(value) && value >= 3000 && value <= 3010;
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
        return "http://localhost:8001";
      }
      return window.location.origin;
    }
  } catch {
    // window not available during SSR/SSG
  }
  return "http://localhost:8001";
}

export function getWsBaseUrl(): string {
  try {
    if (window && window.location) {
      if (isNextDevPort(window.location.port)) {
        return "ws://localhost:8001";
      }
      return window.location.origin.replace(/^http/, "ws");
    }
  } catch {
    // window not available during SSR/SSG
  }
  return "ws://localhost:8001";
}
