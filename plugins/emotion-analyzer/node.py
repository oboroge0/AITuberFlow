"""
Emotion Analyzer Node
Analyzes text to detect emotions for avatar expression control.
"""

import json
import re
from typing import Any
from aituber_flow_sdk import BaseNode, NodeContext


# Emotion keywords for Japanese
EMOTION_KEYWORDS_JA = {
    "happy": [
        "嬉しい", "楽しい", "幸せ", "最高", "やった", "わーい", "素晴らしい",
        "ありがとう", "感謝", "良かった", "いいね", "素敵", "可愛い", "面白い",
        "笑", "www", "草", "ウケる", "爆笑", "ハッピー", "喜び", "うれしい"
    ],
    "sad": [
        "悲しい", "辛い", "寂しい", "泣", "残念", "ごめん", "すまん",
        "申し訳", "つらい", "切ない", "悔しい", "哀しい", "涙", "ショック"
    ],
    "angry": [
        "怒", "むかつく", "イライラ", "腹立つ", "許せない", "ふざけ",
        "うざい", "きもい", "最悪", "ひどい", "嫌い", "うるさい"
    ],
    "surprised": [
        "驚", "びっくり", "まじ", "マジ", "えっ", "おお", "すごい",
        "やばい", "ヤバい", "信じられない", "まさか", "うそ", "嘘", "!!"
    ],
    "relaxed": [
        "落ち着", "リラックス", "のんびり", "ゆっくり", "穏やか", "平和",
        "癒し", "安心", "ほっと"
    ]
}

# Emotion keywords for English
EMOTION_KEYWORDS_EN = {
    "happy": [
        "happy", "joy", "glad", "great", "awesome", "amazing", "wonderful",
        "thank", "love", "nice", "good", "excellent", "fantastic", "fun",
        "lol", "haha", "laugh", "yay", "excited"
    ],
    "sad": [
        "sad", "sorry", "unfortunate", "disappointed", "cry", "tears",
        "miss", "lonely", "depressed", "upset", "hurt"
    ],
    "angry": [
        "angry", "mad", "furious", "annoyed", "hate", "terrible",
        "awful", "disgusting", "stupid", "damn"
    ],
    "surprised": [
        "wow", "omg", "surprised", "shock", "amazing", "unbelievable",
        "incredible", "what", "really", "seriously", "!!"
    ],
    "relaxed": [
        "calm", "relax", "peaceful", "chill", "easy", "comfortable",
        "cozy", "soothing"
    ]
}


class EmotionAnalyzerNode(BaseNode):
    """Analyzes text to detect emotions."""

    async def setup(self, config: dict[str, Any], context: NodeContext) -> None:
        """Initialize the emotion analyzer."""
        self.method = config.get("method", "rule-based")
        self.language = config.get("language", "ja")
        self.emit_events = config.get("emit_events", True)

        # Load custom mappings
        custom_mappings_str = config.get("custom_mappings", "{}")
        try:
            self.custom_mappings = json.loads(custom_mappings_str) if custom_mappings_str else {}
        except json.JSONDecodeError:
            self.custom_mappings = {}
            await context.log("Invalid custom mappings JSON, using defaults", "warning")

    async def execute(
        self, inputs: dict[str, Any], context: NodeContext
    ) -> dict[str, Any]:
        """Analyze text and detect emotion."""
        text = inputs.get("text", "")

        if not text:
            return {
                "expression": "neutral",
                "intensity": 0.0,
                "text": text
            }

        # Detect language if auto
        if self.language == "auto":
            language = self._detect_language(text)
        else:
            language = self.language

        # Analyze emotion
        if self.method == "rule-based":
            expression, intensity = self._analyze_rule_based(text, language)
        else:
            # LLM-based analysis would go here
            expression, intensity = self._analyze_rule_based(text, language)

        await context.log(f"Detected emotion: {expression} (intensity: {intensity:.2f})")

        # Emit avatar event if enabled
        if self.emit_events:
            await context.emit_event({
                "type": "avatar.expression",
                "expression": expression,
                "intensity": intensity
            })

        return {
            "expression": expression,
            "intensity": intensity,
            "text": text
        }

    def _detect_language(self, text: str) -> str:
        """Simple language detection based on character types."""
        # Check for Japanese characters (hiragana, katakana, kanji)
        japanese_pattern = re.compile(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]')
        if japanese_pattern.search(text):
            return "ja"
        return "en"

    def _analyze_rule_based(self, text: str, language: str) -> tuple[str, float]:
        """Analyze emotion using keyword matching."""
        text_lower = text.lower()

        # Select keyword dictionary based on language
        keywords = EMOTION_KEYWORDS_JA if language == "ja" else EMOTION_KEYWORDS_EN

        # Merge with custom mappings
        all_keywords = {**keywords}
        for emotion, words in self.custom_mappings.items():
            if emotion in all_keywords:
                all_keywords[emotion] = all_keywords[emotion] + words
            else:
                all_keywords[emotion] = words

        # Count matches for each emotion
        scores: dict[str, int] = {}
        for emotion, words in all_keywords.items():
            score = 0
            for word in words:
                if word.lower() in text_lower:
                    score += 1
                    # Higher weight for exact matches or emoticons
                    if word in ["!!", "www", "草", "lol", "haha"]:
                        score += 1
            scores[emotion] = score

        # Find the emotion with highest score
        max_emotion = "neutral"
        max_score = 0
        total_score = sum(scores.values())

        for emotion, score in scores.items():
            if score > max_score:
                max_score = score
                max_emotion = emotion

        # Calculate intensity (0.0 - 1.0)
        if total_score > 0:
            intensity = min(1.0, max_score / 3)  # Cap at 3 matches for full intensity
        else:
            intensity = 0.0

        # Default to neutral if no strong emotion detected
        if max_score == 0:
            return "neutral", 0.5

        return max_emotion, intensity


# Export the node class
Node = EmotionAnalyzerNode
