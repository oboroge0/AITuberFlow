/**
 * COEIROINK TTS Node
 *
 * Text-to-speech using COEIROINK.
 */

import { join, resolve } from "path";
import { mkdirSync, existsSync } from "fs";
import { BaseNode, type NodeContext, createEvent, getWavDuration } from "@aituber-flow/sdk";

/** Audio output directory */
const AUDIO_DIR = resolve(
  import.meta.dir,
  "..",
  "..",
  "apps",
  "server-ts",
  "audio_output",
);

export default class CoeiroinkTTSNode extends BaseNode {
  private host = "http://localhost:50032";
  private speakerUuid = "";
  private styleId = 0;
  private speedScale = 1.0;
  private volumeScale = 1.0;
  private pitchScale = 1.0;
  private demoMode = false;
  private connectionAvailable = true;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.host = config.host ?? "http://localhost:50032";
    this.speakerUuid = config.speakerUuid ?? "";
    this.styleId = config.styleId ?? 0;
    this.speedScale = config.speedScale ?? 1.0;
    this.volumeScale = config.volumeScale ?? 1.0;
    this.pitchScale = config.pitchScale ?? 1.0;
    this.demoMode = config.demoMode ?? false;

    // Ensure audio directory exists
    if (!existsSync(AUDIO_DIR)) {
      mkdirSync(AUDIO_DIR, { recursive: true });
    }

    if (!this.speakerUuid) {
      await context.log("Speaker UUID not configured", "warning");
    }

    // Test connection
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.host}/v1/speakers`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        this.connectionAvailable = true;
        await context.log(`COEIROINK connected: ${this.host}`);
      } else {
        this.connectionAvailable = false;
        if (this.demoMode) {
          await context.log(
            "[デモモード] COEIROINK接続テスト失敗 - スキップします",
            "warning",
          );
        } else {
          await context.log("COEIROINK connection test failed", "warning");
        }
      }
    } catch (e) {
      this.connectionAvailable = false;
      if (this.demoMode) {
        await context.log(
          `[デモモード] COEIROINKに接続できません (${this.host}) - スキップします`,
          "warning",
        );
      } else {
        await context.log(
          `Cannot connect to COEIROINK: ${String(e)}`,
          "warning",
        );
      }
    }
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const text = (inputs.text as string) ?? "";
    const emptyResult = { audio: "", audioUrl: "", filename: "", duration: 0 };

    if (!text) {
      await context.log("No text provided", "warning");
      return emptyResult;
    }

    // Demo mode: skip TTS if connection is unavailable
    if (this.demoMode && !this.connectionAvailable) {
      const preview = text.length > 30 ? text.slice(0, 30) + "..." : text;
      await context.log(`[デモモード] TTS スキップ: ${preview}`, "info");
      return emptyResult;
    }

    if (!this.speakerUuid) {
      await context.log("Speaker UUID not configured", "error");
      return emptyResult;
    }

    try {
      await context.log(`Generating speech: ${text.slice(0, 50)}...`);

      // Step 1: Estimate prosody
      const queryUrl = `${this.host}/v1/estimate_prosody`;
      const queryPayload = {
        text,
        speakerUuid: this.speakerUuid,
        styleId: this.styleId,
      };

      const prosodyResponse = await fetch(queryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryPayload),
      });

      if (!prosodyResponse.ok) {
        const error = await prosodyResponse.text();
        await context.log(`Prosody estimation failed: ${error}`, "error");
        return emptyResult;
      }

      const prosody = await prosodyResponse.json();

      // Step 2: Synthesize audio
      const synthUrl = `${this.host}/v1/synthesis`;
      const synthPayload = {
        speakerUuid: this.speakerUuid,
        styleId: this.styleId,
        text,
        prosodyDetail: prosody.detail ?? [],
        speedScale: this.speedScale,
        volumeScale: this.volumeScale,
        pitchScale: this.pitchScale,
      };

      const synthResponse = await fetch(synthUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(synthPayload),
      });

      if (!synthResponse.ok) {
        const error = await synthResponse.text();
        await context.log(`Synthesis failed: ${error}`, "error");
        return emptyResult;
      }

      // Save audio file
      const audioData = new Uint8Array(await synthResponse.arrayBuffer());
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const filename = `coeiroink_${id}.wav`;
      const filepath = join(AUDIO_DIR, filename);

      await Bun.write(filepath, audioData);

      const duration = getWavDuration(audioData);

      const audioUrl = `/api/integrations/audio/${filename}`;

      await context.log(`Audio generated: ${duration.toFixed(2)}s`);

      // Emit audio event
      await context.emitEvent(
        createEvent("audio.generated", {
          audio: filepath,
          audioUrl,
          filename,
          duration,
          text,
        }),
      );

      return { audio: filepath, audioUrl, filename, duration };
    } catch (e) {
      const errorMsg = `COEIROINK error: ${String(e)}`;
      await context.log(errorMsg, "error");
      throw new Error(errorMsg);
    }
  }

  async teardown(): Promise<void> {
    // No cleanup needed
  }
}
