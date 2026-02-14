function isNextDevPort(port: string): boolean {
  const value = Number(port);
  return Number.isInteger(value) && value >= 3000 && value <= 3010;
}

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== "undefined") {
    if (isNextDevPort(window.location.port)) {
      return "http://localhost:8001";
    }
    return window.location.origin;
  }

  return "http://localhost:8001";
}

export function getWsBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  if (typeof window !== "undefined") {
    if (isNextDevPort(window.location.port)) {
      return "ws://localhost:8001";
    }
    return window.location.origin.replace(/^http/, "ws");
  }

  return "ws://localhost:8001";
}

