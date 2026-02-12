import type { StreamMessage } from "@aituber-flow/sdk";

export class StreamContext {
  platform: string | null = null;
  videoId: string | null = null;
  channelId: string | null = null;
  viewerCount = 0;
  likeCount = 0;
  messageQueue: StreamMessage[] = [];
  superchatQueue: StreamMessage[] = [];
  streamStartedAt: string | null = null;
  lastMessageAt: string | null = null;
  maxQueueSize = 100;

  get silenceDuration(): number {
    if (!this.lastMessageAt) return 0;
    const last = new Date(this.lastMessageAt).getTime();
    return (Date.now() - last) / 1000;
  }

  addMessage(message: StreamMessage): void {
    this.messageQueue.push(message);
    this.lastMessageAt = message.timestamp;

    if (message.superchatAmount) {
      this.superchatQueue.push(message);
    }

    if (this.messageQueue.length > this.maxQueueSize) {
      this.messageQueue = this.messageQueue.slice(-this.maxQueueSize);
    }
    if (this.superchatQueue.length > this.maxQueueSize) {
      this.superchatQueue = this.superchatQueue.slice(-this.maxQueueSize);
    }
  }

  popMessage(): StreamMessage | null {
    return this.messageQueue.shift() ?? null;
  }

  popSuperchat(): StreamMessage | null {
    return this.superchatQueue.shift() ?? null;
  }

  updateStats(viewerCount?: number, likeCount?: number): void {
    if (viewerCount !== undefined) this.viewerCount = viewerCount;
    if (likeCount !== undefined) this.likeCount = likeCount;
  }

  toDict(): Record<string, unknown> {
    return {
      platform: this.platform,
      videoId: this.videoId,
      channelId: this.channelId,
      viewerCount: this.viewerCount,
      likeCount: this.likeCount,
      messageQueue: this.messageQueue.slice(-10).map((m) => ({
        id: m.id,
        content: m.content,
        author: m.author,
        timestamp: m.timestamp,
      })),
      superchatQueue: this.superchatQueue.slice(-10).map((m) => ({
        id: m.id,
        content: m.content,
        author: m.author,
        amount: m.superchatAmount,
        currency: m.superchatCurrency,
      })),
      streamStartedAt: this.streamStartedAt,
      lastMessageAt: this.lastMessageAt,
      silenceDuration: this.silenceDuration,
    };
  }
}
