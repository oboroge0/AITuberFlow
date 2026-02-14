import type { Emotion, Memory, Message } from "@aituber-flow/sdk";

export class CharacterState {
  name = "AI Assistant";
  personality = "Friendly and helpful virtual streamer";
  emotion: Emotion = { current: "neutral", intensity: 0.5 };
  shortTermMemory: Message[] = [];
  longTermMemory: Memory[] = [];
  currentTopic: string | null = null;
  lastSpokeAt: string | null = null;
  maxShortTermMemory = 20;

  addMessage(message: Message): void {
    this.shortTermMemory.push(message);
    if (this.shortTermMemory.length > this.maxShortTermMemory) {
      this.shortTermMemory = this.shortTermMemory.slice(-this.maxShortTermMemory);
    }
  }

  updateEmotion(emotion: string, intensity = 0.5): void {
    this.emotion = {
      current: emotion,
      intensity: Math.max(0, Math.min(1, intensity)),
    };
  }

  getConversationHistory(): { role: string; content: string }[] {
    return this.shortTermMemory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  toDict(): Record<string, unknown> {
    return {
      name: this.name,
      personality: this.personality,
      emotion: {
        current: this.emotion.current,
        intensity: this.emotion.intensity,
      },
      memory: {
        shortTerm: this.shortTermMemory.map((m) => ({
          role: m.role,
          content: m.content,
          author: m.author,
          timestamp: m.timestamp,
        })),
        longTerm: this.longTermMemory.map((m) => ({
          id: m.id,
          content: m.content,
          timestamp: m.timestamp,
        })),
      },
      currentTopic: this.currentTopic,
      lastSpokeAt: this.lastSpokeAt,
    };
  }

  static fromConfig(config: Record<string, unknown>): CharacterState {
    const state = new CharacterState();
    state.name = (config.name as string) ?? "AI Assistant";
    state.personality = (config.personality as string) ?? "Friendly and helpful";
    return state;
  }
}
