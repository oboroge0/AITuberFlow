/**
 * Style-Bert-VITS2 TTS Node
 *
 * Text-to-speech using Style-Bert-VITS2.
 */

import { join, resolve } from "path";
import { mkdirSync, existsSync } from "fs";
import { BaseNode, type NodeContext, createEvent } from "@aituber-flow/sdk";

/** Audio output directory */
const AUDIO_DIR = resolve(
  import.meta.dir,
  "..",
  "..",
  "apps",
  "server-ts",
  "audio_output",
);

export default class SBV2TTSNode extends BaseNode {
  private host = "http://localhost:5000";
  private modelName = "";
  private speakerId = 0;
  private style = "Neutral";
  private styleWeight = 1.0;
  private length = 1.0;
  private sdpRatio = 0.2;
  private demoMode = false;
  private connectionAvailable = true;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.host = config.host ?? "http://localhost:5000";
    this.modelName = config.modelName ?? "";
    this.speakerId = config.speakerId ?? 0;
    this.style = config.style ?? "Neutral";
    this.styleWeight = config.styleWeight ?? 1.0;
    this.length = config.length ?? 1.0;
    this.sdpRatio = config.sdpRatio ?? 0.2;
    this.demoMode = config.demoMode ?? false;

    // Ensure audio directory exists
    if (!existsSync(AUDIO_DIR)) {
      mkdirSync(AUDIO_DIR, { recursive: true });
    }

    // Test connection
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.host}/models/info`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        this.connectionAvailable = true;
        await context.log(`Style-Bert-VITS2 connected: ${this.host}`);
      } else {
        this.connectionAvailable = false;
        if (this.demoMode) {
          await context.log(
            "[デモモード] Style-Bert-VITS2接続テスト失敗 - スキップします",
            "warning",
          );
        } else {
          await context.log(
            "Style-Bert-VITS2 connection test failed",
            "warning",
          );
        }
      }
    } catch (e) {
      this.connectionAvailable = false;
      if (this.demoMode) {
        await context.log(
          `[デモモード] Style-Bert-VITS2に接続できません (${this.host}) - スキップします`,
          "warning",
        );
      } else {
        await context.log(
          `Cannot connect to Style-Bert-VITS2: ${String(e)}`,
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

    if (!text) {
      await context.log("No text provided", "warning");
      return { audio: "", filename: "", duration: 0 };
    }

    // Demo mode: skip TTS if connection is unavailable
    if (this.demoMode && !this.connectionAvailable) {
      const preview = text.length > 30 ? text.slice(0, 30) + "..." : text;
      await context.log(`[デモモード] TTS スキップ: ${preview}`, "info");
      return { audio: "", filename: "", duration: 0 };
    }

    try {
      await context.log(`Generating speech: ${text.slice(0, 50)}...`);

      // Build query parameters
      const params = new URLSearchParams({
        text,
        speaker_id: String(this.speakerId),
        style: this.style,
        style_weight: String(this.styleWeight),
        length: String(this.length),
        sdp_ratio: String(this.sdpRatio),
      });

      if (this.modelName) {
        params.set("model_name", this.modelName);
      }

      const url = `${this.host}/voice?${params}`;

      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.text();
        await context.log(`Synthesis failed: ${error}`, "error");
        return { audio: "" };
      }

      // Save audio file
      const audioData = new Uint8Array(await response.arrayBuffer());
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const filename = `sbv2_${id}.wav`;
      const filepath = join(AUDIO_DIR, filename);

      await Bun.write(filepath, audioData);

      const duration = getWavDuration(audioData);

      await context.log(`Audio generated: ${filename}`);

      // Emit audio event
      await context.emitEvent(
        createEvent("audio.generated", {
          filename,
          text,
          duration,
        }),
      );

      return { audio: filepath, filename, duration };
    } catch (e) {
      await context.log(`Style-Bert-VITS2 error: ${String(e)}`, "error");
      return { audio: "" };
    }
  }

  async teardown(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Parse WAV header to calculate duration in seconds.
 */
function getWavDuration(data: Uint8Array): number {
  try {
    if (data.length < 44) return 0;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const sampleRate = view.getUint32(24, true);
    const numChannels = view.getUint16(22, true);
    const bitsPerSample = view.getUint16(34, true);

    if (sampleRate === 0 || numChannels === 0 || bitsPerSample === 0) return 0;

    // Find the "data" subchunk to get the actual data size
    let offset = 12;
    while (offset + 8 < data.length) {
      const chunkId = String.fromCharCode(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
      );
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === "data") {
        const frames = chunkSize / (numChannels * (bitsPerSample / 8));
        return frames / sampleRate;
      }
      offset += 8 + chunkSize;
    }

    return 0;
  } catch {
    return 0;
  }
}
