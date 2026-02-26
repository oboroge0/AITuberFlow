/**
 * Lip Sync Node
 * Generates lip sync data from audio for avatar mouth animation.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class LipSyncNode extends BaseNode {
  private method = "volume";
  private sensitivity = 5.0;
  private smoothing = 0.3;
  private threshold = 0.02;
  private emitRealtime = true;
  private frameRate = 30;

  async setup(config: Record<string, any>, _context: NodeContext): Promise<void> {
    this.method = config.method ?? "volume";
    this.sensitivity = Number(config.sensitivity ?? 5.0);
    this.smoothing = Number(config.smoothing ?? 0.3);
    this.threshold = Number(config.threshold ?? 0.02);
    this.emitRealtime = config.emitRealtime ?? true;
    this.frameRate = Number(config.frameRate ?? 30);
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    let audio: Uint8Array | null = inputs.audio ?? null;
    let audioUrl: string = inputs.audio_url ?? inputs.audioUrl ?? "";
    let originalPath: string | null = null;

    // Handle case where audio is a dict (e.g., from voicevox-tts output)
    if (audio !== null && typeof audio === "object" && !(audio instanceof Uint8Array)) {
      const audioObj = audio as Record<string, any>;
      originalPath =
        audioObj.audioUrl ?? audioObj.audio_url ?? audioObj.audio ?? audioObj.filename ?? null;
      if (!audioUrl) {
        audioUrl = originalPath ?? "";
      }
      audio = null;
    } else if (typeof audio === "string") {
      originalPath = audio;
      if (!audioUrl) {
        audioUrl = audio;
      }
      audio = null;
    }

    if (!audio && !audioUrl) {
      await context.log("No audio input provided", "warning");
      return { mouthValues: [], duration: 0.0, audio: "" };
    }

    // If audioUrl is provided, load the audio from file
    if (audioUrl && !audio) {
      await context.log(`Loading audio from: ${audioUrl}`);
      audio = await this.loadAudio(audioUrl, context);
    }

    if (!audio) {
      return { mouthValues: [], duration: 0.0, audio: originalPath ?? "" };
    }

    // Analyze audio
    let mouthValues: number[];
    let duration: number;
    try {
      [mouthValues, duration] = this.analyzeAudio(audio);
    } catch (e) {
      await context.log(`Error analyzing audio: ${e}`, "error");
      return { mouthValues: [], duration: 0.0, audio: originalPath ?? "" };
    }

    await context.log(
      `Generated ${mouthValues.length} lip sync frames for ${duration.toFixed(2)}s audio`,
    );

    // Emit realtime events if enabled
    if (this.emitRealtime && mouthValues.length > 0) {
      context.createTask(async (signal) => {
        await this.emitRealtimeEvents(mouthValues, signal, context);
      });
    }

    return {
      mouthValues,
      duration,
      audio: originalPath ?? "",
    };
  }

  private async loadAudio(
    pathOrUrl: string,
    context: NodeContext,
  ): Promise<Uint8Array | null> {
    const resolvedPath = this.resolveAudioPath(pathOrUrl);
    if (resolvedPath) {
      try {
        const file = Bun.file(resolvedPath);
        const buffer = await file.arrayBuffer();
        return new Uint8Array(buffer);
      } catch (e) {
        await context.log(`Error reading audio file: ${e}`, "error");
        return null;
      }
    }

    // Otherwise, treat as URL
    try {
      const response = await fetch(pathOrUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      } else {
        await context.log(`Failed to load audio: HTTP ${response.status}`, "error");
        return null;
      }
    } catch (e) {
      await context.log(`Error loading audio from URL: ${e}`, "error");
      return null;
    }
  }

  private resolveAudioPath(pathOrUrl: string): string | null {
    const { existsSync } = require("fs");
    const { join, basename } = require("path");
    const { tmpdir } = require("os");

    if (existsSync(pathOrUrl)) {
      return pathOrUrl;
    }

    const filename = basename(pathOrUrl);
    if (!filename) return null;

    const tempCandidate = join(tmpdir(), filename);
    if (existsSync(tempCandidate)) {
      return tempCandidate;
    }

    // Try project audio_output directory
    const projectRoot = join(__dirname, "..", "..");
    const audioOutput = join(projectRoot, "apps", "server", "audio_output", filename);
    if (existsSync(audioOutput)) {
      return audioOutput;
    }

    return null;
  }

  private analyzeAudio(audio: Uint8Array): [number[], number] {
    let samples: number[];
    let sampleRate: number;
    let duration: number;

    // Try to parse as WAV
    try {
      [samples, sampleRate, duration] = this.parseWav(audio);
    } catch {
      // Assume raw PCM 16-bit mono 24kHz (common for TTS)
      samples = this.parseRawPcm(audio);
      sampleRate = 24000;
      duration = samples.length / sampleRate;
    }

    if (samples.length === 0) {
      return [[], 0.0];
    }

    // Generate mouth values at specified frame rate
    const numFrames = Math.max(1, Math.floor(duration * this.frameRate));
    const samplesPerFrame =
      numFrames > 0 ? Math.floor(samples.length / numFrames) : samples.length;

    const minVisible = Math.max(0.02, this.threshold);
    const maxGain = 12.0;
    const targetPeak = 0.8;

    // First pass: compute raw frame values
    const frameValues: number[] = [];
    for (let i = 0; i < numFrames; i++) {
      const startIdx = i * samplesPerFrame;
      const endIdx = Math.min(startIdx + samplesPerFrame, samples.length);
      const frameSamples = samples.slice(startIdx, endIdx);

      if (frameSamples.length === 0) {
        frameValues.push(0.0);
        continue;
      }

      if (this.method === "volume") {
        frameValues.push(this.calculateRms(frameSamples));
      } else {
        frameValues.push(this.calculateEnvelope(frameSamples));
      }
    }

    // Calculate adaptive gain
    const maxValue = frameValues.length > 0 ? Math.max(...frameValues) : 0.0;
    let gain: number;
    if (maxValue > 0) {
      gain = Math.max(
        1.0,
        Math.min(maxGain, targetPeak / (maxValue * Math.max(this.sensitivity, 0.001))),
      );
    } else {
      gain = 1.0;
    }

    // Second pass: apply gain, threshold, and smoothing
    const mouthValues: number[] = [];
    let prevValue = 0.0;

    for (const rawValue of frameValues) {
      if (rawValue <= 0) {
        mouthValues.push(0.0);
        prevValue = 0.0;
        continue;
      }

      let value = Math.min(1.0, rawValue * this.sensitivity * gain);

      // Apply threshold (silence detection)
      if (value < this.threshold) {
        value = 0.0;
      }

      // Apply smoothing
      let smoothedValue = prevValue * this.smoothing + value * (1 - this.smoothing);

      // Force to 0 if below minimum visible threshold
      if (smoothedValue < minVisible) {
        smoothedValue = 0.0;
      }

      prevValue = smoothedValue;
      mouthValues.push(Math.round(smoothedValue * 1000) / 1000);
    }

    // Ensure the last few frames close the mouth (add decay frames)
    for (let i = 0; i < 5; i++) {
      prevValue *= 0.3;
      if (prevValue < minVisible) {
        mouthValues.push(0.0);
        break;
      }
      mouthValues.push(Math.round(prevValue * 1000) / 1000);
    }

    return [mouthValues, duration];
  }

  private parseWav(audio: Uint8Array): [number[], number, number] {
    const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);

    // Validate RIFF header
    const riff =
      String.fromCharCode(audio[0]) +
      String.fromCharCode(audio[1]) +
      String.fromCharCode(audio[2]) +
      String.fromCharCode(audio[3]);
    if (riff !== "RIFF") throw new Error("Not a WAV file");

    const wave =
      String.fromCharCode(audio[8]) +
      String.fromCharCode(audio[9]) +
      String.fromCharCode(audio[10]) +
      String.fromCharCode(audio[11]);
    if (wave !== "WAVE") throw new Error("Not a WAV file");

    let offset = 12;
    let sampleRate = 0;
    let numChannels = 0;
    let sampleWidth = 0;

    // Find fmt and data chunks
    while (offset < audio.byteLength - 8) {
      const chunkId =
        String.fromCharCode(audio[offset]) +
        String.fromCharCode(audio[offset + 1]) +
        String.fromCharCode(audio[offset + 2]) +
        String.fromCharCode(audio[offset + 3]);
      const chunkSize = view.getUint32(offset + 4, true);
      offset += 8;

      if (chunkId === "fmt ") {
        numChannels = view.getUint16(offset + 2, true);
        sampleRate = view.getUint32(offset + 4, true);
        sampleWidth = view.getUint16(offset + 14, true) / 8; // bits to bytes
        offset += chunkSize;
      } else if (chunkId === "data") {
        const dataSize = chunkSize;
        const nFrames = Math.floor(dataSize / (numChannels * sampleWidth));

        let maxVal: number;
        if (sampleWidth === 1) {
          maxVal = 128.0;
        } else if (sampleWidth === 2) {
          maxVal = 32768.0;
        } else {
          throw new Error(`Unsupported sample width: ${sampleWidth}`);
        }

        // Read samples
        const rawSamples: number[] = [];
        let sampleOffset = offset;
        const totalSamples = nFrames * numChannels;
        for (let i = 0; i < totalSamples; i++) {
          if (sampleWidth === 1) {
            rawSamples.push(view.getInt8(sampleOffset));
          } else {
            rawSamples.push(view.getInt16(sampleOffset, true));
          }
          sampleOffset += sampleWidth;
        }

        // Convert to mono float samples
        let samples: number[];
        if (numChannels === 2) {
          samples = [];
          for (let i = 0; i < rawSamples.length; i += 2) {
            samples.push((rawSamples[i] + rawSamples[i + 1]) / 2 / maxVal);
          }
        } else {
          samples = rawSamples.map((s) => s / maxVal);
        }

        const duration = nFrames / sampleRate;
        return [samples, sampleRate, duration];
      } else {
        offset += chunkSize;
      }
    }

    throw new Error("No data chunk found in WAV");
  }

  private parseRawPcm(audio: Uint8Array): number[] {
    const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
    const nSamples = Math.floor(audio.byteLength / 2);
    const samples: number[] = [];
    for (let i = 0; i < nSamples; i++) {
      samples.push(view.getInt16(i * 2, true) / 32768.0);
    }
    return samples;
  }

  private calculateRms(samples: number[]): number {
    if (samples.length === 0) return 0.0;
    const sumSquared = samples.reduce((acc, s) => acc + s * s, 0);
    return Math.sqrt(sumSquared / samples.length);
  }

  private calculateEnvelope(samples: number[]): number {
    if (samples.length === 0) return 0.0;
    return Math.max(...samples.map((s) => Math.abs(s)));
  }

  private async emitRealtimeEvents(
    mouthValues: number[],
    signal: AbortSignal,
    context: NodeContext,
  ): Promise<void> {
    if (mouthValues.length === 0) return;

    const frameInterval = 1000 / this.frameRate; // milliseconds

    for (const value of mouthValues) {
      if (signal.aborted) return;
      await context.emitEvent({
        type: "avatar.mouth",
        payload: { value },
        timestamp: new Date().toISOString(),
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, frameInterval);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("Aborted"));
          },
          { once: true },
        );
      });
    }

    // Ensure mouth is closed at the end
    if (!signal.aborted) {
      await context.emitEvent({
        type: "avatar.mouth",
        payload: { value: 0.0 },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
