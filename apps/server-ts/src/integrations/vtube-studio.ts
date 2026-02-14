// Bun provides global WebSocket (browser-standard API) - no external package needed
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PLUGIN_NAME = "AITuberFlow";
const PLUGIN_DEVELOPER = "AITuberFlow";
const API_NAME = "VTubeStudioPublicAPI";
const API_VERSION = "1.0";

const TOKEN_FILE = resolve(import.meta.dir ?? ".", "../../data/vts_token.json");

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

class VTubeStudioClient {
  private ws: WebSocket | null = null;
  private port = 8001;
  connected = false;
  authenticated = false;
  private requestId = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private expressionMap: Record<string, string> = {};
  private mouthParam = "MouthOpen";
  private shouldReconnect = true;
  private abortController: AbortController | null = null;

  get isConnected(): boolean {
    return this.connected && this.authenticated;
  }

  configure(
    port = 8001,
    mouthParam = "MouthOpen",
    expressionMap?: Record<string, string>
  ): void {
    this.port = port;
    this.mouthParam = mouthParam;
    this.expressionMap = expressionMap ?? {
      happy: "Happy",
      sad: "Sad",
      angry: "Angry",
      surprised: "Surprised",
      relaxed: "Relaxed",
      neutral: "Neutral",
    };
    console.log(`[VTS] Configured: port=${port}, mouthParam=${mouthParam}`);
  }

  async connect(): Promise<boolean> {
    if (this.connected) return this.authenticated;

    this.shouldReconnect = true;

    try {
      const uri = `ws://localhost:${this.port}`;
      console.log(`[VTS] Connecting to VTube Studio at ${uri}`);

      return await new Promise<boolean>((resolve) => {
        const ws = new WebSocket(uri);
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        ws.addEventListener("open", async () => {
          this.ws = ws;
          this.connected = true;
          console.log("[VTS] Connected to VTube Studio");
          this.setupReceiveHandler();

          const success = await this.authenticate();
          if (success) {
            console.log("[VTS] Authentication successful");
          } else {
            console.warn("[VTS] Authentication failed");
          }
          resolve(success);
        }, { signal });

        ws.addEventListener("error", () => {
          console.error("[VTS] Connection error");
          this.connected = false;
          this.authenticated = false;
          resolve(false);
        }, { signal });
      });
    } catch (e) {
      console.error(`[VTS] Failed to connect: ${e}`);
      this.connected = false;
      this.authenticated = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;

    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error("Disconnecting"));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      this.abortController?.abort();
      this.abortController = null;
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.authenticated = false;
    console.log("[VTS] Disconnected from VTube Studio");
  }

  async setParameter(paramId: string, value: number): Promise<boolean> {
    if (!this.isConnected) return false;

    value = Math.max(0, Math.min(1, value));

    try {
      await this.sendRequest("InjectParameterDataRequest", {
        faceFound: true,
        mode: "set",
        parameterValues: [{ id: paramId, value }],
      });
      return true;
    } catch {
      return false;
    }
  }

  async setMouthOpen(value: number): Promise<boolean> {
    return this.setParameter(this.mouthParam, value);
  }

  async triggerHotkey(hotkeyId: string): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      await this.sendRequest("HotkeyTriggerRequest", { hotkeyID: hotkeyId });
      return true;
    } catch (e) {
      console.error(`[VTS] Failed to trigger hotkey ${hotkeyId}: ${e}`);
      return false;
    }
  }

  async triggerExpression(expression: string): Promise<boolean> {
    const hotkeyId = this.expressionMap[expression.toLowerCase()];
    if (!hotkeyId) {
      console.warn(`[VTS] No hotkey mapped for expression: ${expression}`);
      return false;
    }
    return this.triggerHotkey(hotkeyId);
  }

  // ─── Authentication ─────────────────────────────────────────────

  private async authenticate(): Promise<boolean> {
    const token = this.loadToken();

    if (token) {
      const success = await this.authWithToken(token);
      if (success) return true;
      this.clearToken();
    }

    const newToken = await this.requestToken();
    if (!newToken) return false;

    const success = await this.authWithToken(newToken);
    if (success) this.saveToken(newToken);
    return success;
  }

  private async requestToken(): Promise<string | null> {
    try {
      console.log("[VTS] Requesting auth token (check VTube Studio for popup)");
      const response = (await this.sendRequest(
        "AuthenticationTokenRequest",
        {
          pluginName: PLUGIN_NAME,
          pluginDeveloper: PLUGIN_DEVELOPER,
        },
        60_000
      )) as Record<string, any> | null;

      return response?.data?.authenticationToken ?? null;
    } catch (e) {
      console.error(`[VTS] Token request failed: ${e}`);
      return null;
    }
  }

  private async authWithToken(token: string): Promise<boolean> {
    try {
      const response = (await this.sendRequest("AuthenticationRequest", {
        pluginName: PLUGIN_NAME,
        pluginDeveloper: PLUGIN_DEVELOPER,
        authenticationToken: token,
      })) as Record<string, any> | null;

      if (response?.data) {
        this.authenticated = response.data.authenticated === true;
        return this.authenticated;
      }
      return false;
    } catch (e) {
      console.error(`[VTS] Authentication failed: ${e}`);
      return false;
    }
  }

  // ─── Token persistence ──────────────────────────────────────────

  private loadToken(): string | null {
    try {
      if (existsSync(TOKEN_FILE)) {
        const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
        if (data.port === this.port) return data.token ?? null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private saveToken(token: string): void {
    try {
      mkdirSync(dirname(TOKEN_FILE), { recursive: true });
      writeFileSync(
        TOKEN_FILE,
        JSON.stringify(
          { token, port: this.port, updatedAt: new Date().toISOString() },
          null,
          2
        )
      );
      console.log("[VTS] Token saved");
    } catch (e) {
      console.error(`[VTS] Failed to save token: ${e}`);
    }
  }

  private clearToken(): void {
    try {
      if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE);
    } catch {
      // ignore
    }
  }

  // ─── WebSocket transport ────────────────────────────────────────

  private sendRequest(
    messageType: string,
    data?: Record<string, unknown>,
    timeout = 10_000
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Not connected"));
      }

      this.requestId += 1;
      const requestID = `req_${this.requestId}_${Date.now()}`;

      const message: Record<string, unknown> = {
        apiName: API_NAME,
        apiVersion: API_VERSION,
        requestID,
        messageType,
      };
      if (data) message.data = data;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestID);
        console.warn(`[VTS] Request ${messageType} timed out`);
        reject(new Error(`Request ${messageType} timed out`));
      }, timeout);

      this.pendingRequests.set(requestID, { resolve, reject, timer });
      this.ws.send(JSON.stringify(message));
    });
  }

  private setupReceiveHandler(): void {
    if (!this.ws || !this.abortController) return;

    const { signal } = this.abortController;

    this.ws.addEventListener("message", (event: MessageEvent) => {
      try {
        const data = JSON.parse(
          typeof event.data === "string" ? event.data : String(event.data)
        ) as Record<string, unknown>;
        const requestId = data.requestID as string | undefined;

        if (requestId && this.pendingRequests.has(requestId)) {
          const pending = this.pendingRequests.get(requestId)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(requestId);
          pending.resolve(data);
        }
      } catch {
        console.warn("[VTS] Failed to parse message");
      }
    }, { signal });

    this.ws.addEventListener("close", () => {
      console.log("[VTS] Connection closed");
      this.connected = false;
      this.authenticated = false;

      if (this.shouldReconnect) {
        setTimeout(() => this.reconnect(), 3000);
      }
    }, { signal });

    this.ws.addEventListener("error", () => {
      console.error("[VTS] WebSocket error");
      this.connected = false;
      this.authenticated = false;
    }, { signal });
  }

  private async reconnect(): Promise<void> {
    if (this.shouldReconnect && !this.connected) {
      console.log("[VTS] Attempting to reconnect...");
      await this.connect();
    }
  }
}

export const vtsClient = new VTubeStudioClient();
