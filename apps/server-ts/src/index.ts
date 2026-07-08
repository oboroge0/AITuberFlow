import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initDb } from "./db/database";
import { WorkflowExecutor } from "./engine/executor";
import { integrationRoutes } from "./routes/integrations";
import { memoryRoutes } from "./routes/memories";
import { pluginRoutes } from "./routes/plugins";
import { settingsRoutes } from "./routes/settings";
import { templateRoutes } from "./routes/templates";
import { setExecutor, setWSBroadcaster, workflowRoutes } from "./routes/workflows";
import { shutdownGracefully } from "./shutdown";
import { createWebSocketHandler, setExecutorForWS, wsBroadcaster } from "./websocket/handler";
import { buildAllowedWsOrigins, createWsOriginGuard } from "./websocket/origin-check";

const app = new Hono();
// biome-ignore lint/suspicious/noExplicitAny: Bun ServerWebSocket requires any as data type parameter
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket<any>>();

// Static file serving directory (set by Tauri for desktop mode)
const STATIC_DIR = process.env.STATIC_DIR;

const parsedPort = process.env.PORT === undefined ? Number.NaN : Number(process.env.PORT);
const port = Number.isFinite(parsedPort) ? parsedPort : 8001;

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
  }),
);

// Global executor instance
const executor = new WorkflowExecutor();

// Wire up executor with routes and WebSocket
setExecutor(executor);
setWSBroadcaster(wsBroadcaster);
setExecutorForWS(executor);

// Health check
app.get("/health", (c) => c.json({ status: "healthy", version: "2.0.0", runtime: "bun" }));

// API routes (must be registered BEFORE static file serving)
app.route("/api/workflows", workflowRoutes);
app.route("/api/workflows", memoryRoutes);
app.route("/api/plugins", pluginRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/integrations", integrationRoutes);
app.route("/api/settings", settingsRoutes);

// WebSocket endpoint
// CORS does not apply to WebSocket handshakes, so validate Origin explicitly:
// without this, any web page could connect to ws://127.0.0.1:8001/ws.
const wsHandler = createWebSocketHandler();
const allowedWsOrigins = buildAllowedWsOrigins(corsOrigins, port);
app.get(
  "/ws",
  createWsOriginGuard(allowedWsOrigins),
  upgradeWebSocket(() => wsHandler),
);

// Static file serving for desktop mode
// When STATIC_DIR is set, serve the Next.js static export and provide SPA fallback
if (STATIC_DIR) {
  const indexExists = existsSync(join(STATIC_DIR, "index.html"));
  console.log(
    `[static] STATIC_DIR=${STATIC_DIR} index.html=${indexExists ? "found" : "NOT FOUND"}`,
  );

  // Normalize path separators for cross-platform compatibility (Hono serveStatic)
  const normalizedStaticDir = STATIC_DIR.replace(/\\/g, "/");

  // Serve static files from the export directory
  app.use("/*", serveStatic({ root: normalizedStaticDir }));

  // SPA fallback: serve the correct HTML shell for each route pattern
  // Next.js static export generates /editor/_.html, /preview/_.html, /overlay/_.html
  app.get("/editor/:id", async (c) => {
    const file = Bun.file(join(STATIC_DIR, "editor", "_.html"));
    if (await file.exists()) return c.html(await file.text());
    return c.notFound();
  });
  app.get("/preview/:id", async (c) => {
    const file = Bun.file(join(STATIC_DIR, "preview", "_.html"));
    if (await file.exists()) return c.html(await file.text());
    return c.notFound();
  });
  app.get("/overlay/:id", async (c) => {
    const file = Bun.file(join(STATIC_DIR, "overlay", "_.html"));
    if (await file.exists()) return c.html(await file.text());
    return c.notFound();
  });

  // Root fallback for any other unmatched path → serve index.html
  app.get("*", async (c) => {
    const file = Bun.file(join(STATIC_DIR, "index.html"));
    if (await file.exists()) return c.html(await file.text());
    return c.notFound();
  });
} else {
  // API-only mode: show API info at root
  app.get("/", (c) => c.json({ name: "AITuberFlow API", version: "2.0.0", runtime: "bun" }));
}

// Initialize database on startup
initDb();

// Default to localhost-only binding for security: without an explicit hostname,
// Bun binds to 0.0.0.0 (all network interfaces), exposing unauthenticated REST/WS
// routes to anyone on the same LAN. Set HOST=0.0.0.0 to restore LAN-wide access
// (e.g. when OBS or the browser overlay runs on a different machine).
const hostname = process.env.HOST || "127.0.0.1";
console.log(`Started development server: http://${hostname}:${port}`);

// Graceful shutdown handler
const SHUTDOWN_TIMEOUT_MS = 10_000;
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  const timeoutHandle = setTimeout(() => {
    console.warn(`Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Don't let the timeout keep the process alive if everything finishes fast.
  if (typeof timeoutHandle === "object" && "unref" in timeoutHandle) {
    timeoutHandle.unref();
  }

  await shutdownGracefully(executor);

  clearTimeout(timeoutHandle);
  process.exit(0);
}

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

// Parent process monitoring: prevents orphan sidecar when the desktop main
// process is SIGKILLed, panics, or otherwise terminates without firing the
// Tauri WindowEvent::Destroyed handler. macOS lacks Linux's PR_SET_PDEATHSIG,
// so we poll explicitly. The Tauri side passes its PID via env var.
const parentPidEnv = process.env.AITUBERFLOW_PARENT_PID;
if (parentPidEnv) {
  const parentPid = Number(parentPidEnv);
  if (Number.isFinite(parentPid) && parentPid > 0) {
    console.log(`[parent-monitor] watching parent PID ${parentPid}`);
    setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch {
        console.log(`[parent-monitor] parent PID ${parentPid} no longer alive, exiting sidecar`);
        process.exit(0);
      }
    }, 5000).unref();
  }
}

// Use export default for Bun's built-in server management.
// This ensures --hot mode works correctly (handler replacement without restart).
export default {
  port,
  hostname,
  fetch: app.fetch,
  websocket,
};
