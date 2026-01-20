"""
Lip Sync Node
Generates lip sync data from audio for avatar mouth animation.
"""

import asyncio
import struct
import wave
import io
import tempfile
from pathlib import Path
from typing import Any
from aituber_flow_sdk import BaseNode, NodeContext


class LipSyncNode(BaseNode):
    """Generates lip sync data from audio."""

    async def setup(self, config: dict[str, Any], context: NodeContext) -> None:
        """Initialize the lip sync processor."""
        self.method = config.get("method", "volume")
        # Sensitivity: RMS values for speech are typically 0.05-0.2, so we need
        # to scale up significantly. Default 5.0 means RMS of 0.2 -> mouth 1.0
        self.sensitivity = float(config.get("sensitivity", 5.0))
        self.smoothing = float(config.get("smoothing", 0.3))
        # Threshold: filter out silence/noise. 0.02 catches most speech
        self.threshold = float(config.get("threshold", 0.02))
        self.emit_realtime = config.get("emit_realtime", True)
        self.frame_rate = int(config.get("frame_rate", 30))

    async def execute(
        self, inputs: dict[str, Any], context: NodeContext
    ) -> dict[str, Any]:
        """Process audio and generate lip sync data."""
        audio = inputs.get("audio")
        # Support both audio_url and audioUrl (for compatibility with voicevox-tts)
        audio_url = inputs.get("audio_url") or inputs.get("audioUrl")

        # Track original path for output
        original_path: str | None = None

        # Handle case where audio is a dict (e.g., from voicevox-tts output)
        if isinstance(audio, dict):
            # Extract audioUrl from the dict if present
            original_path = (
                audio.get("audioUrl")
                or audio.get("audio_url")
                or audio.get("audio")
                or audio.get("filename")
            )
            if not audio_url:
                audio_url = original_path
            audio = None  # Reset audio so we load from URL
        elif isinstance(audio, str):
            original_path = audio
            if not audio_url:
                audio_url = audio
            audio = None  # Reset audio so we load from URL

        if not audio and not audio_url:
            await context.log("No audio input provided", "warning")
            return {
                "mouth_values": [],
                "duration": 0.0,
                "audio": ""
            }

        # If audio_url is provided, load the audio from file or URL
        if audio_url and not audio:
            await context.log(f"Loading audio from: {audio_url}")
            audio = await self._load_audio(audio_url, context)

        if not audio:
            return {
                "mouth_values": [],
                "duration": 0.0,
                "audio": original_path or ""
            }

        # Analyze audio
        try:
            mouth_values, duration = await self._analyze_audio(audio, context)
        except Exception as e:
            await context.log(f"Error analyzing audio: {e}", "error")
            return {
                "mouth_values": [],
                "duration": 0.0,
                "audio": original_path or ""
            }

        await context.log(f"Generated {len(mouth_values)} lip sync frames for {duration:.2f}s audio")

        # Emit realtime events if enabled
        if self.emit_realtime and mouth_values:
            context.create_task(
                self._emit_realtime_events(mouth_values, duration, context)
            )

        return {
            "mouth_values": mouth_values,
            "duration": duration,
            "audio": original_path or ""
        }

    async def _load_audio(self, path_or_url: str, context: NodeContext) -> bytes | None:
        """Load audio from URL or local file path."""
        resolved_path = self._resolve_audio_path(path_or_url)
        if resolved_path:
            try:
                return await asyncio.to_thread(resolved_path.read_bytes)
            except Exception as e:
                await context.log(f"Error reading audio file: {e}", "error")
                return None

        # Otherwise, treat as URL
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(path_or_url)
                if response.status_code == 200:
                    return response.content
                else:
                    await context.log(f"Failed to load audio: HTTP {response.status_code}", "error")
                    return None
        except Exception as e:
            await context.log(f"Error loading audio from URL: {e}", "error")
            return None

    def _resolve_audio_path(self, path_or_url: str) -> Path | None:
        """Resolve audio path from direct path or known output folders."""
        path = Path(path_or_url)
        if path.is_file():
            return path

        filename = path.name
        if not filename:
            return None

        temp_candidate = Path(tempfile.gettempdir()) / filename
        if temp_candidate.is_file():
            return temp_candidate

        project_root = Path(__file__).parent.parent.parent
        audio_output = project_root / "apps" / "server" / "audio_output" / filename
        if audio_output.is_file():
            return audio_output

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
        num_frames = max(1, int(duration * self.frame_rate))
        samples_per_frame = len(samples) // num_frames if num_frames > 0 else len(samples)

        mouth_values = []
        prev_value = 0.0
        min_visible = max(0.02, self.threshold)
        max_gain = 12.0
        target_peak = 0.8

        frame_values: list[float] = []
        for i in range(num_frames):
            start_idx = i * samples_per_frame
            end_idx = min(start_idx + samples_per_frame, len(samples))
            frame_samples = samples[start_idx:end_idx]

            if not frame_samples:
                frame_values.append(0.0)
                continue

            if self.method == "volume":
                # Simple RMS volume
                raw_value = self._calculate_rms(frame_samples)
            else:
                # Envelope following
                raw_value = self._calculate_envelope(frame_samples)

            frame_values.append(raw_value)

        max_value = max(frame_values) if frame_values else 0.0
        if max_value > 0:
            gain = max(1.0, min(
                max_gain,
                target_peak / (max_value * max(self.sensitivity, 0.001))
            ))
        else:
            gain = 1.0

        for raw_value in frame_values:
            if raw_value <= 0:
                mouth_values.append(0.0)
                prev_value = 0.0
                continue

            value = min(1.0, raw_value * self.sensitivity * gain)

            # Apply threshold (silence detection)
            if value < self.threshold:
                value = 0.0

            # Apply smoothing
            smoothed_value = prev_value * self.smoothing + value * (1 - self.smoothing)

            # Force to 0 if below minimum visible threshold (prevents lingering open mouth)
            if smoothed_value < min_visible:
                smoothed_value = 0.0

            prev_value = smoothed_value
            mouth_values.append(round(smoothed_value, 3))

        # Ensure the last few frames close the mouth (add decay frames)
        for _ in range(5):
            prev_value *= 0.3  # Quick decay
            if prev_value < min_visible:
                mouth_values.append(0.0)
                break
            mouth_values.append(round(prev_value, 3))

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

    def _calculate_envelope(self, samples: list[float]) -> float:
        """Calculate envelope following value."""
        if not samples:
            return 0.0
        peak = max(abs(s) for s in samples)
        return peak

    async def _emit_realtime_events(
        self, mouth_values: list[float], duration: float, context: NodeContext
    ) -> None:
        """Emit avatar.mouth events in realtime."""
        if not mouth_values:
            return

        # Use fixed frame interval based on frame_rate
        frame_interval = 1.0 / self.frame_rate

        for value in mouth_values:
            await context.emit_event({
                "type": "avatar.mouth",
                "value": value
            })
            await asyncio.sleep(frame_interval)

        # Ensure mouth is closed at the end
        await context.emit_event({
            "type": "avatar.mouth",
            "value": 0.0
        })


# Export the node class
Node = LipSyncNode
