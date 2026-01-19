"""
Lip Sync Node
Generates lip sync data from audio for avatar mouth animation.
"""

import asyncio
import struct
import wave
import io
from typing import Any
from aituber_flow_sdk import BaseNode, NodeContext


class LipSyncNode(BaseNode):
    """Generates lip sync data from audio."""

    async def setup(self, config: dict[str, Any], context: NodeContext) -> None:
        """Initialize the lip sync processor."""
        self.method = config.get("method", "volume")
        self.sensitivity = float(config.get("sensitivity", 1.0))
        self.smoothing = float(config.get("smoothing", 0.3))
        self.threshold = float(config.get("threshold", 0.1))
        self.emit_realtime = config.get("emit_realtime", True)
        self.frame_rate = int(config.get("frame_rate", 30))

    async def execute(
        self, inputs: dict[str, Any], context: NodeContext
    ) -> dict[str, Any]:
        """Process audio and generate lip sync data."""
        audio = inputs.get("audio")
        audio_url = inputs.get("audio_url")

        if not audio and not audio_url:
            await context.log("No audio input provided", "warning")
            return {
                "mouth_values": [],
                "duration": 0.0,
                "audio": None
            }

        # If audio_url is provided, load the audio
        if audio_url and not audio:
            audio = await self._load_audio_from_url(audio_url, context)

        if not audio:
            return {
                "mouth_values": [],
                "duration": 0.0,
                "audio": None
            }

        # Analyze audio
        try:
            mouth_values, duration = await self._analyze_audio(audio, context)
        except Exception as e:
            await context.log(f"Error analyzing audio: {e}", "error")
            return {
                "mouth_values": [],
                "duration": 0.0,
                "audio": audio
            }

        await context.log(f"Generated {len(mouth_values)} lip sync frames for {duration:.2f}s audio")

        # Emit realtime events if enabled
        if self.emit_realtime and mouth_values:
            asyncio.create_task(
                self._emit_realtime_events(mouth_values, duration, context)
            )

        return {
            "mouth_values": mouth_values,
            "duration": duration,
            "audio": audio
        }

    async def _load_audio_from_url(self, url: str, context: NodeContext) -> bytes | None:
        """Load audio from URL."""
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.content
                else:
                    await context.log(f"Failed to load audio: HTTP {response.status_code}", "error")
                    return None
        except Exception as e:
            await context.log(f"Error loading audio from URL: {e}", "error")
            return None

    async def _analyze_audio(
        self, audio: bytes, context: NodeContext
    ) -> tuple[list[float], float]:
        """Analyze audio and extract mouth values."""
        # Try to parse as WAV
        try:
            samples, sample_rate, duration = self._parse_wav(audio)
        except Exception:
            # Assume raw PCM 16-bit mono 24kHz (common for TTS)
            samples = self._parse_raw_pcm(audio)
            sample_rate = 24000
            duration = len(samples) / sample_rate

        if not samples:
            return [], 0.0

        # Generate mouth values at specified frame rate
        frame_interval = 1.0 / self.frame_rate
        num_frames = int(duration * self.frame_rate)
        samples_per_frame = len(samples) // num_frames if num_frames > 0 else len(samples)

        mouth_values = []
        prev_value = 0.0

        for i in range(num_frames):
            start_idx = i * samples_per_frame
            end_idx = min(start_idx + samples_per_frame, len(samples))
            frame_samples = samples[start_idx:end_idx]

            if not frame_samples:
                mouth_values.append(0.0)
                continue

            if self.method == "volume":
                # Simple RMS volume
                rms = self._calculate_rms(frame_samples)
                value = min(1.0, rms * self.sensitivity)
            else:
                # Envelope following
                value = self._calculate_envelope(frame_samples, self.sensitivity)

            # Apply threshold
            if value < self.threshold:
                value = 0.0

            # Apply smoothing
            smoothed_value = prev_value * self.smoothing + value * (1 - self.smoothing)
            prev_value = smoothed_value

            mouth_values.append(round(smoothed_value, 3))

        return mouth_values, duration

    def _parse_wav(self, audio: bytes) -> tuple[list[float], int, float]:
        """Parse WAV audio data."""
        with io.BytesIO(audio) as f:
            with wave.open(f, 'rb') as wav:
                sample_rate = wav.getframerate()
                n_channels = wav.getnchannels()
                sample_width = wav.getsampwidth()
                n_frames = wav.getnframes()

                raw_data = wav.readframes(n_frames)

                # Convert to samples
                if sample_width == 1:
                    fmt = f"{n_frames * n_channels}b"
                    max_val = 128.0
                elif sample_width == 2:
                    fmt = f"{n_frames * n_channels}h"
                    max_val = 32768.0
                else:
                    raise ValueError(f"Unsupported sample width: {sample_width}")

                samples_raw = struct.unpack(fmt, raw_data)

                # Convert to mono if stereo
                if n_channels == 2:
                    samples = [(samples_raw[i] + samples_raw[i + 1]) / 2 / max_val
                               for i in range(0, len(samples_raw), 2)]
                else:
                    samples = [s / max_val for s in samples_raw]

                duration = n_frames / sample_rate

                return samples, sample_rate, duration

    def _parse_raw_pcm(self, audio: bytes) -> list[float]:
        """Parse raw PCM 16-bit audio data."""
        n_samples = len(audio) // 2
        samples_raw = struct.unpack(f"{n_samples}h", audio[:n_samples * 2])
        return [s / 32768.0 for s in samples_raw]

    def _calculate_rms(self, samples: list[float]) -> float:
        """Calculate RMS (Root Mean Square) of samples."""
        if not samples:
            return 0.0
        squared = [s * s for s in samples]
        mean = sum(squared) / len(squared)
        return mean ** 0.5

    def _calculate_envelope(self, samples: list[float], sensitivity: float) -> float:
        """Calculate envelope following value."""
        if not samples:
            return 0.0
        peak = max(abs(s) for s in samples)
        return min(1.0, peak * sensitivity)

    async def _emit_realtime_events(
        self, mouth_values: list[float], duration: float, context: NodeContext
    ) -> None:
        """Emit avatar.mouth events in realtime."""
        if not mouth_values:
            return

        frame_interval = duration / len(mouth_values)

        for value in mouth_values:
            await context.emit_event({
                "type": "avatar.mouth",
                "value": value
            })
            await asyncio.sleep(frame_interval)

        # Close mouth at the end
        await context.emit_event({
            "type": "avatar.mouth",
            "value": 0.0
        })


# Export the node class
Node = LipSyncNode
