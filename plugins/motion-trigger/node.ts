/**
 * Motion Trigger Node - Trigger avatar expressions and motions
 *
 * Designed to output to Avatar Controller for centralized avatar control.
 * Can also emit events directly if emit_events is enabled.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class MotionTriggerNode extends BaseNode {
  private expression = "";
  private intensity = 0.8;
  private motionUrl = "";
  private motion = "";
  private emitEvents = true;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.expression = config.expression ?? "";
    this.intensity = Number(config.intensity ?? 0.8);
    this.motionUrl = config.motion_url ?? "";
    this.motion = config.motion ?? ""; // Legacy support
    this.emitEvents = config.emit_events ?? true;

    const motionDesc = this.motionUrl || this.motion || "none";
    await context.log(
      `Motion Trigger initialized - Expression: ${this.expression || "none"}, ` +
        `Motion: ${motionDesc}`,
    );
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    const triggerInput = inputs.trigger;

    const result: Record<string, any> = {
      expression: this.expression ? this.expression : null,
      intensity: this.expression ? this.intensity : null,
      motion_url: this.motionUrl ? this.motionUrl : null,
      motion: this.motion ? this.motion : null, // Legacy
      passthrough: triggerInput,
    };

    // Direct event emission (optional, disabled by default)
    if (this.emitEvents) {
      // Emit expression event if configured
      if (this.expression) {
        await context.emitEvent(
          createEvent("avatar.expression", {
            expression: this.expression,
            intensity: this.intensity,
          }),
        );
        await context.log(
          `Emitted expression: ${this.expression} (intensity: ${this.intensity})`,
        );
      }

      // Emit motion event if configured (motion_url takes priority)
      if (this.motionUrl) {
        await context.emitEvent(
          createEvent("avatar.motion", { motion_url: this.motionUrl }),
        );
        await context.log(`Emitted motion: ${this.motionUrl}`);
      } else if (this.motion) {
        await context.emitEvent(
          createEvent("avatar.motion", { motion: this.motion }),
        );
        await context.log(`Emitted motion (legacy): ${this.motion}`);
      }
    }

    return result;
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
