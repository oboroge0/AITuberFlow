"""
Avatar Display Node
Integrated avatar display with automatic emotion detection and lip sync.
"""

import asyncio
import json
import re
import struct
import wave
import io
from typing import Any
from aituber_flow_sdk import BaseNode, NodeContext


# Emotion keywords (same as emotion-analyzer)
EMOTION_KEYWORDS_JA = {
    "happy": [
        "嬉しい", "楽しい", "幸せ", "最高", "やった", "わーい", "素晴らしい",
        "ありがとう", "感謝", "良かった", "いいね", "素敵", "可愛い", "面白い",
        "笑", "www", "草", "ウケる", "爆笑"
    ],
    "sad": [
        "悲しい", "辛い", "寂しい", "泣", "残念", "ごめん", "すまん",
        "申し訳", "つらい", "切ない", "悔しい"
    ],
    "angry": [
        "怒", "むかつく", "イライラ", "腹立つ", "許せない", "ふざけ",
        "うざい", "最悪", "ひどい"
    ],
    "surprised": [
        "驚", "びっくり", "まじ", "マジ", "えっ", "おお", "すごい",
        "やばい", "ヤバい", "信じられない", "まさか"
    ],
    "relaxed": [
        "落ち着", "リラックス", "のんびり", "ゆっくり", "穏やか", "平和"
    ]
}

EMOTION_KEYWORDS_EN = {
    "happy": [
        "happy", "joy", "glad", "great", "awesome", "amazing",
        "thank", "love", "nice", "good", "lol", "haha"
    ],
    "sad": [
        "sad", "sorry", "unfortunate", "disappointed", "cry", "miss"
    ],
    "angry": [
        "angry", "mad", "furious", "annoyed", "hate", "terrible"
    ],
    "surprised": [
        "wow", "omg", "surprised", "shock", "amazing", "what", "really"
    ],
    "relaxed": [
        "calm", "relax", "peaceful", "chill", "easy"
    ]
}


class AvatarDisplayNode(BaseNode):
    """Integrated avatar display node."""

    async def setup(self, config: dict[str, Any], context: NodeContext) -> None:
        """Initialize the avatar display."""
        self.renderer = config.get("renderer", "vrm")
        self.model_url = config.get("model_url", "/models/avatar.vrm")
        self.vtube_port = config.get("vtube_port", 8001)
        self.auto_emotion = config.get("auto_emotion", True)
        self.auto_lipsync = config.get("auto_lipsync", True)
        self.show_subtitle = config.get("show_subtitle", True)
        self.lipsync_sensitivity = float(config.get("lipsync_sensitivity", 1.0))
        self.emotion_language = config.get("emotion_language", "ja")

        # Parse PNG config
        png_config_str = config.get("png_config", "{}")
        try:
            self.png_config = json.loads(png_config_str) if png_config_str else {}
        except json.JSONDecodeError:
            self.png_config = {}

        await context.log(f"Avatar display initialized with {self.renderer} renderer")

    async def execute(
        self, inputs: dict[str, Any], context: NodeContext
    ) -> dict[str, Any]:
        """Process inputs and update avatar."""
        text = inputs.get("text", "")
        audio = inputs.get("audio")
        manual_expression = inputs.get("expression")
        motion = inputs.get("motion")

        # Determine expression
        if manual_expression:
            expression = manual_expression
            intensity = 1.0
        elif self.auto_emotion and text:
            expression, intensity = self._analyze_emotion(text)
        else:
            expression = "neutral"
            intensity = 0.5

        # Emit expression event
        await context.emit_event({
            "type": "avatar.expression",
            "expression": expression,
            "intensity": intensity
        })

        # Emit subtitle if enabled
        if self.show_subtitle and text:
            await context.emit_event({
                "type": "subtitle",
                "text": text
            })

        # Emit motion if provided
        if motion:
            await context.emit_event({
                "type": "avatar.motion",
                "motion": motion
            })

        # Process lip sync if audio provided
        if self.auto_lipsync and audio:
            asyncio.create_task(self._process_lipsync(audio, context))

        # Emit combined update
        await context.emit_event({
            "type": "avatar.update",
            "expression": expression,
            "motion": motion
        })

        await context.log(f"Avatar updated: expression={expression}, motion={motion}")

        return {"status": "updated"}

    def _analyze_emotion(self, text: str) -> tuple[str, float]:
        """Analyze text for emotion."""
        text_lower = text.lower()

        # Detect language
        if self.emotion_language == "auto":
            japanese_pattern = re.compile(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]')
            language = "ja" if japanese_pattern.search(text) else "en"
        else:
            language = self.emotion_language

        keywords = EMOTION_KEYWORDS_JA if language == "ja" else EMOTION_KEYWORDS_EN

        # Count matches
        scores: dict[str, int] = {}
        for emotion, words in keywords.items():
            score = sum(1 for word in words if word.lower() in text_lower)
            scores[emotion] = score

        # Find best match
        max_emotion = "neutral"
        max_score = 0

        for emotion, score in scores.items():
            if score > max_score:
                max_score = score
                max_emotion = emotion

        intensity = min(1.0, max_score / 3) if max_score > 0 else 0.5

        return max_emotion if max_score > 0 else "neutral", intensity

    async def _process_lipsync(self, audio: bytes, context: NodeContext) -> None:
        """Process audio for lip sync."""
        try:
            # Parse audio
            try:
                samples, sample_rate, duration = self._parse_wav(audio)
            except Exception:
                samples = self._parse_raw_pcm(audio)
                sample_rate = 24000
                duration = len(samples) / sample_rate

            if not samples:
                return

            # Generate mouth values at 30fps
            frame_rate = 30
            num_frames = int(duration * frame_rate)
            samples_per_frame = len(samples) // num_frames if num_frames > 0 else len(samples)
            frame_interval = 1.0 / frame_rate

            prev_value = 0.0
            smoothing = 0.3

            for i in range(num_frames):
                start_idx = i * samples_per_frame
                end_idx = min(start_idx + samples_per_frame, len(samples))
                frame_samples = samples[start_idx:end_idx]

                if frame_samples:
                    # Calculate RMS
                    squared = [s * s for s in frame_samples]
                    rms = (sum(squared) / len(squared)) ** 0.5
                    value = min(1.0, rms * self.lipsync_sensitivity)

                    # Apply threshold and smoothing
                    if value < 0.1:
                        value = 0.0
                    value = prev_value * smoothing + value * (1 - smoothing)
                    prev_value = value
                else:
                    value = 0.0

                await context.emit_event({
                    "type": "avatar.mouth",
                    "value": round(value, 3)
                })
                await asyncio.sleep(frame_interval)

            # Close mouth at end
            await context.emit_event({
                "type": "avatar.mouth",
                "value": 0.0
            })

        except Exception as e:
            await context.log(f"Lip sync error: {e}", "warning")

    def _parse_wav(self, audio: bytes) -> tuple[list[float], int, float]:
        """Parse WAV audio data."""
        with io.BytesIO(audio) as f:
            with wave.open(f, 'rb') as wav:
                sample_rate = wav.getframerate()
                n_channels = wav.getnchannels()
                sample_width = wav.getsampwidth()
                n_frames = wav.getnframes()

                raw_data = wav.readframes(n_frames)

                if sample_width == 2:
                    fmt = f"{n_frames * n_channels}h"
                    max_val = 32768.0
                else:
                    fmt = f"{n_frames * n_channels}b"
                    max_val = 128.0

                samples_raw = struct.unpack(fmt, raw_data)

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


# Export the node class
Node = AvatarDisplayNode
