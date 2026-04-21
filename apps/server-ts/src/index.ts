import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { closeDb, initDb } from "./db/database";
import { WorkflowExecutor } from "./engine/executor";
import { integrationRoutes } from "./routes/integrations";
import { pluginRoutes } from "./routes/plugins";
import { settingsRoutes } from "./routes/settings";
import { templateRoutes } from "./routes/templates";
import { setExecutor, setWSBroadcaster, workflowRoutes } from "./routes/workflows";
import { createWebSocketHandler, setExecutorForWS, wsBroadcaster } from "./websocket/handler";

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket<any>>();

// Static file serving directory (set by Tauri for desktop mode)
const STATIC_DIR = process.env.STATIC_DIR;

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
app.route("/api/plugins", pluginRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/integrations", integrationRoutes);
app.route("/api/settings", settingsRoutes);

// WebSocket endpoint
const wsHandler = createWebSocketHandler();
app.get(
  "/ws",
  upgradeWebSocket(() => wsHandler),
);

// Static file serving for desktop mode
// When STATIC_DIR is set, serve the Next.js static export and provide SPA fallback
if (STATIC_DIR) {
  const indexExists = existsSync(join(STATIC_DIR, "index.html"));
  console.log(`[static] STATIC_DIR=${STATIC_DIR} index.html=${indexExists ? "found" : "NOT FOUND"}`);

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

const parsedPort = process.env.PORT === undefined ? Number.NaN : Number(process.env.PORT);
const port = Number.isFinite(parsedPort) ? parsedPort : 8001;
console.log(`Started development server: http://localhost:${port}`);

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

  try {
    const runningIds = executor.getRunningWorkflowIds();
    if (runningIds.length > 0) {
      console.log(`Stopping ${runningIds.length} running workflow(s)...`);
      await Promise.allSettled(runningIds.map((id) => executor.stopWorkflow(id)));
    }
  } catch (err) {
    console.error("Error stopping workflows on shutdown:", err);
  }

  try {
    closeDb();
  } catch (err) {
    console.error("Error closing database on shutdown:", err);
  }

  clearTimeout(timeoutHandle);
  process.exit(0);
}

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

// Use export default for Bun's built-in server management.
// This ensures --hot mode works correctly (handler replacement without restart).
export default {
  port,
  fetch: app.fetch,
  websocket,
};
