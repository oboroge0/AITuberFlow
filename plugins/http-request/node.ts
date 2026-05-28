/**
 * HTTP Request Node
 *
 * Makes HTTP requests to external APIs.
 */

import { BaseNode, type NodeContext } from "@aituber-flow/sdk";

/** Default maximum number of redirects to follow. */
const DEFAULT_MAX_REDIRECTS = 5;
/** Default maximum response body size in bytes (50 MB). */
const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

/**
 * Return true if the hostname points to a loopback, link-local, or RFC1918
 * private address. Used to block SSRF attempts by default.
 */
function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host === "ip6-localhost" || host === "ip6-loopback") return true;
  if (host === "0.0.0.0" || host === "::" || host === "::0") return true;

  // IPv4 literals
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local (incl. AWS metadata 169.254.169.254)
    if (a === 0) return true; // "this network"
    if (a >= 224) return true; // multicast/reserved
  }

  // IPv6 literals
  if (host === "::1") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique local
  if (host.startsWith("fe80")) return true; // link-local
  if (host.startsWith("::ffff:")) {
    // IPv4-mapped IPv6
    const mapped = host.slice(7);
    if (mapped.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)) {
      return isPrivateOrLoopbackHost(mapped);
    }
  }

  return false;
}

export default class HttpRequestNode extends BaseNode {
  private url = "";
  private method = "GET";
  private headers: Record<string, string> = {};
  private timeout = 30000;
  private allowPrivateHosts = false;
  private maxRedirects = DEFAULT_MAX_REDIRECTS;
  private maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.url = config.url ?? "";
    this.method = config.method ?? "GET";
    this.timeout = config.timeout ?? 30000;
    this.allowPrivateHosts = config.allowPrivateHosts === true;
    this.maxRedirects =
      typeof config.maxRedirects === "number" && config.maxRedirects >= 0
        ? Math.min(config.maxRedirects, 20)
        : DEFAULT_MAX_REDIRECTS;
    this.maxResponseBytes =
      typeof config.maxResponseBytes === "number" && config.maxResponseBytes > 0
        ? config.maxResponseBytes
        : DEFAULT_MAX_RESPONSE_BYTES;

    // Parse headers from JSON string
    const headersStr = config.headers ?? "{}";
    try {
      this.headers = headersStr ? JSON.parse(headersStr) : {};
    } catch {
      this.headers = {};
      await context.log(
        "Invalid headers JSON, using empty headers",
        "warning",
      );
    }

    await context.log(`HTTP Request configured: ${this.method} ${this.url}`);
  }

  /**
   * Validate a URL's scheme and reject SSRF targets unless explicitly allowed.
   * Returns an error string if rejected, null if OK.
   */
  private validateUrl(rawUrl: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return "Invalid URL";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `Unsupported protocol: ${parsed.protocol}`;
    }
    if (!this.allowPrivateHosts && isPrivateOrLoopbackHost(parsed.hostname)) {
      return `Refusing to connect to private/loopback host "${parsed.hostname}" (set allowPrivateHosts to enable)`;
    }
    return null;
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    if (!this.url) {
      await context.log("No URL configured", "error");
      return { response: null, status: 0 };
    }

    const body = inputs.body ?? undefined;

    await context.log(`Sending ${this.method} request to ${this.url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const buildOptions = (method: string, includeBody: boolean): RequestInit => {
        const opts: RequestInit = {
          method,
          headers: { ...this.headers },
          signal: controller.signal,
          redirect: "manual",
        };
        if (
          includeBody &&
          body !== undefined &&
          ["POST", "PUT", "PATCH"].includes(method)
        ) {
          if (typeof body === "object") {
            opts.body = JSON.stringify(body);
            const headerKeys = Object.keys(this.headers).map((k) => k.toLowerCase());
            if (!headerKeys.includes("content-type")) {
              (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
            }
          } else {
            opts.body = String(body);
          }
        }
        return opts;
      };

      // Manual redirect handling so we can enforce a hop cap and re-validate each target
      let currentUrl = this.url;
      let currentMethod = this.method;
      let response: Response | null = null;

      for (let hop = 0; hop <= this.maxRedirects; hop++) {
        const validationError = this.validateUrl(currentUrl);
        if (validationError) {
          clearTimeout(timeoutId);
          await context.log(validationError, "error");
          return { response: null, status: 0 };
        }

        const isFirstHop = hop === 0;
        response = await fetch(currentUrl, buildOptions(currentMethod, isFirstHop));

        if (response.status < 300 || response.status >= 400) break;

        const location = response.headers.get("location");
        if (!location) break;

        if (hop === this.maxRedirects) {
          clearTimeout(timeoutId);
          await context.log(`Exceeded max redirects (${this.maxRedirects})`, "error");
          return { response: null, status: 0 };
        }

        // Per RFC 7231: 301/302/303 convert to GET for cross-method redirects
        if (
          (response.status === 301 || response.status === 302 || response.status === 303) &&
          currentMethod !== "GET" &&
          currentMethod !== "HEAD"
        ) {
          currentMethod = "GET";
        }
        currentUrl = new URL(location, currentUrl).toString();
      }

      clearTimeout(timeoutId);

      if (!response) {
        await context.log("No response received", "error");
        return { response: null, status: 0 };
      }

      const status = response.status;

      // Enforce response body size limit via Content-Length and streaming read
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
      if (Number.isFinite(contentLength) && contentLength > this.maxResponseBytes) {
        await context.log(
          `Response body too large: ${contentLength} > ${this.maxResponseBytes}`,
          "error",
        );
        return { response: null, status };
      }

      const text = await this.readLimitedText(response);

      let data: unknown = text;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch {
          // keep as text
        }
      } else {
        // Opportunistic JSON parse for servers with wrong content-type
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      await context.log(`Response received: ${status}`);
      return { response: data, status };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        await context.log(
          `Request timed out after ${this.timeout}ms`,
          "error",
        );
        return { response: null, status: 0 };
      }
      if (e instanceof Error && e.message === "Response body exceeded limit") {
        await context.log(
          `Response body exceeded ${this.maxResponseBytes} bytes`,
          "error",
        );
        return { response: null, status: 0 };
      }
      await context.log(`Request failed: ${String(e)}`, "error");
      return { response: null, status: 0 };
    }
  }

  /**
   * Read the response body as text while enforcing the maxResponseBytes cap.
   * Aborts with "Response body exceeded limit" if the cap is crossed.
   */
  private async readLimitedText(response: Response): Promise<string> {
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > this.maxResponseBytes) {
          await reader.cancel();
          throw new Error("Response body exceeded limit");
        }
        chunks.push(value);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // already released
      }
    }
    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(buffer);
  }

  async teardown(): Promise<void> {
    // No cleanup needed
  }
}
