"""
Style-Bert-VITS2 TTS Node

Text-to-speech using Style-Bert-VITS2.
"""

import sys
import json
import uuid
from pathlib import Path
from urllib.parse import urlencode

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


class SBV2TTSNode(BaseNode):
    """
    Style-Bert-VITS2 TTS Node

    Converts text to speech using Style-Bert-VITS2.
    """

    def __init__(self):
        self.host = "http://localhost:5000"
        self.model_name = ""
        self.speaker_id = 0
        self.style = "Neutral"
        self.style_weight = 1.0
        self.length = 1.0
        self.sdp_ratio = 0.2

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.host = config.get("host", "http://localhost:5000")
        self.model_name = config.get("modelName", "")
        self.speaker_id = config.get("speakerId", 0)
        self.style = config.get("style", "Neutral")
        self.style_weight = config.get("styleWeight", 1.0)
        self.length = config.get("length", 1.0)
        self.sdp_ratio = config.get("sdpRatio", 0.2)

        # Ensure audio directory exists
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)

        await context.log(f"Style-Bert-VITS2 configured: {self.host}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Convert text to speech."""
        text = inputs.get("text", "")

        if not text:
            await context.log("No text provided", "warning")
            return {"audio": ""}

        if aiohttp is None:
            # Fallback to urllib
            return await self._execute_urllib(text, context)

        try:
            await context.log(f"Generating speech: {text[:50]}...")

            # Build query parameters
            params = {
                "text": text,
                "speaker_id": self.speaker_id,
                "style": self.style,
                "style_weight": self.style_weight,
                "length": self.length,
                "sdp_ratio": self.sdp_ratio,
            }

            if self.model_name:
                params["model_name"] = self.model_name

            url = f"{self.host}/voice?{urlencode(params)}"

            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        error = await response.text()
                        await context.log(f"Synthesis failed: {error}", "error")
                        return {"audio": ""}

                    audio_data = await response.read()

                    # Save audio file
                    filename = f"sbv2_{uuid.uuid4().hex[:8]}.wav"
                    filepath = AUDIO_DIR / filename
                    filepath.write_bytes(audio_data)

                    await context.log(f"Audio generated: {filename}")

                    # Emit audio event
                    await context.emit_event(Event(
                        type="audio.generated",
                        payload={
                            "filename": filename,
                            "text": text,
                            "duration": 0
                        }
                    ))

                    return {"audio": filename}

        except Exception as e:
            await context.log(f"Style-Bert-VITS2 error: {str(e)}", "error")
            return {"audio": ""}

    async def _execute_urllib(self, text: str, context: NodeContext) -> dict:
        """Fallback using urllib."""
        import urllib.request
        import urllib.error

        try:
            await context.log(f"Generating speech via urllib: {text[:50]}...")

            params = {
                "text": text,
                "speaker_id": self.speaker_id,
                "style": self.style,
                "style_weight": self.style_weight,
                "length": self.length,
                "sdp_ratio": self.sdp_ratio,
            }

            if self.model_name:
                params["model_name"] = self.model_name

            url = f"{self.host}/voice?{urlencode(params)}"

            with urllib.request.urlopen(url, timeout=60) as response:
                audio_data = response.read()

                filename = f"sbv2_{uuid.uuid4().hex[:8]}.wav"
                filepath = AUDIO_DIR / filename
                filepath.write_bytes(audio_data)

                await context.log(f"Audio generated: {filename}")

                await context.emit_event(Event(
                    type="audio.generated",
                    payload={
                        "filename": filename,
                        "text": text,
                        "duration": 0
                    }
                ))

                return {"audio": filename}

        except Exception as e:
            await context.log(f"Style-Bert-VITS2 error: {str(e)}", "error")
            return {"audio": ""}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
