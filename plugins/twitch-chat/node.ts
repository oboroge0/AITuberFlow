/**
 * Twitch Chat Node
 *
 * Fetches live chat messages from Twitch streams via tmi.js.
 */

import { InputNode } from "@aituber-flow/sdk";
import type { Event, NodeContext } from "@aituber-flow/sdk";
import { createEvent } from "@aituber-flow/sdk";
import { Client as TmiClient, type ChatUserstate } from "tmi.js";

interface ChatMessage {
  id: string;
  text: string;
  author: string;
  authorId: string;
  timestamp: string;
  isMod: boolean;
  isSubscriber: boolean;
  isBroadcaster: boolean;
}

export default class TwitchChatNode extends InputNode {
  private channel: string | null = null;
  private oauthToken: string = "";
  private filterBots: boolean = true;
  private tmiClient: TmiClient | null = null;
  private lastMessage: ChatMessage | null = null;
  private connected: boolean = false;

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.channel = (config.channel ?? "").toLowerCase().trim();
    this.oauthToken = config.oauthToken ?? "";
    this.filterBots = config.filterBots ?? true;

    if (!this.channel) {
      await context.log("Channel name not configured", "error");
      return;
    }

    // Remove # prefix if present (tmi.js adds it internally)
    if (this.channel.startsWith("#")) {
      this.channel = this.channel.slice(1);
    }

    try {
      await this.connectToTwitch(context);
    } catch (e) {
      await context.log(
        `Failed to connect to Twitch: ${String(e)}`,
        "error",
      );
    }
  }

  private async connectToTwitch(context: NodeContext): Promise<void> {
    const options: Record<string, any> = {
      channels: [this.channel!],
      connection: {
        reconnect: true,
        secure: true,
      },
    };

    // Use anonymous login if no token; otherwise authenticate
    if (this.oauthToken) {
      options.identity = {
        username: "justinfan12345",
        password: `oauth:${this.oauthToken}`,
      };
    }

    this.tmiClient = new TmiClient(options);

    // Set up event handlers
    this.tmiClient.on(
      "message",
      (
        channel: string,
        userstate: ChatUserstate,
        message: string,
        self: boolean,
      ) => {
        if (self) return;
        this.handleMessage(channel, userstate, message, context);
      },
    );

    this.tmiClient.on("connected", () => {
      this.connected = true;
      context.log(`Connected to Twitch chat: #${this.channel}`);
    });

    this.tmiClient.on("disconnected", (reason: string) => {
      this.connected = false;
      context.log(`Disconnected from Twitch: ${reason}`, "warning");
    });

    await this.tmiClient.connect();
  }

  private async handleMessage(
    _channel: string,
    userstate: ChatUserstate,
    text: string,
    context: NodeContext,
  ): Promise<void> {
    const username = userstate["display-name"] ?? userstate.username ?? "";

    // Filter bots
    if (this.filterBots) {
      const lowerName = username.toLowerCase();
      const botNames = ["nightbot", "streamelements", "moobot", "streamlabs"];
      if (botNames.includes(lowerName)) {
        return;
      }
    }

    const badges = userstate.badges ?? {};

    const msg: ChatMessage = {
      id: userstate.id ?? "",
      text,
      author: username,
      authorId: userstate["user-id"] ?? "",
      timestamp: new Date().toISOString(),
      isMod: userstate.mod ?? false,
      isSubscriber: userstate.subscriber ?? false,
      isBroadcaster: "broadcaster" in badges,
    };

    this.lastMessage = msg;

    // Emit event with separate fields for easy connection
    await context.emitEvent(
      createEvent("message.received", {
        message: msg,
        text: msg.text,
        author: msg.author,
      }),
    );

    await context.log(`${msg.author}: ${text.slice(0, 50)}...`);
  }

  async execute(
    _inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    if (!this.connected) {
      await context.log("Not connected to Twitch", "error");
      return {
        connected: false,
        channel: this.channel ? `#${this.channel}` : null,
        message: null,
        author: "",
        text: "",
      };
    }

    await context.log(`Twitch chat active on #${this.channel}`);

    return {
      connected: true,
      channel: `#${this.channel}`,
      message: null,
      author: "",
      text: "",
    };
  }

  async teardown(): Promise<void> {
    this.connected = false;
    if (this.tmiClient) {
      try {
        await this.tmiClient.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.tmiClient = null;
    }
  }
}
