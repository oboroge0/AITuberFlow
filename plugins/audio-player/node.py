"""
Audio Player Node

Plays audio files and emits playback events for synchronization with lip-sync.
Can wait for playback completion before continuing the workflow.
"""

import asyncio
import struct
from pathlib import Path
from aituber_flow_sdk import BaseNode, NodeContext, Event
from typing import Optional


class AudioPlayerNode(BaseNode):
    """Audio player node - plays audio and emits sync events."""

    def __init__(self):
        self.wait_for_completion: bool = True
        self.volume: float = 1.0
        self.output_device: str = "browser"

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize audio player with configuration."""
        self.wait_for_completion = config.get("wait_for_completion", True)
        self.volume = config.get("volume", 1.0)
        self.output_device = config.get("output_device", "browser")

        await context.log(
            f"Audio player initialized: output={self.output_device}, "
            f"wait={self.wait_for_completion}, volume={self.volume}"
        )

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """
        Play audio file and emit events.

        Inputs:
            - audio: Path to audio file
            - duration: Audio duration in seconds (optional)

        Outputs:
            - audio: Pass-through of audio path
            - duration: Audio duration in seconds
        """
        audio_path = inputs.get("audio", "")
        provided_duration = inputs.get("duration")

        if not audio_path:
            await context.log("No audio file provided", level="warning")
            return {"audio": "", "duration": 0}

        # Calculate duration if not provided
        if provided_duration is not None:
            duration = float(provided_duration)
        else:
            duration = await self._get_audio_duration(audio_path, context)

        # Emit audio play event
        await context.emit_event(
            Event(
                type="audio.play",
                payload={
                    "filename": audio_path,
                    "duration": duration,
                    "volume": self.volume,
                    "output": self.output_device,
                },
            )
        )
        await context.log(f"Playing audio: {audio_path} ({duration:.2f}s)")

        # Wait for playback to complete if configured
        if self.wait_for_completion and duration > 0:
            await asyncio.sleep(duration)
            await context.emit_event(
                Event(type="audio.stop", payload={"filename": audio_path})
            )

        return {"audio": audio_path, "duration": duration}

    async def _get_audio_duration(
        self, audio_path: str, context: NodeContext
    ) -> float:
        """Calculate audio duration from WAV file."""
        try:
            # Handle both relative and absolute paths
            if audio_path.startswith("/"):
                # Relative to server audio output directory
                full_path = Path("audio_output") / audio_path.lstrip("/")
            else:
                full_path = Path(audio_path)

            if not full_path.exists():
                # Try audio_output directory
                full_path = Path("audio_output") / Path(audio_path).name

            if not full_path.exists():
                await context.log(
                    f"Audio file not found: {audio_path}", level="warning"
                )
                return 0.0

            with open(full_path, "rb") as f:
                # Read WAV header
                riff = f.read(4)
                if riff != b"RIFF":
                    await context.log("Not a valid WAV file", level="warning")
                    return 0.0

                f.read(4)  # file size
                wave = f.read(4)
                if wave != b"WAVE":
                    return 0.0

                # Find fmt chunk
                while True:
                    chunk_id = f.read(4)
                    if len(chunk_id) < 4:
                        break
                    chunk_size = struct.unpack("<I", f.read(4))[0]

                    if chunk_id == b"fmt ":
                        fmt_data = f.read(chunk_size)
                        audio_format = struct.unpack("<H", fmt_data[0:2])[0]
                        num_channels = struct.unpack("<H", fmt_data[2:4])[0]
                        sample_rate = struct.unpack("<I", fmt_data[4:8])[0]
                        byte_rate = struct.unpack("<I", fmt_data[8:12])[0]
                    elif chunk_id == b"data":
                        data_size = chunk_size
                        if byte_rate > 0:
                            return data_size / byte_rate
                        break
                    else:
                        f.seek(chunk_size, 1)

            return 0.0

        except Exception as e:
            await context.log(f"Error reading audio file: {e}", level="error")
            return 0.0

    async def teardown(self) -> None:
        """Cleanup on workflow stop."""
        pass
