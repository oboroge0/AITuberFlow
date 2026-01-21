"""
Donation Alert Node

Displays visual and audio alerts for donations (Super Chat, Bits, etc.).
"""

import sys
from pathlib import Path
from typing import Optional

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event


class DonationAlertNode(BaseNode):
    """
    Donation Alert Node

    Displays visual and audio alerts for donations.
    Emits events to the overlay for display.
    """

    def __init__(self):
        self.alert_sound = ""
        self.display_duration = 5000
        self.min_amount = 0
        self.template = "{author} donated {amount} {currency}!"
        self.style = "default"

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the donation alert settings."""
        self.alert_sound = config.get("alertSound", "")
        self.display_duration = config.get("displayDuration", 5000)
        self.min_amount = config.get("minAmount", 0)
        self.template = config.get("template", "{author} donated {amount} {currency}!")
        self.style = config.get("style", "default")

        await context.log(f"Donation Alert ready (min: {self.min_amount}, duration: {self.display_duration}ms)")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """
        Display a donation alert.

        Takes donation info from inputs and emits an alert event.
        """
        # Extract donation info
        amount = inputs.get("amount", 0)
        currency = inputs.get("currency", "USD")
        author = inputs.get("author", "Anonymous")
        message = inputs.get("message", "")

        # Check minimum amount
        if self.min_amount > 0 and amount < self.min_amount:
            await context.log(f"Donation from {author} ({amount} {currency}) below minimum, skipping alert")
            return {"displayed": False}

        # Format the alert message
        alert_text = self.template.format(
            author=author,
            amount=amount,
            currency=currency,
            message=message
        )

        # Emit the donation alert event
        await context.emit_event(Event(
            type="donation.alert",
            payload={
                "text": alert_text,
                "author": author,
                "amount": amount,
                "currency": currency,
                "message": message,
                "sound": self.alert_sound,
                "duration": self.display_duration,
                "style": self.style,
            }
        ))

        await context.log(f"Donation alert: {author} - {amount} {currency}")

        return {"displayed": True}

    async def teardown(self) -> None:
        """Clean up resources."""
        pass
