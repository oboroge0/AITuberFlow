/**
 * HTTP Request Node
 *
 * Makes HTTP requests to external APIs.
 */

import { BaseNode, type NodeContext } from "@aituber-flow/sdk";

export default class HttpRequestNode extends BaseNode {
  private url = "";
  private method = "GET";
  private headers: Record<string, string> = {};
  private timeout = 30000;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.url = config.url ?? "";
    this.method = config.method ?? "GET";
    this.timeout = config.timeout ?? 30000;

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

      const fetchOptions: RequestInit = {
        method: this.method,
        headers: { ...this.headers },
        signal: controller.signal,
      };

      if (
        body !== undefined &&
        ["POST", "PUT", "PATCH"].includes(this.method)
      ) {
        if (typeof body === "object") {
          fetchOptions.body = JSON.stringify(body);
          // Set Content-Type if not already set
          const headerKeys = Object.keys(this.headers).map((k) =>
            k.toLowerCase(),
          );
          if (!headerKeys.includes("content-type")) {
            (fetchOptions.headers as Record<string, string>)["Content-Type"] =
              "application/json";
          }
        } else {
          fetchOptions.body = String(body);
        }
      }

      const response = await fetch(this.url, fetchOptions);
      clearTimeout(timeoutId);

      const status = response.status;

      // Try to parse as JSON, fallback to text
      let data: any;
      const contentType = response.headers.get("content-type") ?? "";
      try {
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const text = await response.text();
          // Try parsing text as JSON anyway
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
        }
      } catch {
        data = await response.text();
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
      await context.log(`Request failed: ${String(e)}`, "error");
      return { response: null, status: 0 };
    }
  }

  async teardown(): Promise<void> {
    // No cleanup needed
  }
}
