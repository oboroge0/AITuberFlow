/**
 * YouTube Chat Node
 *
 * Fetches live chat messages from YouTube streams using the YouTube Data API v3.
 */

import { InputNode } from "@aituber-flow/sdk";
import type { Event, NodeContext } from "@aituber-flow/sdk";
import { createEvent } from "@aituber-flow/sdk";

interface ChatMessage {
  id: string;
  text: string;
  author: string;
  authorChannelId: string;
  timestamp: string;
  isMember: boolean;
  isModerator: boolean;
  isOwner: boolean;
  superchatAmount?: number;
  superchatCurrency?: string;
}

export default class YouTubeChatNode extends InputNode {
  private videoId: string | null = null;
  private apiKey: string | null = null;
  private pollInterval: number = 3000;
  private filterBots: boolean = true;
  private liveChatId: string | null = null;
  private nextPageToken: string | null = null;
  private lastMessage: ChatMessage | null = null;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.videoId = this.extractVideoId(config.videoId ?? "");
    this.apiKey = config.apiKey ?? null;
    this.pollInterval = config.pollInterval ?? 3000;
    this.filterBots = config.filterBots ?? true;

    if (!this.videoId) {
      await context.log("Invalid YouTube video ID", "error");
      return;
    }

    if (!this.apiKey) {
      await context.log("YouTube API key not configured", "error");
      return;
    }

    // Get live chat ID
    try {
      this.liveChatId = await this.getLiveChatId();
      if (this.liveChatId) {
        await context.log(
          `Connected to live chat: ${this.liveChatId.slice(0, 20)}...`,
        );
        // Start polling in background
        context.createTask((signal) => this.pollMessages(signal, context));
      } else {
        await context.log(
          "Could not find live chat for this video",
          "warning",
        );
      }
    } catch (e) {
      await context.log(
        `Failed to connect to YouTube: ${String(e)}`,
        "error",
      );
    }
  }

  private extractVideoId(urlOrId: string): string | null {
    if (!urlOrId) return null;

    // Already a video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) {
      return urlOrId;
    }

    // Extract from various YouTube URL formats
    const pattern =
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/;
    const match = urlOrId.match(pattern);
    if (match) {
      return match[1];
    }

    return urlOrId; // Return as-is and let API validate
  }

  private async getLiveChatId(): Promise<string | null> {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "liveStreamingDetails");
    url.searchParams.set("id", this.videoId!);
    url.searchParams.set("key", this.apiKey!);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    const data = await response.json();

    const items = data.items ?? [];
    if (items.length > 0) {
      const liveDetails = items[0].liveStreamingDetails ?? {};
      return liveDetails.activeLiveChatId ?? null;
    }
    return null;
  }

  private async pollMessages(
    signal: AbortSignal,
    context: NodeContext,
  ): Promise<void> {
    while (!signal.aborted) {
      try {
        const messages = await this.fetchMessages();
        for (const msg of messages) {
          if (signal.aborted) break;
          await this.processMessage(msg, context);
        }
      } catch (e) {
        await context.log(`Polling error: ${String(e)}`, "warning");
      }

      // Wait for interval, checking abort
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, this.pollInterval);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      });
    }
  }

  private async fetchMessages(): Promise<any[]> {
    if (!this.liveChatId) return [];

    const url = new URL(
      "https://www.googleapis.com/youtube/v3/liveChat/messages",
    );
    url.searchParams.set("liveChatId", this.liveChatId);
    url.searchParams.set("part", "snippet,authorDetails");
    url.searchParams.set("key", this.apiKey!);
    if (this.nextPageToken) {
      url.searchParams.set("pageToken", this.nextPageToken);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    const data = await response.json();

    this.nextPageToken = data.nextPageToken ?? null;
    return data.items ?? [];
  }

  private async processMessage(
    item: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    const snippet = item.snippet ?? {};
    const author = item.authorDetails ?? {};

    // Filter bots
    if (this.filterBots) {
      const authorName = (author.displayName ?? "").toLowerCase();
      const botNames = ["nightbot", "streamelements", "moobot"];
      if (botNames.some((bot) => authorName.includes(bot))) {
        return;
      }
    }

    const messageType = snippet.type ?? "textMessageEvent";
    const text = snippet.textMessageDetails?.messageText ?? "";

    // Build message object
    const msg: ChatMessage = {
      id: item.id ?? "",
      text,
      author: author.displayName ?? "Unknown",
      authorChannelId: author.channelId ?? "",
      timestamp: snippet.publishedAt ?? new Date().toISOString(),
      isMember: author.isChatSponsor ?? false,
      isModerator: author.isChatModerator ?? false,
      isOwner: author.isChatOwner ?? false,
    };

    this.lastMessage = msg;

    // Emit appropriate event with separate fields for easy connection
    if (messageType === "superChatEvent") {
      const superChat = snippet.superChatDetails ?? {};
      msg.superchatAmount = (superChat.amountMicros ?? 0) / 1000000;
      msg.superchatCurrency = superChat.currency ?? "USD";

      await context.emitEvent(
        createEvent("message.superchat", {
          message: msg,
          text: msg.text,
          author: msg.author,
          amount: msg.superchatAmount,
          currency: msg.superchatCurrency,
        }),
      );
      await context.log(
        `Superchat from ${msg.author}: ${msg.superchatAmount} ${msg.superchatCurrency}`,
      );
    } else if (messageType === "memberMilestoneChatEvent") {
      await context.emitEvent(
        createEvent("message.membership", {
          message: msg,
          text: msg.text,
          author: msg.author,
        }),
      );
      await context.log(`Membership: ${msg.author}`);
    } else {
      await context.emitEvent(
        createEvent("message.received", {
          message: msg,
          text: msg.text,
          author: msg.author,
        }),
      );
      await context.log(`${msg.author}: ${text.slice(0, 50)}...`);
    }
  }

  async execute(
    _inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    if (!this.liveChatId) {
      await context.log("Not connected to YouTube chat", "error");
      return {
        connected: false,
        videoId: this.videoId,
        message: null,
        author: "",
        text: "",
      };
    }

    await context.log(`YouTube chat active for video ${this.videoId}`);

    return {
      connected: true,
      videoId: this.videoId,
      liveChatId: this.liveChatId,
      message: null,
      author: "",
      text: "",
    };
  }

  async teardown(): Promise<void> {
    await this.cancelAllTasks();
  }

  /**
   * Cancel background tasks. Called from teardown.
   * The actual cancellation is handled by the context's AbortControllers.
   */
  private async cancelAllTasks(): Promise<void> {
    // Background tasks are managed by context.createTask / context.cancelBackgroundTasks
    // No additional cleanup needed here
  }
}
