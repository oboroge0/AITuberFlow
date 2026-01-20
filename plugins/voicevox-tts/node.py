"""
VOICEVOX TTS Node

Converts text to speech using VOICEVOX engine.
"""

import sys
import os
import uuid
import wave
from pathlib import Path
from typing import Optional

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event

try:
    import httpx
except ImportError:
    httpx = None


# Audio output directory
AUDIO_DIR = Path(__file__).parent.parent.parent / "apps" / "server" / "audio_output"


class VoicevoxTTSNode(BaseNode):
    """
    VOICEVOX TTS Node

    Converts text to speech using the VOICEVOX engine.
    """

    def __init__(self):
        self.host = "http://localhost:50021"
        self.speaker = 1
        self.speed_scale = 1.0
        self.pitch_scale = 0.0
        self.volume_scale = 1.0
        self.output_dir = ""
        self.client: Optional[httpx.AsyncClient] = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the VOICEVOX client."""
        if httpx is None:
            await context.log("httpx package not installed", "error")
            return

        self.host = config.get("host", "http://localhost:50021").rstrip("/")
        self.speaker = int(config.get("speaker", 1))
        self.speed_scale = float(config.get("speedScale", 1.0))
        self.pitch_scale = float(config.get("pitchScale", 0.0))
        self.volume_scale = float(config.get("volumeScale", 1.0))
        self.output_dir = str(AUDIO_DIR)

        self.client = httpx.AsyncClient(timeout=60.0)

        AUDIO_DIR.mkdir(parents=True, exist_ok=True)

        if config.get("outputDir"):
            await context.log("outputDir is ignored; using server audio_output directory", "warning")

        # Test connection
        try:
            response = await self.client.get(f"{self.host}/speakers")
            if response.status_code == 200:
                speakers = response.json()
                speaker_name = self._get_speaker_name(speakers, self.speaker)
                await context.log(f"VOICEVOX connected (speaker: {speaker_name})")
            else:
                await context.log("VOICEVOX connection test failed", "warning")
        except Exception as e:
            await context.log(f"Cannot connect to VOICEVOX at {self.host}: {str(e)}", "error")

    def _get_speaker_name(self, speakers: list, speaker_id: int) -> str:
        """Get speaker name from speaker ID."""
        for speaker in speakers:
            for style in speaker.get("styles", []):
                if style.get("id") == speaker_id:
                    return f"{speaker.get('name', 'Unknown')} ({style.get('name', '')})"
        return f"Speaker {speaker_id}"

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Convert text to speech."""
        text = inputs.get("text", "")
        if not text:
            await context.log("No text provided for TTS", "warning")
            return {"audioUrl": "", "duration": 0}

        if not self.client:
            await context.log("VOICEVOX client not initialized", "error")
            return {"audioUrl": "", "duration": 0}

        try:
            await context.log(f"Generating speech: {text[:30]}...")

            # Step 1: Create audio query
            query_response = await self.client.post(
                f"{self.host}/audio_query",
                params={"text": text, "speaker": self.speaker}
            )
            query_response.raise_for_status()
            query = query_response.json()

            # Apply settings
            query["speedScale"] = self.speed_scale
            query["pitchScale"] = self.pitch_scale
            query["volumeScale"] = self.volume_scale

            # Step 2: Synthesize audio
            synth_response = await self.client.post(
                f"{self.host}/synthesis",
                params={"speaker": self.speaker},
                json=query
            )
            synth_response.raise_for_status()

            # Save audio file
            audio_data = synth_response.content
            filename = f"voicevox_{uuid.uuid4().hex[:8]}.wav"
            audio_path = os.path.join(self.output_dir, filename)

            with open(audio_path, "wb") as f:
                f.write(audio_data)

            # Calculate duration from WAV
            duration = self._get_wav_duration(audio_path)

            await context.log(f"Audio generated: {duration:.2f}s")

            # Emit event with both local path and API-accessible filename
            await context.emit_event(Event(
                type="audio.generated",
                payload={
                    "audio": audio_path,
                    "audioUrl": audio_path,
                    "filename": filename,
                    "duration": duration,
                    "text": text,
                }
            ))

            return {"audio": audio_path, "audioUrl": audio_path, "filename": filename, "duration": duration}

        except httpx.ConnectError:
            await context.log(f"Cannot connect to VOICEVOX at {self.host}", "error")
            return {"audioUrl": "", "duration": 0}
        except Exception as e:
            await context.log(f"TTS error: {str(e)}", "error")
            return {"audioUrl": "", "duration": 0}

    def _get_wav_duration(self, file_path: str) -> float:
        """Get duration of a WAV file in seconds."""
        try:
            with wave.open(file_path, 'rb') as wav_file:
                frames = wav_file.getnframes()
                rate = wav_file.getframerate()
                return frames / float(rate)
        except Exception:
            return 0.0

    async def teardown(self) -> None:
        """Clean up resources."""
        if self.client:
            await self.client.aclose()
