/**
 * WebSocket Handler - Native WebSocket replacing Socket.IO.
 *
 * Implements room-based messaging for workflow event streaming.
 * Ported from Python main.py Socket.IO event handlers.
 */

import type { ServerWebSocket } from "bun";
import type { WSContext, WSEvents, WSMessageReceive } from "hono/ws";
import type { Event as WorkflowEvent } from "../engine/event-bus";
import type { WorkflowExecutor } from "../engine/executor";

// ─── Types ────────────────────────────────

interface WSMessage {
  type: string;
  payload?: any;
}

interface ClientInfo {
  id: string;
  rooms: Set<string>;
  ws: WSContext<ServerWebSocket<any>>;
}

// ─── Broadcaster ──────────────────────────

export class WSBroadcaster {
  private clients = new Map<string, ClientInfo>();
  private rooms = new Map<string, Set<string>>(); // room -> client ids
  // Use ws.raw (ServerWebSocket) as key instead of WSContext,
  // because Hono creates a new WSContext wrapper per event.
  private wsClientIds = new WeakMap<ServerWebSocket<any>, string>();

  private getRaw(ws: WSContext<ServerWebSocket<any>>): ServerWebSocket<any> {
    return (ws as any).raw;
  }

  addClient(id: string, ws: WSContext<ServerWebSocket<any>>): void {
    this.clients.set(id, { id, rooms: new Set(), ws });
    this.wsClientIds.set(this.getRaw(ws), id);
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      for (const room of Array.from(client.rooms)) {
        this.leaveRoom(id, room);
      }
      this.wsClientIds.delete(this.getRaw(client.ws));
    }
    this.clients.delete(id);
  }

  getClientId(ws: WSContext<ServerWebSocket<any>>): string | undefined {
    return this.wsClientIds.get(this.getRaw(ws));
  }

  joinRoom(clientId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)?.add(clientId);

    const client = this.clients.get(clientId);
    if (client) {
      client.rooms.add(room);
    }
  }

  leaveRoom(clientId: string, room: string): void {
    this.clients.get(clientId)?.rooms.delete(room);
    this.rooms.get(room)?.delete(clientId);
    if (this.rooms.get(room)?.size === 0) {
      this.rooms.delete(room);
      if (room.startsWith("workflow:")) {
        const workflowId = room.replace("workflow:", "");
        executor?.clearCallbacks(workflowId);
      }
    }
  }

  /** Send a message to all clients in a workflow room. */
  broadcast(workflowId: string, type: string, payload: any): void {
    const room = `workflow:${workflowId}`;
    const clientIds = this.rooms.get(room);
    if (!clientIds) return;

    const payloadObj =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const { type: _discardedType, ...safePayload } = payloadObj;
    const message = JSON.stringify({ type, ...safePayload });

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.ws.send(message);
        } catch {
          // Client disconnected
          this.removeClient(clientId);
        }
      }
    }
  }

  /** Get count of clients in a room. */
  getRoomSize(workflowId: string): number {
    return this.rooms.get(`workflow:${workflowId}`)?.size ?? 0;
  }
}

// Global broadcaster
export const wsBroadcaster = new WSBroadcaster();

// ─── Executor Integration ─────────────────

let executor: WorkflowExecutor | null = null;

export function setExecutorForWS(exec: WorkflowExecutor): void {
  executor = exec;
}

function setupWorkflowCallbacks(workflowId: string): void {
  if (!executor) return;

  // Log callback
  executor.setLogCallback(workflowId, async (nodeId, message, level) => {
    wsBroadcaster.broadcast(workflowId, "log", {
      nodeId,
      message,
      level,
      timestamp: new Date().toISOString(),
    });
  });

  // Node status callback
  executor.setStatusCallback(workflowId, async (nodeId, status, data) => {
    wsBroadcaster.broadcast(workflowId, "node.status", {
      nodeId,
      status,
      data,
      timestamp: new Date().toISOString(),
    });
  });

  // Event callback (audio, avatar, subtitle)
  executor.setEventCallback(workflowId, async (event: WorkflowEvent) => {
    if (event.type === "audio.generated") {
      wsBroadcaster.broadcast(workflowId, "audio", {
        filename: event.payload.filename ?? "",
        duration: event.payload.duration ?? 0,
        text: event.payload.text ?? "",
      });
    } else if (event.type === "avatar.expression") {
      wsBroadcaster.broadcast(workflowId, "avatar.expression", {
        expression: event.payload.expression ?? "neutral",
        intensity: event.payload.intensity ?? 1.0,
      });
    } else if (event.type === "avatar.mouth") {
      wsBroadcaster.broadcast(workflowId, "avatar.mouth", {
        value: event.payload.value ?? 0,
        viseme: event.payload.viseme,
      });
    } else if (event.type === "avatar.motion") {
      wsBroadcaster.broadcast(workflowId, "avatar.motion", {
        motion: event.payload.motion ?? "",
      });
    } else if (event.type === "avatar.update") {
      wsBroadcaster.broadcast(workflowId, "avatar.update", event.payload);
    } else if (event.type === "subtitle") {
      wsBroadcaster.broadcast(workflowId, "subtitle", {
        text: event.payload.text ?? "",
      });
    }
  });
}

// ─── WebSocket Handler ────────────────────

let clientCounter = 0;

function parseMessageData(data: WSMessageReceive): WSMessage {
  if (typeof data === "string") {
    return JSON.parse(data) as WSMessage;
  }

  if (data instanceof Blob) {
    throw new Error("Blob WebSocket messages are not supported");
  }

  const bytes = new Uint8Array(data);
  return JSON.parse(new TextDecoder().decode(bytes)) as WSMessage;
}

export function createWebSocketHandler(): WSEvents<ServerWebSocket<any>> {
  return {
    onOpen(_evt: Event, ws: WSContext<ServerWebSocket<any>>) {
      const clientId = `client_${++clientCounter}`;
      wsBroadcaster.addClient(clientId, ws);
      console.log(`WebSocket client connected: ${clientId}`);
    },

    onMessage(evt: MessageEvent<WSMessageReceive>, ws: WSContext<ServerWebSocket<any>>) {
      const clientId = wsBroadcaster.getClientId(ws);
      if (!clientId) return;

      try {
        const msg = parseMessageData(evt.data);

        switch (msg.type) {
          case "join": {
            const workflowId = msg.payload?.workflowId;
            if (workflowId) {
              wsBroadcaster.joinRoom(clientId, `workflow:${workflowId}`);
              setupWorkflowCallbacks(workflowId);
              console.log(`Client ${clientId} joined workflow: ${workflowId}`);
            }
            break;
          }

          case "leave": {
            const workflowId = msg.payload?.workflowId;
            if (workflowId) {
              wsBroadcaster.leaveRoom(clientId, `workflow:${workflowId}`);
              console.log(`Client ${clientId} left workflow: ${workflowId}`);
            }
            break;
          }

          case "workflow_start": {
            const workflowId = msg.payload?.workflowId;
            if (workflowId) {
              console.warn(
                `Received workflow_start via WebSocket for ${workflowId}. Use HTTP /api/workflows/:id/start.`,
              );
              ws.send(
                JSON.stringify({
                  type: "warning",
                  workflowId,
                  message:
                    "workflow_start via WebSocket is notification-only. Use POST /api/workflows/:id/start.",
                }),
              );
            }
            break;
          }

          case "workflow_stop": {
            const workflowId = msg.payload?.workflowId;
            if (workflowId && executor) {
              void executor
                .stopWorkflow(workflowId)
                .then(() => {
                  wsBroadcaster.broadcast(workflowId, "execution.stopped", {
                    reason: "User requested stop",
                  });
                })
                .catch((err) => {
                  console.error(`Failed to stop workflow ${workflowId}:`, err);
                });
            }
            break;
          }

          case "node_input": {
            const { workflowId, nodeId, data } = msg.payload ?? {};
            if (workflowId && nodeId) {
              wsBroadcaster.broadcast(workflowId, "log", {
                nodeId,
                message: `Input received: ${JSON.stringify(data)}`,
                level: "info",
                timestamp: new Date().toISOString(),
              });
            }
            break;
          }
        }
      } catch (err) {
        console.warn("Failed to parse WebSocket message:", err);
      }
    },

    onClose(_evt: CloseEvent, ws: WSContext<ServerWebSocket<any>>) {
      const clientId = wsBroadcaster.getClientId(ws);
      if (clientId) {
        wsBroadcaster.removeClient(clientId);
        console.log(`WebSocket client disconnected: ${clientId}`);
      }
    },

    onError(evt: Event, ws: WSContext<ServerWebSocket<any>>) {
      const clientId = wsBroadcaster.getClientId(ws);
      console.error(`WebSocket error for ${clientId}:`, evt);
    },
  };
}
