/**
 * Tests for getWavDuration in @aituber-flow/sdk
 */

import { describe, it, expect } from "bun:test";
import { getWavDuration } from "../../packages/sdk-ts/src/audio-utils";

/**
 * Build a minimal valid WAV file buffer.
 * PCM 16-bit mono at the given sample rate, with `numSamples` silence frames.
 */
function buildWav(sampleRate: number, numSamples: number, numChannels = 1, bitsPerSample = 16): Uint8Array {
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 44 + dataSize - 8; // RIFF chunk size = file size - 8

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, fileSize, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt subchunk
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // subchunk size (PCM = 16)
  view.setUint16(20, 1, true); // audio format (PCM = 1)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);
  // Remaining bytes are zero (silence)

  return bytes;
}

describe("getWavDuration", () => {
  it("returns correct duration for 1 second at 44100Hz", () => {
    const wav = buildWav(44100, 44100);
    const duration = getWavDuration(wav);
    expect(duration).toBeCloseTo(1.0, 5);
  });

  it("returns correct duration for 2.5 seconds at 16000Hz", () => {
    const wav = buildWav(16000, 40000);
    const duration = getWavDuration(wav);
    expect(duration).toBeCloseTo(2.5, 5);
  });

  it("returns correct duration for stereo audio", () => {
    const wav = buildWav(44100, 44100, 2);
    const duration = getWavDuration(wav);
    expect(duration).toBeCloseTo(1.0, 5);
  });

  it("returns correct duration for 24-bit audio", () => {
    const wav = buildWav(48000, 48000, 1, 24);
    const duration = getWavDuration(wav);
    expect(duration).toBeCloseTo(1.0, 5);
  });

  it("returns 0 for too-short buffer", () => {
    const data = new Uint8Array(10);
    expect(getWavDuration(data)).toBe(0);
  });

  it("returns 0 for empty buffer", () => {
    const data = new Uint8Array(0);
    expect(getWavDuration(data)).toBe(0);
  });

  it("returns 0 when sampleRate is 0", () => {
    const wav = buildWav(44100, 44100);
    // Zero out sampleRate at offset 24
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    view.setUint32(24, 0, true);
    expect(getWavDuration(wav)).toBe(0);
  });

  it("returns 0 when numChannels is 0", () => {
    const wav = buildWav(44100, 44100);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    view.setUint16(22, 0, true);
    expect(getWavDuration(wav)).toBe(0);
  });

  it("returns 0 when bitsPerSample is 0", () => {
    const wav = buildWav(44100, 44100);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    view.setUint16(34, 0, true);
    expect(getWavDuration(wav)).toBe(0);
  });

  it("returns 0 when data chunk is missing", () => {
    // Create a WAV with "fmt " chunk but no "data" chunk
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    view.setUint32(4, 36, true);
    bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 44100, true);
    view.setUint32(28, 88200, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    // No "data" chunk follows

    expect(getWavDuration(bytes)).toBe(0);
  });

  it("handles short audio (0.01 seconds)", () => {
    const wav = buildWav(44100, 441); // 441 samples at 44100Hz = 0.01s
    const duration = getWavDuration(wav);
    expect(duration).toBeCloseTo(0.01, 4);
  });
});
