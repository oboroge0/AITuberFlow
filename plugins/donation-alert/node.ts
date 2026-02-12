/**
 * Donation Alert Node
 *
 * Displays visual and audio alerts for donations (Super Chat, Bits, etc.).
 */

import { BaseNode } from "@aituber-flow/sdk";
import type { NodeContext } from "@aituber-flow/sdk";
import { createEvent } from "@aituber-flow/sdk";

export default class DonationAlertNode extends BaseNode {
  private alertSound: string = "";
  private displayDuration: number = 5000;
  private minAmount: number = 0;
  private template: string = "{author} donated {amount} {currency}!";
  private style: string = "default";

  async setup(
    config: Record<string, any>,
    context: NodeContext,
  ): Promise<void> {
    this.alertSound = config.alertSound ?? "";
    this.displayDuration = config.displayDuration ?? 5000;
    this.minAmount = config.minAmount ?? 0;
    this.template =
      config.template ?? "{author} donated {amount} {currency}!";
    this.style = config.style ?? "default";

    await context.log(
      `Donation Alert ready (min: ${this.minAmount}, duration: ${this.displayDuration}ms)`,
    );
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    // Extract donation info
    const amount: number = inputs.amount ?? 0;
    const currency: string = inputs.currency ?? "USD";
    const author: string = inputs.author ?? "Anonymous";
    const message: string = inputs.message ?? "";

    // Check minimum amount
    if (this.minAmount > 0 && amount < this.minAmount) {
      await context.log(
        `Donation from ${author} (${amount} ${currency}) below minimum, skipping alert`,
      );
      return { displayed: false };
    }

    // Format the alert message
    const alertText = this.template
      .replace("{author}", author)
      .replace("{amount}", String(amount))
      .replace("{currency}", currency)
      .replace("{message}", message);

    // Emit the donation alert event
    await context.emitEvent(
      createEvent("donation.alert", {
        text: alertText,
        author,
        amount,
        currency,
        message,
        sound: this.alertSound,
        duration: this.displayDuration,
        style: this.style,
      }),
    );

    await context.log(`Donation alert: ${author} - ${amount} ${currency}`);

    return { displayed: true };
  }

  async teardown(): Promise<void> {
    // No resources to clean up
  }
}
