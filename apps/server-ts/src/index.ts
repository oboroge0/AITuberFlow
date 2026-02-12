import { Hono } from "hono";
import type { ServerWebSocket } from "bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import { initDb } from "./db/database";
import { workflowRoutes, setExecutor, setWSBroadcaster } from "./routes/workflows";
import { pluginRoutes } from "./routes/plugins";
import { templateRoutes } from "./routes/templates";
import { integrationRoutes } from "./routes/integrations";
import { createWebSocketHandler, wsBroadcaster, setExecutorForWS } from "./websocket/handler";
import { WorkflowExecutor } from "./engine/executor";

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket<any>>();

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : Array.from({ length: 11 }, (_, i) => [
      `http://localhost:${3000 + i}`,
      `http://127.0.0.1:${3000 + i}`,
    ]).flat();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

// Global executor instance
const executor = new WorkflowExecutor();

// Wire up executor with routes and WebSocket
setExecutor(executor);
setWSBroadcaster(wsBroadcaster);
setExecutorForWS(executor);

// Health check
app.get("/health", (c) =>
  c.json({ status: "healthy", version: "1.0.0", runtime: "bun" })
);

// Root
app.get("/", (c) =>
  c.json({ name: "AITuberFlow API", version: "1.0.0", runtime: "bun" })
);

// API routes
app.route("/api/workflows", workflowRoutes);
app.route("/api/plugins", pluginRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/integrations", integrationRoutes);

// WebSocket endpoint
const wsHandler = createWebSocketHandler();
app.get(
  "/ws",
  upgradeWebSocket(() => wsHandler)
);

// Initialize database on startup
initDb();

const port = Number(process.env.PORT) || 8001;
console.log(`AITuberFlow server starting on port ${port}...`);

// Use export default for Bun's built-in server management.
// This ensures --hot mode works correctly (handler replacement without restart).
export default {
  port,
  fetch: app.fetch,
  websocket,
};
