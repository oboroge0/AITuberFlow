/**
 * OBS Source Toggle Node
 *
 * Show or hide OBS sources via WebSocket connection.
 * Requires OBS Studio 28+ with WebSocket server enabled.
 * Uses obs-websocket-js npm package.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

let OBSWebSocket: any;
let OBS_AVAILABLE = false;

try {
  OBSWebSocket = require("obs-websocket-js").default ?? require("obs-websocket-js");
  OBS_AVAILABLE = true;
} catch {
  OBS_AVAILABLE = false;
}

export default class OBSSourceToggleNode extends BaseNode {
  private host = "localhost";
  private port = 4455;
  private password = "";
  private sceneName = "";
  private sourceName = "";
  private action = "toggle";
  private client: any = null;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    if (!OBS_AVAILABLE) {
      await context.log(
        "obs-websocket-js not installed. Run: npm install obs-websocket-js",
        "error",
      );
      return;
    }

    this.host = config.host ?? "localhost";
    this.port = config.port ?? 4455;
    this.password = config.password ?? "";
    this.sceneName = config.scene_name ?? "";
    this.sourceName = config.source_name ?? "";
    this.action = config.action ?? "toggle";

    await context.log(`OBS Source Toggle configured: ${this.sourceName} (${this.action})`);

    // Try to connect
    try {
      this.client = new OBSWebSocket();
      const url = `ws://${this.host}:${this.port}`;
      await this.client.connect(url, this.password || undefined);
      await context.log("Connected to OBS WebSocket");
    } catch (e) {
      await context.log(`Failed to connect to OBS: ${e}`, "error");
      this.client = null;
    }
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    if (!OBS_AVAILABLE) {
      return { success: false, visible: false, source_name: this.sourceName };
    }

    if (!this.client) {
      // Try to reconnect
      try {
        this.client = new OBSWebSocket();
        const url = `ws://${this.host}:${this.port}`;
        await this.client.connect(url, this.password || undefined);
      } catch (e) {
        await context.log(`Failed to connect to OBS: ${e}`, "error");
        return { success: false, visible: false, source_name: this.sourceName };
      }
    }

    if (!this.sourceName) {
      await context.log("No source name specified", "warning");
      return { success: false, visible: false, source_name: "" };
    }

    try {
      // Get scene name (use current if not specified)
      let sceneName = this.sceneName;
      if (!sceneName) {
        const current = await this.client.call("GetCurrentProgramScene");
        sceneName = current.currentProgramSceneName;
      }

      // Get scene item ID for the source
      const sceneItemId = await this.getSceneItemId(sceneName, this.sourceName);

      if (sceneItemId === null) {
        await context.log(
          `Source '${this.sourceName}' not found in scene '${sceneName}'`,
          "error",
        );
        return { success: false, visible: false, source_name: this.sourceName };
      }

      // Get current visibility
      const currentState = await this.client.call("GetSceneItemEnabled", {
        sceneName,
        sceneItemId,
      });
      const currentVisible: boolean = currentState.sceneItemEnabled;

      // Determine target visibility
      const inputVisible = inputs.visible;
      let targetVisible: boolean;

      if (inputVisible !== undefined) {
        // Input overrides action
        targetVisible = Boolean(inputVisible);
      } else if (this.action === "show") {
        targetVisible = true;
      } else if (this.action === "hide") {
        targetVisible = false;
      } else {
        // toggle
        targetVisible = !currentVisible;
      }

      // Set visibility
      await this.client.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId,
        sceneItemEnabled: targetVisible,
      });

      const actionWord = targetVisible ? "shown" : "hidden";
      await context.log(`Source '${this.sourceName}' ${actionWord}`);

      return { success: true, visible: targetVisible, source_name: this.sourceName };
    } catch (e) {
      await context.log(`Failed to toggle source: ${e}`, "error");
      return { success: false, visible: false, source_name: this.sourceName };
    }
  }

  private async getSceneItemId(
    sceneName: string,
    sourceName: string,
  ): Promise<number | null> {
    try {
      const result = await this.client.call("GetSceneItemList", { sceneName });
      for (const item of result.sceneItems) {
        if (item.sourceName === sourceName) {
          return item.sceneItemId;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async teardown(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.client = null;
    }
  }
}
