"""
Emotion Analyzer Node
Analyzes text to detect emotions for avatar expression control.
Supports customizable expressions and LLM-based analysis.
"""

import json
import re
from typing import Any

from aituber_flow_sdk import BaseNode, NodeContext, Event


# Default expressions with descriptions for LLM analysis
DEFAULT_EXPRESSIONS = [
    {
        "id": "neutral",
        "label": "Neutral",
        "description": "Default calm state, no strong emotion",
        "keywords_ja": [],
        "keywords_en": [],
    },
    {
        "id": "happy",
        "label": "Happy",
        "description": "Joy, excitement, gratitude, amusement, laughter",
        "keywords_ja": [
            "嬉しい", "楽しい", "幸せ", "最高", "やった", "わーい", "素晴らしい",
            "ありがとう", "感謝", "良かった", "いいね", "素敵", "可愛い", "面白い",
            "笑", "www", "草", "ウケる", "爆笑", "ハッピー", "喜び", "うれしい"
        ],
        "keywords_en": [
            "happy", "joy", "glad", "great", "awesome", "amazing", "wonderful",
            "thank", "love", "nice", "good", "excellent", "fantastic", "fun",
            "lol", "haha", "laugh", "yay", "excited"
        ],
    },
    {
        "id": "sad",
        "label": "Sad",
        "description": "Sadness, disappointment, loneliness, regret, apology",
        "keywords_ja": [
            "悲しい", "辛い", "寂しい", "泣", "残念", "ごめん", "すまん",
            "申し訳", "つらい", "切ない", "悔しい", "哀しい", "涙", "ショック"
        ],
        "keywords_en": [
            "sad", "sorry", "unfortunate", "disappointed", "cry", "tears",
            "miss", "lonely", "depressed", "upset", "hurt"
        ],
    },
    {
        "id": "angry",
        "label": "Angry",
        "description": "Anger, frustration, irritation, annoyance, displeasure",
        "keywords_ja": [
            "怒", "むかつく", "イライラ", "腹立つ", "許せない", "ふざけ",
            "うざい", "きもい", "最悪", "ひどい", "嫌い", "うるさい"
        ],
        "keywords_en": [
            "angry", "mad", "furious", "annoyed", "hate", "terrible",
            "awful", "disgusting", "stupid", "damn"
        ],
    },
    {
        "id": "surprised",
        "label": "Surprised",
        "description": "Surprise, shock, amazement, disbelief, astonishment",
        "keywords_ja": [
            "驚", "びっくり", "まじ", "マジ", "えっ", "おお", "すごい",
            "やばい", "ヤバい", "信じられない", "まさか", "うそ", "嘘", "!!"
        ],
        "keywords_en": [
            "wow", "omg", "surprised", "shock", "amazing", "unbelievable",
            "incredible", "what", "really", "seriously", "!!"
        ],
    },
    {
        "id": "relaxed",
        "label": "Relaxed",
        "description": "Calm, peaceful, comfortable, relieved, content",
        "keywords_ja": [
            "落ち着", "リラックス", "のんびり", "ゆっくり", "穏やか", "平和",
            "癒し", "安心", "ほっと"
        ],
        "keywords_en": [
            "calm", "relax", "peaceful", "chill", "easy", "comfortable",
            "cozy", "soothing"
        ],
    },
]


class EmotionAnalyzerNode(BaseNode):
    """Analyzes text to detect emotions with customizable expressions."""

    async def setup(self, config: dict[str, Any], context: NodeContext) -> None:
        """Initialize the emotion analyzer."""
        self.method = config.get("method", "llm")
        self.language = config.get("language", "ja")
        self.emit_events = config.get("emit_events", True)

        # Load expressions (use defaults if empty)
        expressions_config = config.get("expressions", [])
        if expressions_config and len(expressions_config) > 0:
            self.expressions = expressions_config
        else:
            self.expressions = DEFAULT_EXPRESSIONS

        # Load custom mappings for rule-based
        custom_mappings_str = config.get("custom_mappings", "{}")
        try:
            self.custom_mappings = json.loads(custom_mappings_str) if custom_mappings_str else {}
        except json.JSONDecodeError:
            self.custom_mappings = {}
            await context.log("Invalid custom mappings JSON, using defaults", "warning")

        # LLM settings
        self.llm_provider = config.get("llm_provider", "openai")
        self.llm_api_key = config.get("llm_api_key", "")
        self.llm_model = config.get("llm_model", "gpt-4o-mini")

        # HTTP client for LLM calls
        self._http_client = None

        expr_ids = [e.get("id", e.get("label", "unknown")) for e in self.expressions]
        await context.log(f"Emotion Analyzer initialized with expressions: {expr_ids}")

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

        # Analyze emotion based on method
        if self.method == "llm" and self.llm_api_key:
            try:
                expression, intensity = await self._analyze_llm_based(text, context)
            except Exception as e:
                await context.log(f"LLM analysis failed, falling back to rule-based: {e}", "warning")
                expression, intensity = self._analyze_rule_based(text, context)
        else:
            if self.method == "llm" and not self.llm_api_key:
                await context.log("LLM API key not set, using rule-based analysis", "warning")
            expression, intensity = self._analyze_rule_based(text, context)

        await context.log(f"Detected emotion: {expression} (intensity: {intensity:.2f})")

        # Emit avatar event if enabled
        if self.emit_events:
            await context.emit_event(Event(
                type="avatar.expression",
                payload={
                    "expression": expression,
                    "intensity": intensity
                }
            ))

        return {
            "expression": expression,
            "intensity": intensity,
            "text": text
        }

    async def _analyze_llm_based(self, text: str, context: NodeContext) -> tuple[str, float]:
        """Analyze emotion using LLM."""
        import httpx

        # Build expression descriptions for prompt
        expr_descriptions = "\n".join([
            f"- {e.get('id', e.get('label', 'unknown'))}: {e.get('description', 'No description')}"
            for e in self.expressions
        ])

        valid_ids = [e.get("id", e.get("label", "unknown")) for e in self.expressions]

        prompt = f"""Analyze the emotion in the following text and classify it into one of the available expressions.

Available expressions:
{expr_descriptions}

Text to analyze: "{text}"

Respond with ONLY a JSON object in this exact format (no markdown, no explanation):
{{"expression": "<expression_id>", "intensity": <0.0-1.0>}}

Rules:
- expression must be one of: {', '.join(valid_ids)}
- intensity is how strongly the emotion is expressed (0.0 = very weak, 1.0 = very strong)
- If no clear emotion, use "neutral" with intensity 0.5"""

        if self.llm_provider == "openai":
            response = await self._call_openai(prompt, context)
        elif self.llm_provider == "anthropic":
            response = await self._call_anthropic(prompt, context)
        elif self.llm_provider == "google":
            response = await self._call_google(prompt, context)
        else:
            raise ValueError(f"Unknown LLM provider: {self.llm_provider}")

        # Parse response
        try:
            # Try to extract JSON from response
            json_match = re.search(r'\{[^}]+\}', response)
            if json_match:
                result = json.loads(json_match.group())
                expression = result.get("expression", "neutral")
                intensity = float(result.get("intensity", 0.5))

                # Validate expression ID
                if expression not in valid_ids:
                    await context.log(f"LLM returned unknown expression '{expression}', using neutral", "warning")
                    expression = "neutral"

                # Clamp intensity
                intensity = max(0.0, min(1.0, intensity))

                return expression, intensity
            else:
                raise ValueError("No JSON found in response")
        except (json.JSONDecodeError, ValueError) as e:
            await context.log(f"Failed to parse LLM response: {e}", "warning")
            return "neutral", 0.5

    async def _call_openai(self, prompt: str, context: NodeContext) -> str:
        """Call OpenAI API."""
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.llm_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.llm_model,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 100,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def _call_anthropic(self, prompt: str, context: NodeContext) -> str:
        """Call Anthropic API."""
        import httpx

        # Map model name if needed
        model = self.llm_model
        if model.startswith("gpt-"):
            model = "claude-3-5-haiku-20241022"  # Default to fast model

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.llm_api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 100,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]

    async def _call_google(self, prompt: str, context: NodeContext) -> str:
        """Call Google Gemini API."""
        import httpx

        # Map model name if needed
        model = self.llm_model
        if model.startswith("gpt-"):
            model = "gemini-2.0-flash-lite"  # Default to fast model

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                params={"key": self.llm_api_key},
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [
                        {"parts": [{"text": prompt}]}
                    ],
                    "generationConfig": {
                        "temperature": 0.3,
                        "maxOutputTokens": 100,
                    },
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]

    def _detect_language(self, text: str) -> str:
        """Simple language detection based on character types."""
        # Check for Japanese characters (hiragana, katakana, kanji)
        japanese_pattern = re.compile(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]')
        if japanese_pattern.search(text):
            return "ja"
        return "en"

    def _analyze_rule_based(self, text: str, context: NodeContext) -> tuple[str, float]:
        """Analyze emotion using keyword matching."""
        text_lower = text.lower()

        # Detect language if auto
        if self.language == "auto":
            language = self._detect_language(text)
        else:
            language = self.language

        # Build keyword dictionary from expressions
        keywords: dict[str, list[str]] = {}
        for expr in self.expressions:
            expr_id = expr.get("id", expr.get("label", "unknown"))
            if language == "ja":
                expr_keywords = expr.get("keywords_ja", [])
            else:
                expr_keywords = expr.get("keywords_en", [])
            keywords[expr_id] = expr_keywords

        # Merge with custom mappings
        for emotion, words in self.custom_mappings.items():
            if emotion in keywords:
                keywords[emotion] = keywords[emotion] + words
            else:
                keywords[emotion] = words

        # Count matches for each emotion
        scores: dict[str, int] = {}
        for emotion, words in keywords.items():
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
