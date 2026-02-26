/**
 * Audio Player Node
 *
 * Plays audio files and emits playback events for synchronization with lip-sync.
 * Can wait for playback completion before continuing the workflow.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class AudioPlayerNode extends BaseNode {
  private waitForCompletion = true;
  private volume = 1.0;
  private outputDevice = "browser";

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.waitForCompletion = config.waitForCompletion ?? true;
    this.volume = config.volume ?? 1.0;
    this.outputDevice = config.outputDevice ?? "browser";

    await context.log(
      `Audio player initialized: output=${this.outputDevice}, ` +
        `wait=${this.waitForCompletion}, volume=${this.volume}`,
    );
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const audioPath: string = inputs.audio ?? "";
    const providedDuration: number | undefined = inputs.duration;

    if (!audioPath) {
      await context.log("No audio file provided", "warning");
      return { audio: "", duration: 0 };
    }

    // Calculate duration if not provided
    let duration: number;
    if (providedDuration !== undefined) {
      duration = Number(providedDuration);
    } else {
      duration = await this.getAudioDuration(audioPath, context);
    }

    // Emit audio play event
    await context.emitEvent(
      createEvent("audio.play", {
        filename: audioPath,
        duration,
        volume: this.volume,
        output: this.outputDevice,
      }),
    );
    await context.log(`Playing audio: ${audioPath} (${duration.toFixed(2)}s)`);

    // Wait for playback to complete if configured
    if (this.waitForCompletion && duration > 0) {
      await new Promise((resolve) => setTimeout(resolve, duration * 1000));
      await context.emitEvent(createEvent("audio.stop", { filename: audioPath }));
    }

    return { audio: audioPath, duration };
  }

  private async getAudioDuration(
    audioPath: string,
    context: NodeContext,
  ): Promise<number> {
    try {
      const { existsSync } = require("fs");
      const { join, basename } = require("path");

      // Handle both relative and absolute paths
      let fullPath: string;
      if (audioPath.startsWith("/")) {
        fullPath = join("audio_output", audioPath.replace(/^\/+/, ""));
      } else {
        fullPath = audioPath;
      }

      if (!existsSync(fullPath)) {
        fullPath = join("audio_output", basename(audioPath));
      }

      if (!existsSync(fullPath)) {
        await context.log(`Audio file not found: ${audioPath}`, "warning");
        return 0.0;
      }

      const file = Bun.file(fullPath);
      const buffer = new Uint8Array(await file.arrayBuffer());
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

      // Read WAV header
      const riff =
        String.fromCharCode(buffer[0]) +
        String.fromCharCode(buffer[1]) +
        String.fromCharCode(buffer[2]) +
        String.fromCharCode(buffer[3]);
      if (riff !== "RIFF") {
        await context.log("Not a valid WAV file", "warning");
        return 0.0;
      }

      const wave =
        String.fromCharCode(buffer[8]) +
        String.fromCharCode(buffer[9]) +
        String.fromCharCode(buffer[10]) +
        String.fromCharCode(buffer[11]);
      if (wave !== "WAVE") return 0.0;

      // Find fmt and data chunks
      let offset = 12;
      let byteRate = 0;

      while (offset < buffer.byteLength - 8) {
        const chunkId =
          String.fromCharCode(buffer[offset]) +
          String.fromCharCode(buffer[offset + 1]) +
          String.fromCharCode(buffer[offset + 2]) +
          String.fromCharCode(buffer[offset + 3]);
        const chunkSize = view.getUint32(offset + 4, true);
        offset += 8;

        if (chunkId === "fmt ") {
          byteRate = view.getUint32(offset + 8, true);
          offset += chunkSize;
        } else if (chunkId === "data") {
          if (byteRate > 0) {
            return chunkSize / byteRate;
          }
          break;
        } else {
          offset += chunkSize;
        }
      }

      return 0.0;
    } catch (e) {
      await context.log(`Error reading audio file: ${e}`, "error");
      return 0.0;
    }
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
