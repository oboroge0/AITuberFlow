/**
 * Subtitle Display Node
 *
 * Displays text as subtitle overlay for streaming.
 * Emits subtitle events that the frontend subtitle layer captures.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class SubtitleDisplayNode extends BaseNode {
  private style = "default";
  private position = "bottom-center";
  private fontSize = 24;
  private fontColor = "#ffffff";
  private backgroundColor = "rgba(0, 0, 0, 0.7)";
  private showSpeaker = false;
  private animation = "fade";
  private duration = 0;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.style = config.style ?? "default";
    this.position = config.position ?? "bottom-center";
    this.fontSize = config.fontSize ?? 24;
    this.fontColor = config.fontColor ?? "#ffffff";
    this.backgroundColor = config.backgroundColor ?? "rgba(0, 0, 0, 0.7)";
    this.showSpeaker = config.showSpeaker ?? false;
    this.animation = config.animation ?? "fade";
    this.duration = config.duration ?? 0;

    await context.log(
      `Subtitle display initialized: position=${this.position}, style=${this.style}`,
    );
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const text: string = inputs.text ?? "";

    if (!text) {
      return { text: "" };
    }

    // Get character name if show_speaker is enabled
    let speaker = "";
    if (this.showSpeaker && context.character) {
      speaker = context.character.name ?? "";
    }

    // Build subtitle payload
    const payload: Record<string, any> = {
      text,
      speaker,
      style: {
        preset: this.style,
        position: this.position,
        fontSize: this.fontSize,
        fontColor: this.fontColor,
        backgroundColor: this.backgroundColor,
        animation: this.animation,
      },
      duration: this.duration,
    };

    await context.emitEvent(createEvent("subtitle", payload));
    await context.log(
      `Subtitle displayed: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`,
    );

    return { text };
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
