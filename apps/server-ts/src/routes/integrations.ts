/**
 * Integrations API Routes - VOICEVOX, file management.
 *
 * Ported from Python apps/server/routers/integrations.py
 */

import { Hono } from "hono";
import { join, extname } from "path";
import { readdir, mkdir, unlink } from "fs/promises";
import { getProjectRoot } from "../engine/plugin-loader";

const app = new Hono();

const PROJECT_ROOT = getProjectRoot();
const UPLOAD_DIR = join(PROJECT_ROOT, "apps", "web", "public", "models");
const ANIMATIONS_DIR = join(
  PROJECT_ROOT,
  "apps",
  "web",
  "public",
  "animations"
);
const AUDIO_DIR = join(PROJECT_ROOT, "apps", "server-ts", "audio_output");

const ALLOWED_EXTENSIONS = new Set([
  ".vrm",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);
const ALLOWED_ANIMATION_EXTENSIONS = new Set([".fbx", ".glb", ".gltf"]);

// Ensure directories exist
await mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
await mkdir(ANIMATIONS_DIR, { recursive: true }).catch(() => {});
await mkdir(AUDIO_DIR, { recursive: true }).catch(() => {});

// ─── VOICEVOX ─────────────────────────────

app.get("/voicevox/speakers", async (c) => {
  const host = c.req.query("host") ?? "http://localhost:50021";

  try {
    const response = await fetch(`${host.replace(/\/$/, "")}/speakers`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return c.json(
        { detail: `VOICEVOX API error: ${response.statusText}` },
        response.status as any
      );
    }

    const speakersData: any[] = await response.json();
    const speakers = speakersData.flatMap((speaker: any) =>
      (speaker.styles ?? []).map((style: any) => ({
        id: style.id,
        name: speaker.name ?? "Unknown",
        style: style.name ?? "Normal",
        label: `${speaker.name ?? "Unknown"} (${style.name ?? "Normal"})`,
      }))
    );

    return c.json({ speakers });
  } catch (err: any) {
    if (err.name === "TypeError" || err.cause?.code === "ECONNREFUSED") {
      return c.json(
        {
          detail: `Cannot connect to VOICEVOX at ${host}. Make sure VOICEVOX is running.`,
        },
        503
      );
    }
    return c.json({ detail: `Failed to fetch speakers: ${err}` }, 500);
  }
});

app.get("/voicevox/health", async (c) => {
  const host = c.req.query("host") ?? "http://localhost:50021";
  try {
    const response = await fetch(`${host.replace(/\/$/, "")}/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(response.statusText);
    const version = (await response.text()).replace(/"/g, "");
    return c.json({ status: "healthy", version, host });
  } catch (err) {
    return c.json({ status: "unhealthy", error: String(err), host });
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

  return new Response(file, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": `inline; filename="${filename}"`,
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
      400
    );
  }

  const uniqueId = crypto.randomUUID().substring(0, 8);
  const stem = file.name.replace(/\.[^.]+$/, "");
  const safeFilename = `${uniqueId}_${stem}${ext}`;
  const filePath = join(UPLOAD_DIR, safeFilename);

  try {
    const buffer = await file.arrayBuffer();
    await Bun.write(filePath, buffer);
    const urlPath = `/api/integrations/models/file/${safeFilename}`;
    return c.json({
      success: true,
      filename: safeFilename,
      url: urlPath,
      size: buffer.byteLength,
    });
  } catch (err) {
    return c.json({ detail: `Failed to upload: ${err}` }, 500);
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
  if (filename.includes("..") || filename.includes("/")) {
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
  if (filename.includes("..") || filename.includes("/")) {
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
      400
    );
  }

  const uniqueId = crypto.randomUUID().substring(0, 8);
  const stem = file.name.replace(/\.[^.]+$/, "");
  const safeFilename = `${uniqueId}_${stem}${ext}`;
  const filePath = join(ANIMATIONS_DIR, safeFilename);

  try {
    const buffer = await file.arrayBuffer();
    await Bun.write(filePath, buffer);
    return c.json({
      success: true,
      filename: safeFilename,
      url: `/api/integrations/animations/file/${safeFilename}`,
      size: buffer.byteLength,
    });
  } catch (err) {
    return c.json({ detail: `Failed to upload: ${err}` }, 500);
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
  if (filename.includes("..") || filename.includes("/")) {
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
  if (filename.includes("..") || filename.includes("/")) {
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
