/**
 * Discord Chat Node
 *
 * Receives messages from Discord channels using discord.js.
 */

import { InputNode } from "@aituber-flow/sdk";
import type { NodeContext } from "@aituber-flow/sdk";
import { createEvent } from "@aituber-flow/sdk";
import {
  Client,
  GatewayIntentBits,
  type Message as DiscordMessage,
} from "discord.js";

interface ChatMessage {
  id: string;
  text: string;
  author: string;
  authorId: string;
  channelId: string;
  channelName: string;
  guildId: string | null;
  guildName: string | null;
  timestamp: string;
  isMention: boolean;
  isReply: boolean;
  replyToId: string | null;
}

export default class DiscordChatNode extends InputNode {
  private botToken: string = "";
  private channelIds: Set<string> = new Set();
  private filterBots: boolean = true;
  private mentionOnly: boolean = false;
  private client: Client | null = null;
  private running: boolean = false;
  private lastMessage: ChatMessage | null = null;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.botToken = config.botToken ?? "";
    this.filterBots = config.filterBots ?? true;
    this.mentionOnly = config.mentionOnly ?? false;

    // Parse channel IDs
    const channelIdsStr: string = config.channelIds ?? "";
    if (channelIdsStr) {
      const ids = channelIdsStr
        .split(",")
        .map((id: string) => id.trim())
        .filter((id: string) => id.length > 0);
      this.channelIds = new Set(ids);
    }

    if (!this.botToken) {
      await context.log("Discord bot token not configured", "error");
      return;
    }

    // Create client with required intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    // Set up event handlers
    this.client.on("ready", () => {
      this.running = true;
      context.log(`Discord bot connected as ${this.client!.user?.tag}`);
    });

    this.client.on("messageCreate", (message: DiscordMessage) => {
      this.handleMessage(message, context);
    });

    // Start bot in background
    context.createTask((signal) => this.runBot(signal, context));
    await context.log("Starting Discord bot...");
  }

  private async runBot(
    signal: AbortSignal,
    context: NodeContext,
  ): Promise<void> {
    try {
      await this.client!.login(this.botToken);

      // Keep alive until aborted
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    } catch (e) {
      const errorStr = String(e);
      if (errorStr.includes("TOKEN_INVALID") || errorStr.includes("login")) {
        await context.log("Invalid Discord bot token", "error");
      } else {
        await context.log(`Discord error: ${errorStr}`, "error");
      }
    }
  }

  private async handleMessage(
    message: DiscordMessage,
    context: NodeContext,
  ): Promise<void> {
    // Ignore own messages
    if (message.author.id === this.client?.user?.id) {
      return;
    }

    // Filter bots
    if (this.filterBots && message.author.bot) {
      return;
    }

    // Filter by channel
    if (this.channelIds.size > 0 && !this.channelIds.has(message.channelId)) {
      return;
    }

    // Check for mention
    const isMention = message.mentions.has(this.client!.user!.id);

    // If mentionOnly is enabled, skip non-mentions
    if (this.mentionOnly && !isMention) {
      return;
    }

    // Build message object
    const channelName =
      "name" in message.channel
        ? (message.channel.name ?? "DM")
        : "DM";

    const msg: ChatMessage = {
      id: message.id,
      text: message.content,
      author: message.author.displayName ?? message.author.username,
      authorId: message.author.id,
      channelId: message.channelId,
      channelName,
      guildId: message.guildId ?? null,
      guildName: message.guild?.name ?? null,
      timestamp: message.createdAt.toISOString(),
      isMention,
      isReply: message.reference !== null,
      replyToId: message.reference?.messageId ?? null,
    };

    this.lastMessage = msg;

    // Emit appropriate event
    const eventType = isMention ? "message.mention" : "message.received";
    await context.emitEvent(
      createEvent(eventType, {
        message: msg,
        text: msg.text,
        author: msg.author,
      }),
    );

    // Log the message
    const channelInfo = msg.guildName ? `#${msg.channelName}` : "DM";
    await context.log(
      `[${channelInfo}] ${msg.author}: ${msg.text.slice(0, 50)}...`,
    );
  }

  async execute(
    _inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    if (!this.running) {
      await context.log("Discord bot not connected", "warning");
      return {
        connected: false,
        message: null,
        author: "",
        text: "",
      };
    }

    const botName = this.client?.user?.tag ?? "Unknown";
    await context.log(`Discord bot active as ${botName}`);

    return {
      connected: true,
      botName,
      message: this.lastMessage,
      author: this.lastMessage?.author ?? "",
      text: this.lastMessage?.text ?? "",
    };
  }

  async teardown(): Promise<void> {
    this.running = false;
    if (this.client) {
      try {
        await this.client.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.client = null;
    }
  }
}
