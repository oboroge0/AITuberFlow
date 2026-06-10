/**
 * Integrations API Routes - VOICEVOX, file management.
 *
 * Ported from Python apps/server/routers/integrations.py
 */

import { mkdir, readdir, unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getProjectRoot } from "../engine/plugin-loader";

const app = new Hono();

const PROJECT_ROOT = getProjectRoot();
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(PROJECT_ROOT, "apps", "web", "public", "models");
const ANIMATIONS_DIR =
  process.env.ANIMATIONS_DIR || join(PROJECT_ROOT, "apps", "web", "public", "animations");
const AUDIO_DIR = process.env.AUDIO_DIR || join(PROJECT_ROOT, "apps", "server-ts", "audio_output");
const DEFAULT_VOICEVOX_HOST = "http://localhost:50021";
const MAX_MODEL_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_ANIMATION_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_VOICEVOX_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

const ALLOWED_EXTENSIONS = new Set([".vrm", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const ALLOWED_ANIMATION_EXTENSIONS = new Set([".fbx", ".glb", ".gltf"]);

interface VoicevoxStyle {
  id: number;
  name?: string;
}

interface VoicevoxSpeaker {
  name?: string;
  styles?: VoicevoxStyle[];
}

function validateVoicevoxHost(rawHost?: string): {
  host: string;
  error?: string;
} {
  const value = rawHost ?? DEFAULT_VOICEVOX_HOST;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { host: DEFAULT_VOICEVOX_HOST, error: "Invalid host URL" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      host: DEFAULT_VOICEVOX_HOST,
      error: "Only http/https hosts are allowed",
    };
  }

  if (!ALLOWED_VOICEVOX_HOSTS.has(parsed.hostname)) {
    return {
      host: DEFAULT_VOICEVOX_HOST,
      error: "Only localhost VOICEVOX hosts are allowed",
    };
  }

  return { host: `${parsed.protocol}//${parsed.host}` };
}

function sanitizeUploadStem(filename: string): string {
  const base = basename(filename);
  const stem = base.replace(/\.[^.]+$/, "");
  const sanitized = stem
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "upload";
}

function sanitizeHeaderFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, "_");
}

function isVoicevoxUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  if (err.name === "AbortError" || err.name === "TimeoutError") {
    return true;
  }

  const withCause = err as Error & { cause?: { code?: string } };
  return err.name === "TypeError" || withCause.cause?.code === "ECONNREFUSED";
}

// Ensure directories exist
await mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
await mkdir(ANIMATIONS_DIR, { recursive: true }).catch(() => {});
await mkdir(AUDIO_DIR, { recursive: true }).catch(() => {});

// ─── VOICEVOX ─────────────────────────────

app.get("/voicevox/speakers", async (c) => {
  const { host, error } = validateVoicevoxHost(c.req.query("host"));
  if (error) {
    return c.json({ detail: error }, 400);
  }

  try {
    const response = await fetch(`${host}/speakers`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return c.json(
        { detail: `VOICEVOX API error: ${response.statusText}` },
        response.status as ContentfulStatusCode,
      );
    }

    const speakersData = (await response.json()) as VoicevoxSpeaker[];
    const speakers = speakersData.flatMap((speaker) =>
      (speaker.styles ?? []).map((style) => ({
        id: style.id,
        name: speaker.name ?? "Unknown",
        style: style.name ?? "Normal",
        label: `${speaker.name ?? "Unknown"} (${style.name ?? "Normal"})`,
      })),
    );

    return c.json({ speakers });
  } catch (err) {
    if (isVoicevoxUnavailableError(err)) {
      return c.json(
        {
          detail: `Cannot connect to VOICEVOX at ${host}. Make sure VOICEVOX is running.`,
        },
        503,
      );
    }
    console.error("Failed to fetch VOICEVOX speakers:", err);
    return c.json({ detail: "Failed to fetch speakers" }, 500);
  }
});

app.get("/voicevox/health", async (c) => {
  const { host, error } = validateVoicevoxHost(c.req.query("host"));
  if (error) {
    return c.json({ detail: error }, 400);
  }

  try {
    const response = await fetch(`${host}/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(response.statusText);
    const version = (await response.text()).replace(/"/g, "");
    return c.json({ status: "healthy", version, host });
  } catch (err) {
    console.error("VOICEVOX health check failed:", err);
    return c.json({ status: "unhealthy", error: "VOICEVOX unavailable", host }, 503);
  }
});

// ─── Audio Serving ────────────────────────

app.get("/audio/:filename", async (c) => {
  const filename = c.req.param("filename");

  // Security validation
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return c.json({ detail: "Invalid filename" }, 400);
  }
  if (!filename.toLowerCase().endsWith(".wav")) {
    return c.json({ detail: "Invalid filename" }, 400);
  }

  const filePath = join(AUDIO_DIR, filename);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return c.json({ detail: "Audio file not found" }, 404);
  }

  const safeHeaderFilename = sanitizeHeaderFilename(filename);

  return new Response(file, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": `inline; filename="${safeHeaderFilename}"`,
    },
  });
});

// ─── Model Upload/List/Delete/Serve ───────

app.post("/models/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file || !file.name) {
    return c.json({ detail: "No file provided" }, 400);
  }

  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return c.json(
      {
        detail: `File type not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
      },
      400,
    );
  }
  if (file.size > MAX_MODEL_UPLOAD_BYTES) {
    return c.json({ detail: `File too large. Max size is ${MAX_MODEL_UPLOAD_BYTES} bytes.` }, 413);
  }

  const uniqueId = crypto.randomUUID().substring(0, 8);
  const safeStem = sanitizeUploadStem(file.name);
  const safeFilename = `${uniqueId}_${safeStem}${ext}`;
  const filePath = join(UPLOAD_DIR, safeFilename);

  try {
    await Bun.write(filePath, file);
    const urlPath = `/api/integrations/models/file/${safeFilename}`;
    return c.json({
      success: true,
      filename: safeFilename,
      url: urlPath,
      size: file.size,
    });
  } catch (err) {
    console.error("Failed to upload model:", err);
    return c.json({ detail: "Failed to upload model" }, 500);
  }
});

app.get("/models", async (c) => {
  try {
    const entries = await readdir(UPLOAD_DIR);
    const models = [];
    for (const name of entries) {
      const ext = extname(name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;
      const file = Bun.file(join(UPLOAD_DIR, name));
      models.push({
        filename: name,
        url: `/api/integrations/models/file/${name}`,
        size: file.size,
        type: ext === ".vrm" ? "vrm" : "image",
      });
    }
    return c.json({ models });
  } catch {
    return c.json({ models: [] });
  }
});

app.delete("/models/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return c.json({ detail: "Invalid filename" }, 400);
  }

  const filePath = join(UPLOAD_DIR, filename);
  try {
    await unlink(filePath);
    return c.json({ success: true, message: `Deleted ${filename}` });
  } catch {
    return c.json({ detail: "File not found" }, 404);
  }
});

app.get("/models/file/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return c.json({ detail: "Invalid filename" }, 400);
  }

  const filePath = join(UPLOAD_DIR, filename);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return c.json({ detail: "File not found" }, 404);
  }

  const ext = extname(filename).toLowerCase();
  const mediaTypes: Record<string, string> = {
    ".vrm": "model/gltf-binary",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };

  return new Response(file, {
    headers: { "Content-Type": mediaTypes[ext] ?? "application/octet-stream" },
  });
});

// ─── Animation Upload/List/Delete/Serve ───

app.post("/animations/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file || !file.name) {
    return c.json({ detail: "No file provided" }, 400);
  }

  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_ANIMATION_EXTENSIONS.has(ext)) {
    return c.json(
      {
        detail: `File type not allowed. Allowed: ${[...ALLOWED_ANIMATION_EXTENSIONS].join(", ")}`,
      },
      400,
    );
  }
  if (file.size > MAX_ANIMATION_UPLOAD_BYTES) {
    return c.json(
      {
        detail: `File too large. Max size is ${MAX_ANIMATION_UPLOAD_BYTES} bytes.`,
      },
      413,
    );
  }

  const uniqueId = crypto.randomUUID().substring(0, 8);
  const safeStem = sanitizeUploadStem(file.name);
  const safeFilename = `${uniqueId}_${safeStem}${ext}`;
  const filePath = join(ANIMATIONS_DIR, safeFilename);

  try {
    await Bun.write(filePath, file);
    return c.json({
      success: true,
      filename: safeFilename,
      url: `/api/integrations/animations/file/${safeFilename}`,
      size: file.size,
    });
  } catch (err) {
    console.error("Failed to upload animation:", err);
    return c.json({ detail: "Failed to upload animation" }, 500);
  }
});

app.get("/animations", async (c) => {
  try {
    const entries = await readdir(ANIMATIONS_DIR);
    const animations = [];
    for (const name of entries) {
      const ext = extname(name).toLowerCase();
      if (!ALLOWED_ANIMATION_EXTENSIONS.has(ext)) continue;
      const file = Bun.file(join(ANIMATIONS_DIR, name));
      animations.push({
        filename: name,
        url: `/api/integrations/animations/file/${name}`,
        size: file.size,
        type: ext.substring(1),
      });
    }
    return c.json({ animations });
  } catch {
    return c.json({ animations: [] });
  }
});

app.delete("/animations/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return c.json({ detail: "Invalid filename" }, 400);
  }

  try {
    await unlink(join(ANIMATIONS_DIR, filename));
    return c.json({ success: true, message: `Deleted ${filename}` });
  } catch {
    return c.json({ detail: "File not found" }, 404);
  }
});

app.get("/animations/file/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return c.json({ detail: "Invalid filename" }, 400);
  }

  const filePath = join(ANIMATIONS_DIR, filename);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return c.json({ detail: "File not found" }, 404);
  }

  const ext = extname(filename).toLowerCase();
  const mediaTypes: Record<string, string> = {
    ".fbx": "application/octet-stream",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
  };

  return new Response(file, {
    headers: { "Content-Type": mediaTypes[ext] ?? "application/octet-stream" },
  });
});

export { app as integrationRoutes };
