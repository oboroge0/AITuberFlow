"""
COEIROINK TTS Node

Text-to-speech using COEIROINK.
"""

import sys
import json
import uuid
import wave
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event

try:
    import aiohttp
except ImportError:
    aiohttp = None


# Audio output directory
AUDIO_DIR = Path(__file__).parent.parent.parent / "apps" / "server" / "audio_output"


class CoeiroinkTTSNode(BaseNode):
    """
    COEIROINK TTS Node

    Converts text to speech using COEIROINK.
    """

    def __init__(self):
        self.host = "http://localhost:50032"
        self.speaker_uuid = ""
        self.style_id = 0
        self.speed_scale = 1.0
        self.volume_scale = 1.0
        self.pitch_scale = 1.0

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.host = config.get("host", "http://localhost:50032")
        self.speaker_uuid = config.get("speakerUuid", "")
        self.style_id = config.get("styleId", 0)
        self.speed_scale = config.get("speedScale", 1.0)
        self.volume_scale = config.get("volumeScale", 1.0)
        self.pitch_scale = config.get("pitchScale", 1.0)

        # Ensure audio directory exists
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)

        if not self.speaker_uuid:
            await context.log("Speaker UUID not configured", "warning")
        else:
            await context.log(f"COEIROINK configured: {self.host}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Convert text to speech."""
        text = inputs.get("text", "")

        if not text:
            await context.log("No text provided", "warning")
            return {"audio": ""}

        if not self.speaker_uuid:
            await context.log("Speaker UUID not configured", "error")
            return {"audio": ""}

        if aiohttp is None:
            await context.log("aiohttp not installed", "error")
            return {"audio": ""}

        try:
            await context.log(f"Generating speech: {text[:50]}...")

            async with aiohttp.ClientSession() as session:
                # Step 1: Create audio query
                query_url = f"{self.host}/v1/estimate_prosody"
                query_payload = {
                    "text": text,
                    "speakerUuid": self.speaker_uuid,
                    "styleId": self.style_id
                }

                async with session.post(query_url, json=query_payload) as response:
                    if response.status != 200:
                        error = await response.text()
                        await context.log(f"Prosody estimation failed: {error}", "error")
                        return {"audio": ""}

                    prosody = await response.json()

                # Step 2: Synthesize audio
                synth_url = f"{self.host}/v1/synthesis"
                synth_payload = {
                    "speakerUuid": self.speaker_uuid,
                    "styleId": self.style_id,
                    "text": text,
                    "prosodyDetail": prosody.get("detail", []),
                    "speedScale": self.speed_scale,
                    "volumeScale": self.volume_scale,
                    "pitchScale": self.pitch_scale
                }

                async with session.post(synth_url, json=synth_payload) as response:
                    if response.status != 200:
                        error = await response.text()
                        await context.log(f"Synthesis failed: {error}", "error")
                        return {"audio": ""}

                    audio_data = await response.read()

                    # Save audio file
                    filename = f"coeiroink_{uuid.uuid4().hex[:8]}.wav"
                    filepath = AUDIO_DIR / filename
                    filepath.write_bytes(audio_data)

                    duration = self._get_wav_duration(filepath)

                    await context.log(f"Audio generated: {filename}")

                    # Emit audio event
                    await context.emit_event(Event(
                        type="audio.generated",
                        payload={
                            "filename": filename,
                            "text": text,
                            "duration": duration
                        }
                    ))

                    return {"audio": str(filepath), "filename": filename, "duration": duration}

        except Exception as e:
            await context.log(f"COEIROINK error: {str(e)}", "error")
            return {"audio": ""}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass

    def _get_wav_duration(self, file_path: Path) -> float:
        """Get duration of a WAV file in seconds."""
        try:
            with wave.open(str(file_path), 'rb') as wav_file:
                frames = wav_file.getnframes()
                rate = wav_file.getframerate()
                return frames / float(rate)
        except Exception:
            return 0.0
