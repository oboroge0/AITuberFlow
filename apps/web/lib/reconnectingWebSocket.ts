/**
 * Reconnecting WebSocket helper (framework-agnostic).
 *
 * Wraps the native `WebSocket` with exponential backoff + jitter
 * reconnection, mirroring the logic in `hooks/useWebSocket.ts` but without
 * any React dependency so it can be reused from non-hook contexts (e.g. the
 * unattended OBS overlay page, where nobody is around to hit "reload").
 *
 * NOTE: `hooks/useWebSocket.ts` still has its own inline reconnect logic.
 * It was intentionally left untouched by this change to avoid regression
 * risk in the editor's WebSocket handling; it can be migrated to use this
 * helper in a follow-up.
 */

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting';

export const DEFAULT_INITIAL_RECONNECT_DELAY = 1000; // 1 second
export const DEFAULT_MAX_RECONNECT_DELAY = 30000; // 30 seconds
export const DEFAULT_JITTER_FACTOR = 0.5;

/**
 * Exponential backoff with jitter, capped at `maxDelay`.
 * `attempt` is 1-indexed (first retry = attempt 1).
 */
export function calculateReconnectDelay(
  attempt: number,
  initialDelay: number = DEFAULT_INITIAL_RECONNECT_DELAY,
  maxDelay: number = DEFAULT_MAX_RECONNECT_DELAY,
  jitterFactor: number = DEFAULT_JITTER_FACTOR,
): number {
  const baseDelay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
  const jitter = baseDelay * jitterFactor * Math.random();
  return baseDelay + jitter;
}

export interface ReconnectingWebSocketOptions {
  /** Full ws:// or wss:// URL to connect to. */
  url: string;
  /** Called every time the underlying socket finishes connecting (including reconnects). Use it to resend join/auth messages. */
  onOpen?: () => void;
  /** Called for every incoming message. */
  onMessage?: (event: MessageEvent) => void;
  /** Called whenever the connection status changes. */
  onStatusChange?: (status: ConnectionStatus, attempt: number) => void;
  /** Called on socket errors (informational only; reconnection is driven by `onclose`). */
  onError?: (error: Event) => void;
  /** Maximum number of reconnect attempts. Defaults to unlimited (`Infinity`). */
  maxReconnectAttempts?: number;
  initialReconnectDelay?: number;
  maxReconnectDelay?: number;
  jitterFactor?: number;
}

/**
 * A WebSocket wrapper that automatically reconnects with exponential
 * backoff + jitter until `close()` is called explicitly.
 */
export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;

  private readonly url: string;
  private readonly onOpenCallback?: () => void;
  private readonly onMessageCallback?: (event: MessageEvent) => void;
  private readonly onStatusChangeCallback?: (status: ConnectionStatus, attempt: number) => void;
  private readonly onErrorCallback?: (error: Event) => void;
  private readonly maxReconnectAttempts: number;
  private readonly initialReconnectDelay: number;
  private readonly maxReconnectDelay: number;
  private readonly jitterFactor: number;

  constructor(options: ReconnectingWebSocketOptions) {
    this.url = options.url;
    this.onOpenCallback = options.onOpen;
    this.onMessageCallback = options.onMessage;
    this.onStatusChangeCallback = options.onStatusChange;
    this.onErrorCallback = options.onError;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity;
    this.initialReconnectDelay = options.initialReconnectDelay ?? DEFAULT_INITIAL_RECONNECT_DELAY;
    this.maxReconnectDelay = options.maxReconnectDelay ?? DEFAULT_MAX_RECONNECT_DELAY;
    this.jitterFactor = options.jitterFactor ?? DEFAULT_JITTER_FACTOR;
  }

  /** Opens the initial connection. Safe to call only once per instance. */
  connect(): void {
    this.intentionalClose = false;
    this.openSocket();
  }

  private openSocket(): void {
    this.onStatusChangeCallback?.(
      this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
      this.reconnectAttempt,
    );

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.onStatusChangeCallback?.('connected', 0);
      this.onOpenCallback?.();
    };

    ws.onclose = () => {
      this.onStatusChangeCallback?.('disconnected', this.reconnectAttempt);
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = (error) => {
      this.onErrorCallback?.(error);
    };

    ws.onmessage = (event) => {
      this.onMessageCallback?.(event);
    };
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;

    const attempt = this.reconnectAttempt + 1;
    if (attempt > this.maxReconnectAttempts) {
      this.onStatusChangeCallback?.('disconnected', attempt - 1);
      return;
    }

    this.reconnectAttempt = attempt;

    const delay = calculateReconnectDelay(
      attempt,
      this.initialReconnectDelay,
      this.maxReconnectDelay,
      this.jitterFactor,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  /** Sends a payload if the socket is currently open. Returns whether it was sent. */
  send(data: string): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      return true;
    }
    return false;
  }

  /** Current underlying socket ready state, or null if never connected. */
  get readyState(): number | null {
    return this.ws?.readyState ?? null;
  }

  /** Closes the connection and stops all future reconnect attempts. */
  close(): void {
    this.intentionalClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
