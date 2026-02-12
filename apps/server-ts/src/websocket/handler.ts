/**
 * WebSocket Handler - Native WebSocket replacing Socket.IO.
 *
 * Implements room-based messaging for workflow event streaming.
 * Ported from Python main.py Socket.IO event handlers.
 */

import type { ServerWebSocket } from "bun";
import type { WSEvents } from "hono/bun";
import { WorkflowExecutor } from "../engine/executor";
import type { Event } from "../engine/event-bus";

// ─── Types ────────────────────────────────

interface WSMessage {
  type: string;
  payload?: any;
}

interface ClientInfo {
  id: string;
  workflowId: string | null;
  ws: ServerWebSocket<any>;
}

// ─── Broadcaster ──────────────────────────

export class WSBroadcaster {
  private clients = new Map<string, ClientInfo>();
  private rooms = new Map<string, Set<string>>(); // room -> client ids

  addClient(id: string, ws: ServerWebSocket<any>): void {
    this.clients.set(id, { id, workflowId: null, ws });
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (client?.workflowId) {
      this.leaveRoom(id, `workflow:${client.workflowId}`);
    }
    this.clients.delete(id);
  }

  joinRoom(clientId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);

    const client = this.clients.get(clientId);
    if (client) {
      client.workflowId = room.replace("workflow:", "");
    }
  }

  leaveRoom(clientId: string, room: string): void {
    this.rooms.get(room)?.delete(clientId);
    if (this.rooms.get(room)?.size === 0) {
      this.rooms.delete(room);
    }
  }

  /** Send a message to all clients in a workflow room. */
  broadcast(
    workflowId: string,
    type: string,
    payload: any
  ): void {
    const room = `workflow:${workflowId}`;
    const clientIds = this.rooms.get(room);
    if (!clientIds) return;

    const message = JSON.stringify({ type, ...payload });

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
  executor.setLogCallback(
    workflowId,
    async (nodeId, message, level) => {
      wsBroadcaster.broadcast(workflowId, "log", {
        nodeId,
        message,
        level,
        timestamp: new Date().toISOString(),
      });
    }
  );

  // Node status callback
  executor.setStatusCallback(
    workflowId,
    async (nodeId, status, data) => {
      wsBroadcaster.broadcast(workflowId, "node.status", {
        nodeId,
        status,
        data,
        timestamp: new Date().toISOString(),
      });
    }
  );

  // Event callback (audio, avatar, subtitle)
  executor.setEventCallback(workflowId, async (event: Event) => {
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

export function createWebSocketHandler(): WSEvents {
  return {
    onOpen(_evt, ws) {
      const clientId = `client_${++clientCounter}`;
      (ws as any).__clientId = clientId;
      wsBroadcaster.addClient(clientId, ws as any);
      console.log(`WebSocket client connected: ${clientId}`);
    },

    onMessage(evt, ws) {
      const clientId = (ws as any).__clientId as string;
      if (!clientId) return;

      try {
        const msg: WSMessage =
          typeof evt.data === "string"
            ? JSON.parse(evt.data)
            : JSON.parse(new TextDecoder().decode(evt.data as ArrayBuffer));

        switch (msg.type) {
          case "join": {
            const workflowId = msg.payload?.workflowId;
            if (workflowId) {
              wsBroadcaster.joinRoom(clientId, `workflow:${workflowId}`);
              setupWorkflowCallbacks(workflowId);
              console.log(
                `Client ${clientId} joined workflow: ${workflowId}`
              );
            }
            break;
          }

          case "leave": {
            const workflowId = msg.payload?.workflowId;
            if (workflowId) {
              wsBroadcaster.leaveRoom(
                clientId,
                `workflow:${workflowId}`
              );
              console.log(
                `Client ${clientId} left workflow: ${workflowId}`
              );
            }
            break;
          }

          case "workflow_start": {
            const workflowId = msg.payload?.workflowId;
            if (workflowId) {
              wsBroadcaster.broadcast(
                workflowId,
                "execution.started",
                {}
              );
            }
            break;
          }

          case "workflow_stop": {
            const workflowId = msg.payload?.workflowId;
            if (workflowId && executor) {
              executor.stopWorkflow(workflowId);
              wsBroadcaster.broadcast(
                workflowId,
                "execution.stopped",
                { reason: "User requested stop" }
              );
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
        console.warn(`Failed to parse WebSocket message:`, err);
      }
    },

    onClose(_evt, ws) {
      const clientId = (ws as any).__clientId as string;
      if (clientId) {
        wsBroadcaster.removeClient(clientId);
        console.log(`WebSocket client disconnected: ${clientId}`);
      }
    },

    onError(evt, ws) {
      const clientId = (ws as any).__clientId as string;
      console.error(`WebSocket error for ${clientId}:`, evt);
    },
  };
}
