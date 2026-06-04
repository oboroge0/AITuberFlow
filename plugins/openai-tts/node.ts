/**
 * OpenAI TTS Node
 *
 * Converts text to speech using OpenAI's TTS API.
 * Supports tts-1, tts-1-hd, and gpt-4o-mini-tts models.
 */

import { join, resolve } from "path";
import { mkdirSync, existsSync } from "fs";
import {
  BaseNode,
  type NodeContext,
  createEvent,
  getWavDuration,
} from "@aituber-flow/sdk";
import OpenAI from "openai";

const DEFAULT_AUDIO_DIR = resolve(
  import.meta.dir,
  "..",
  "..",
  "apps",
  "server-ts",
  "audio_output",
);

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

export default class OpenAITTSNode extends BaseNode {
  private static readonly DEMO_RESPONSE = "デモモード: APIキー未設定のためTTSをスキップします";

  private client: OpenAI | null = null;
  private model: string = "tts-1";
  private voice: string = "alloy";
  private speed: number = 1.0;
  private instructions: string = "";
  private outputDir: string = "";

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    const apiKey = config.apiKey ?? "";
    this.model = config.model ?? "tts-1";
    this.voice = config.voice ?? "alloy";
    this.speed = Number(config.speed ?? 1.0);
    this.instructions = config.instructions ?? "";
    this.outputDir = resolveAudioOutputDir(config.outputDir);

    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    if (!apiKey) {
      await context.log(
        "[デモモード] OpenAI APIキー未設定 - TTSをスキップします",
        "warning",
      );
    } else {
      this.client = new OpenAI({ apiKey });
      await context.log(
        `OpenAI TTS initialized (model: ${this.model}, voice: ${this.voice})`,
      );
    }
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

    if (!this.client) {
      await context.log("[デモモード] TTS スキップ", "info");
      return { audio: "", audioUrl: "", filename: "", duration: 0 };
    }

    try {
      await context.log(`Generating speech: ${text.slice(0, 30)}...`);

      const requestBody: Record<string, any> = {
        model: this.model,
        voice: this.voice,
        input: text,
        speed: this.speed,
        response_format: "wav",
      };

      // instructions is only supported by gpt-4o-mini-tts
      if (this.model === "gpt-4o-mini-tts" && this.instructions) {
        requestBody.instructions = this.instructions;
      }

      const response = await this.client.audio.speech.create(requestBody as any);

      const audioData = new Uint8Array(await response.arrayBuffer());
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const filename = `openai_tts_${id}.wav`;
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMsg = `OpenAI TTS error: ${message}`;
      await context.log(errorMsg, "error");
      throw new Error(errorMsg);
    }
  }

  async teardown(): Promise<void> {
    this.client = null;
  }
}
