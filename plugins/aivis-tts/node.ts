/**
 * AivisSpeech TTS Node
 *
 * Converts text to speech using AivisSpeech engine (VOICEVOX-compatible API).
 * Default port: 10101 (vs VOICEVOX's 50021)
 */

import { join, resolve } from "path";
import { mkdirSync, existsSync } from "fs";
import {
  BaseNode,
  type NodeContext,
  createEvent,
  ErrorCode,
  getErrorMessage,
  getWavDuration,
} from "@aituber-flow/sdk";

const DEFAULT_AUDIO_DIR = resolve(
  import.meta.dir,
  "..",
  "..",
  "apps",
  "server-ts",
  "audio_output",
);
const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 30_000;
const SYNTH_TIMEOUT_MS = 60_000;

function resolveAudioOutputDir(configOutputDir: unknown): string {
  if (typeof configOutputDir === "string" && configOutputDir.trim()) {
    return resolve(configOutputDir.trim());
  }
  const envOutputDir = process.env.AUDIO_OUTPUT_DIR;
  if (envOutputDir && envOutputDir.trim()) {
    return resolve(envOutputDir.trim());
  }
  return DEFAULT_AUDIO_DIR;
}

interface Speaker {
  name?: string;
  styles?: Array<{ id?: number; name?: string }>;
}

export default class AivisSpeechTTSNode extends BaseNode {
  private host = "http://localhost:10101";
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
    this.host = (config.host ?? "http://localhost:10101").replace(/\/+$/, "");
    this.speaker = Number(config.speaker ?? 1);
    this.speedScale = Number(config.speedScale ?? 1.0);
    this.pitchScale = Number(config.pitchScale ?? 0.0);
    this.volumeScale = Number(config.volumeScale ?? 1.0);
    this.outputDir = resolveAudioOutputDir(config.outputDir);
    this.demoMode = config.demoMode ?? false;

    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    try {
      const response = await fetch(`${this.host}/speakers`, {
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      });
      if (response.ok) {
        const speakers: Speaker[] = await response.json();
        const speakerName = this.getSpeakerName(speakers, this.speaker);
        await context.log(`AivisSpeech connected (speaker: ${speakerName})`);
        this.connectionAvailable = true;
      } else {
        this.connectionAvailable = false;
        if (this.demoMode) {
          await context.log(
            "[デモモード] AivisSpeech接続テスト失敗 - スキップします",
            "warning",
          );
        } else {
          await context.log("AivisSpeech connection test failed", "warning");
        }
      }
    } catch {
      this.connectionAvailable = false;
      if (this.demoMode) {
        await context.log(
          `[デモモード] AivisSpeechに接続できません (${this.host}) - スキップします`,
          "warning",
        );
      } else {
        const errorMsg = getErrorMessage(ErrorCode.TTS_CONNECTION_FAILED, "ja", {
          service: "AivisSpeech",
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

    if (this.demoMode && !this.connectionAvailable) {
      const preview = text.length > 30 ? text.slice(0, 30) + "..." : text;
      await context.log(`[デモモード] TTS スキップ: ${preview}`, "info");
      return { audio: "", audioUrl: "", filename: "", duration: 0 };
    }

    try {
      await context.log(`Generating speech: ${text.slice(0, 30)}...`);

      // Step 1: Create audio query (VOICEVOX-compatible)
      const queryParams = new URLSearchParams({
        text,
        speaker: String(this.speaker),
      });
      const queryResponse = await fetch(
        `${this.host}/audio_query?${queryParams}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
        },
      );
      if (!queryResponse.ok) {
        throw new Error(`audio_query failed: ${queryResponse.status}`);
      }
      const query = await queryResponse.json();

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
          signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
        },
      );
      if (!synthResponse.ok) {
        throw new Error(`synthesis failed: ${synthResponse.status}`);
      }

      const audioData = new Uint8Array(await synthResponse.arrayBuffer());
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const filename = `aivis_${id}.wav`;
      const audioPath = join(this.outputDir, filename);

      await Bun.write(audioPath, audioData);

      const duration = getWavDuration(audioData);
      const audioUrl = `/api/integrations/audio/${filename}`;

      await context.log(`Audio generated: ${duration.toFixed(2)}s`);

      await context.emitEvent(
        createEvent("audio.generated", {
          audio: audioPath,
          audioUrl,
          filename,
          duration,
          text,
        }),
      );

      return { audio: audioPath, audioUrl, filename, duration };
    } catch (e) {
      if (
        (e instanceof TypeError &&
          (e.message.includes("fetch") || e.message.includes("connect"))) ||
        (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError"))
      ) {
        const errorMsg = getErrorMessage(
          ErrorCode.TTS_CONNECTION_FAILED,
          "ja",
          { service: "AivisSpeech", host: this.host },
        );
        await context.log(errorMsg, "error");
      } else {
        const errorMsg = getErrorMessage(
          ErrorCode.TTS_SYNTHESIS_FAILED,
          "ja",
          { service: "AivisSpeech", error: String(e) },
        );
        await context.log(errorMsg, "error");
      }
      return { audio: "", audioUrl: "", filename: "", duration: 0 };
    }
  }

  async teardown(): Promise<void> {}
}
