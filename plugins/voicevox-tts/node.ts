/**
 * VOICEVOX TTS Node
 *
 * Converts text to speech using VOICEVOX engine.
 */

import { join, resolve } from "path";
import { mkdirSync, existsSync } from "fs";
import {
  BaseNode,
  type NodeContext,
  createEvent,
  ErrorCode,
  getErrorMessage,
} from "@aituber-flow/sdk";

/** Audio output directory */
const AUDIO_DIR = resolve(
  import.meta.dir,
  "..",
  "..",
  "apps",
  "server",
  "audio_output",
);

interface Speaker {
  name?: string;
  styles?: Array<{ id?: number; name?: string }>;
}

export default class VoicevoxTTSNode extends BaseNode {
  private host = "http://localhost:50021";
  private speaker = 1;
  private speedScale = 1.0;
  private pitchScale = 0.0;
  private volumeScale = 1.0;
  private outputDir = "";
  private demoMode = false;
  private connectionAvailable = true;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.host = (config.host ?? "http://localhost:50021").replace(/\/+$/, "");
    this.speaker = Number(config.speaker ?? 1);
    this.speedScale = Number(config.speedScale ?? 1.0);
    this.pitchScale = Number(config.pitchScale ?? 0.0);
    this.volumeScale = Number(config.volumeScale ?? 1.0);
    this.outputDir = AUDIO_DIR;
    this.demoMode = config.demoMode ?? false;

    if (!existsSync(AUDIO_DIR)) {
      mkdirSync(AUDIO_DIR, { recursive: true });
    }

    if (config.outputDir) {
      await context.log(
        "outputDir is ignored; using server audio_output directory",
        "warning",
      );
    }

    // Test connection
    try {
      const response = await fetch(`${this.host}/speakers`);
      if (response.ok) {
        const speakers: Speaker[] = await response.json();
        const speakerName = this.getSpeakerName(speakers, this.speaker);
        await context.log(`VOICEVOX connected (speaker: ${speakerName})`);
        this.connectionAvailable = true;
      } else {
        this.connectionAvailable = false;
        if (this.demoMode) {
          await context.log(
            "[デモモード] VOICEVOX接続テスト失敗 - スキップします",
            "warning",
          );
        } else {
          await context.log("VOICEVOX connection test failed", "warning");
        }
      }
    } catch {
      this.connectionAvailable = false;
      if (this.demoMode) {
        await context.log(
          `[デモモード] VOICEVOXに接続できません (${this.host}) - スキップします`,
          "warning",
        );
      } else {
        const errorMsg = getErrorMessage(ErrorCode.TTS_CONNECTION_FAILED, "ja", {
          service: "VOICEVOX",
          host: this.host,
        });
        await context.log(errorMsg, "error");
      }
    }
  }

  private getSpeakerName(speakers: Speaker[], speakerId: number): string {
    for (const speaker of speakers) {
      for (const style of speaker.styles ?? []) {
        if (style.id === speakerId) {
          return `${speaker.name ?? "Unknown"} (${style.name ?? ""})`;
        }
      }
    }
    return `Speaker ${speakerId}`;
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const text = (inputs.text as string) ?? "";
    if (!text) {
      await context.log("No text provided for TTS", "warning");
      return { audio: "", audioUrl: "", filename: "", duration: 0 };
    }

    // Demo mode: skip TTS if connection is unavailable
    if (this.demoMode && !this.connectionAvailable) {
      const preview = text.length > 30 ? text.slice(0, 30) + "..." : text;
      await context.log(`[デモモード] TTS スキップ: ${preview}`, "info");
      return { audio: "", audioUrl: "", filename: "", duration: 0 };
    }

    try {
      await context.log(`Generating speech: ${text.slice(0, 30)}...`);

      // Step 1: Create audio query
      const queryParams = new URLSearchParams({
        text,
        speaker: String(this.speaker),
      });
      const queryResponse = await fetch(
        `${this.host}/audio_query?${queryParams}`,
        { method: "POST" },
      );
      if (!queryResponse.ok) {
        throw new Error(`audio_query failed: ${queryResponse.status}`);
      }
      const query = await queryResponse.json();

      // Apply settings
      query.speedScale = this.speedScale;
      query.pitchScale = this.pitchScale;
      query.volumeScale = this.volumeScale;

      // Step 2: Synthesize audio
      const synthParams = new URLSearchParams({
        speaker: String(this.speaker),
      });
      const synthResponse = await fetch(
        `${this.host}/synthesis?${synthParams}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(query),
        },
      );
      if (!synthResponse.ok) {
        throw new Error(`synthesis failed: ${synthResponse.status}`);
      }

      // Save audio file
      const audioData = new Uint8Array(await synthResponse.arrayBuffer());
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const filename = `voicevox_${id}.wav`;
      const audioPath = join(this.outputDir, filename);

      await Bun.write(audioPath, audioData);

      // Calculate duration from WAV
      const duration = getWavDuration(audioData);

      await context.log(`Audio generated: ${duration.toFixed(2)}s`);

      // Emit event
      await context.emitEvent(
        createEvent("audio.generated", {
          audio: audioPath,
          audioUrl: audioPath,
          filename,
          duration,
          text,
        }),
      );

      return { audio: audioPath, audioUrl: audioPath, filename, duration };
    } catch (e) {
      if (
        e instanceof TypeError &&
        (e.message.includes("fetch") || e.message.includes("connect"))
      ) {
        const errorMsg = getErrorMessage(
          ErrorCode.TTS_CONNECTION_FAILED,
          "ja",
          { service: "VOICEVOX", host: this.host },
        );
        await context.log(errorMsg, "error");
      } else {
        const errorMsg = getErrorMessage(
          ErrorCode.TTS_SYNTHESIS_FAILED,
          "ja",
          { service: "VOICEVOX", error: String(e) },
        );
        await context.log(errorMsg, "error");
      }
      return { audio: "", audioUrl: "", filename: "", duration: 0 };
    }
  }

  async teardown(): Promise<void> {
    // No persistent client to close with fetch
  }
}

/**
 * Parse WAV header to calculate duration in seconds.
 */
function getWavDuration(data: Uint8Array): number {
  try {
    // WAV header: bytes 24-27 = sample rate (little-endian uint32)
    // WAV header: bytes 28-31 = byte rate (little-endian uint32)
    // Total data size = file size - 44 (standard header)
    if (data.length < 44) return 0;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const sampleRate = view.getUint32(24, true);
    const numChannels = view.getUint16(22, true);
    const bitsPerSample = view.getUint16(34, true);

    if (sampleRate === 0 || numChannels === 0 || bitsPerSample === 0) return 0;

    // Find the "data" subchunk to get the actual data size
    let offset = 12; // skip RIFF header
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
