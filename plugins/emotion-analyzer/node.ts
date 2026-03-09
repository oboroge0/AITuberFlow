/**
 * Emotion Analyzer Node
 * Analyzes text to detect emotions for avatar expression control.
 * Supports customizable expressions and LLM-based analysis.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

interface Expression {
  id?: string;
  label?: string;
  description?: string;
  keywords_ja?: string[];
  keywords_en?: string[];
}

// Default expressions with descriptions for LLM analysis
const DEFAULT_EXPRESSIONS: Expression[] = [
  {
    id: "neutral",
    label: "Neutral",
    description: "Default calm state, no strong emotion",
    keywords_ja: [],
    keywords_en: [],
  },
  {
    id: "happy",
    label: "Happy",
    description: "Joy, excitement, gratitude, amusement, laughter",
    keywords_ja: [
      "嬉しい", "楽しい", "幸せ", "最高", "やった", "わーい", "素晴らしい",
      "ありがとう", "感謝", "良かった", "いいね", "素敵", "可愛い", "面白い",
      "笑", "www", "草", "ウケる", "爆笑", "ハッピー", "喜び", "うれしい",
    ],
    keywords_en: [
      "happy", "joy", "glad", "great", "awesome", "amazing", "wonderful",
      "thank", "love", "nice", "good", "excellent", "fantastic", "fun",
      "lol", "haha", "laugh", "yay", "excited",
    ],
  },
  {
    id: "sad",
    label: "Sad",
    description: "Sadness, disappointment, loneliness, regret, apology",
    keywords_ja: [
      "悲しい", "辛い", "寂しい", "泣", "残念", "ごめん", "すまん",
      "申し訳", "つらい", "切ない", "悔しい", "哀しい", "涙", "ショック",
    ],
    keywords_en: [
      "sad", "sorry", "unfortunate", "disappointed", "cry", "tears",
      "miss", "lonely", "depressed", "upset", "hurt",
    ],
  },
  {
    id: "angry",
    label: "Angry",
    description: "Anger, frustration, irritation, annoyance, displeasure",
    keywords_ja: [
      "怒", "むかつく", "イライラ", "腹立つ", "許せない", "ふざけ",
      "うざい", "きもい", "最悪", "ひどい", "嫌い", "うるさい",
    ],
    keywords_en: [
      "angry", "mad", "furious", "annoyed", "hate", "terrible",
      "awful", "disgusting", "stupid", "damn",
    ],
  },
  {
    id: "surprised",
    label: "Surprised",
    description: "Surprise, shock, amazement, disbelief, astonishment",
    keywords_ja: [
      "驚", "びっくり", "まじ", "マジ", "えっ", "おお", "すごい",
      "やばい", "ヤバい", "信じられない", "まさか", "うそ", "嘘", "!!",
    ],
    keywords_en: [
      "wow", "omg", "surprised", "shock", "amazing", "unbelievable",
      "incredible", "what", "really", "seriously", "!!",
    ],
  },
  {
    id: "relaxed",
    label: "Relaxed",
    description: "Calm, peaceful, comfortable, relieved, content",
    keywords_ja: [
      "落ち着", "リラックス", "のんびり", "ゆっくり", "穏やか", "平和",
      "癒し", "安心", "ほっと",
    ],
    keywords_en: [
      "calm", "relax", "peaceful", "chill", "easy", "comfortable",
      "cozy", "soothing",
    ],
  },
];

export default class EmotionAnalyzerNode extends BaseNode {
  private method = "llm";
  private language = "ja";
  private emitEvents = true;
  private expressions: Expression[] = DEFAULT_EXPRESSIONS;
  private customMappings: Record<string, string[]> = {};
  private llmProvider = "openai";
  private llmApiKey = "";
  private llmModel = "gpt-4o-mini";

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.method = config.method ?? "llm";
    this.language = config.language ?? "ja";
    this.emitEvents = config.emitEvents ?? config.emit_events ?? true;

    // Load expressions (use defaults if empty)
    const expressionsConfig: Expression[] = config.expressions ?? [];
    if (expressionsConfig.length > 0) {
      this.expressions = expressionsConfig;
    } else {
      this.expressions = DEFAULT_EXPRESSIONS;
    }

    // Load custom mappings for rule-based
    const customMappingsStr: string = config.customMappings ?? config.custom_mappings ?? "{}";
    try {
      this.customMappings = customMappingsStr ? JSON.parse(customMappingsStr) : {};
    } catch {
      this.customMappings = {};
      await context.log("Invalid custom mappings JSON, using defaults", "warning");
    }

    // LLM settings
    this.llmProvider = config.llmProvider ?? config.llm_provider ?? "openai";
    this.llmApiKey = config.llmApiKey ?? config.llm_api_key ?? "";
    this.llmModel = config.llmModel ?? config.llm_model ?? "gpt-4o-mini";

    const exprIds = this.expressions.map((e) => e.id ?? e.label ?? "unknown");
    await context.log(`Emotion Analyzer initialized with expressions: ${JSON.stringify(exprIds)}`);
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const text: string = inputs.text ?? "";

    if (!text) {
      return { expression: "neutral", intensity: 0.0, text };
    }

    // Analyze emotion based on method
    let expression: string;
    let intensity: number;

    if (this.method === "llm" && this.llmApiKey) {
      try {
        [expression, intensity] = await this.analyzeLlmBased(text, context);
      } catch (e) {
        await context.log(
          `LLM analysis failed, falling back to rule-based: ${e}`,
          "warning",
        );
        [expression, intensity] = this.analyzeRuleBased(text);
      }
    } else {
      if (this.method === "llm" && !this.llmApiKey) {
        await context.log("LLM API key not set, using rule-based analysis", "warning");
      }
      [expression, intensity] = this.analyzeRuleBased(text);
    }

    await context.log(`Detected emotion: ${expression} (intensity: ${intensity.toFixed(2)})`);

    // Emit avatar event if enabled
    if (this.emitEvents) {
      await context.emitEvent(
        createEvent("avatar.expression", {
          expression,
          intensity,
        }),
      );
    }

    return { expression, intensity, text };
  }

  private async analyzeLlmBased(
    text: string,
    context: NodeContext,
  ): Promise<[string, number]> {
    // Build expression descriptions for prompt
    const exprDescriptions = this.expressions
      .map((e) => `- ${e.id ?? e.label ?? "unknown"}: ${e.description ?? "No description"}`)
      .join("\n");

    const validIds = this.expressions.map((e) => e.id ?? e.label ?? "unknown");

    const prompt = `Analyze the emotion in the following text and classify it into one of the available expressions.

Available expressions:
${exprDescriptions}

Text to analyze: "${text}"

Respond with ONLY a JSON object in this exact format (no markdown, no explanation):
{"expression": "<expression_id>", "intensity": <0.0-1.0>}

Rules:
- expression must be one of: ${validIds.join(", ")}
- intensity is how strongly the emotion is expressed (0.0 = very weak, 1.0 = very strong)
- If no clear emotion, use "neutral" with intensity 0.5`;

    let response: string;
    if (this.llmProvider === "openai") {
      response = await this.callOpenai(prompt);
    } else if (this.llmProvider === "anthropic") {
      response = await this.callAnthropic(prompt);
    } else if (this.llmProvider === "google") {
      response = await this.callGoogle(prompt);
    } else {
      throw new Error(`Unknown LLM provider: ${this.llmProvider}`);
    }

    // Parse response
    try {
      const jsonMatch = response.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        let expression: string = result.expression ?? "neutral";
        let intensity: number = Number(result.intensity ?? 0.5);

        // Validate expression ID
        if (!validIds.includes(expression)) {
          await context.log(
            `LLM returned unknown expression '${expression}', using neutral`,
            "warning",
          );
          expression = "neutral";
        }

        // Clamp intensity
        intensity = Math.max(0.0, Math.min(1.0, intensity));

        return [expression, intensity];
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (e) {
      await context.log(`Failed to parse LLM response: ${e}`, "warning");
      return ["neutral", 0.5];
    }
  }

  private async callOpenai(prompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.llmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.llmModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 100,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
  }

  private async callAnthropic(prompt: string): Promise<string> {
    // Map model name if needed
    let model = this.llmModel;
    if (model.startsWith("gpt-")) {
      model = "claude-3-5-haiku-20241022";
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.llmApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
    const data = await response.json();
    return data.content[0].text;
  }

  private async callGoogle(prompt: string): Promise<string> {
    // Map model name if needed
    let model = this.llmModel;
    if (model.startsWith("gpt-")) {
      model = "gemini-2.0-flash-lite";
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.llmApiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 100,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Google API error: ${response.status}`);
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  private detectLanguage(text: string): string {
    // Check for Japanese characters (hiragana, katakana, kanji)
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
    if (japanesePattern.test(text)) {
      return "ja";
    }
    return "en";
  }

  private analyzeRuleBased(text: string): [string, number] {
    const textLower = text.toLowerCase();

    // Detect language if auto
    const language = this.language === "auto" ? this.detectLanguage(text) : this.language;

    // Build keyword dictionary from expressions
    const keywords: Record<string, string[]> = {};
    for (const expr of this.expressions) {
      const exprId = expr.id ?? expr.label ?? "unknown";
      if (language === "ja") {
        keywords[exprId] = expr.keywords_ja ?? [];
      } else {
        keywords[exprId] = expr.keywords_en ?? [];
      }
    }

    // Merge with custom mappings
    for (const [emotion, words] of Object.entries(this.customMappings)) {
      if (emotion in keywords) {
        keywords[emotion] = [...keywords[emotion], ...words];
      } else {
        keywords[emotion] = words;
      }
    }

    // Count matches for each emotion
    const scores: Record<string, number> = {};
    for (const [emotion, words] of Object.entries(keywords)) {
      let score = 0;
      for (const word of words) {
        if (textLower.includes(word.toLowerCase())) {
          score += 1;
          // Higher weight for exact matches or emoticons
          if (["!!", "www", "草", "lol", "haha"].includes(word)) {
            score += 1;
          }
        }
      }
      scores[emotion] = score;
    }

    // Find the emotion with highest score
    let maxEmotion = "neutral";
    let maxScore = 0;
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

    for (const [emotion, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxEmotion = emotion;
      }
    }

    // Calculate intensity (0.0 - 1.0)
    let intensity: number;
    if (totalScore > 0) {
      intensity = Math.min(1.0, maxScore / 3);
    } else {
      intensity = 0.0;
    }

    // Default to neutral if no strong emotion detected
    if (maxScore === 0) {
      return ["neutral", 0.5];
    }

    return [maxEmotion, intensity];
  }
}
