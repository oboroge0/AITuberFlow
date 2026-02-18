/**
 * Audio utility functions shared across TTS plugins.
 */

/**
 * Calculate the duration of a WAV audio buffer in seconds.
 * Parses the WAV header to find sample rate and data chunk size.
 */
export function getWavDuration(data: Uint8Array): number {
  try {
    if (data.length < 44) return 0;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const sampleRate = view.getUint32(24, true);
    const numChannels = view.getUint16(22, true);
    const bitsPerSample = view.getUint16(34, true);

    if (sampleRate === 0 || numChannels === 0 || bitsPerSample === 0) return 0;

    // Find the "data" subchunk to get the actual data size
    let offset = 12; // skip RIFF header
    while (offset + 8 <= data.length) {
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
      offset += 8 + chunkSize + (chunkSize % 2); // RIFF word-alignment padding
    }

    return 0;
  } catch {
    return 0;
  }
}
