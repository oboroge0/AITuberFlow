/**
 * OBS Scene Switch Node
 *
 * Switch OBS scenes via WebSocket connection.
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

export default class OBSSceneSwitchNode extends BaseNode {
  private host = "localhost";
  private port = 4455;
  private password = "";
  private sceneName = "";
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
    this.sceneName = config.sceneName ?? config.scene_name ?? "";

    await context.log(`OBS Scene Switch configured: ${this.host}:${this.port}`);

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
      return { success: false, currentScene: "", scenes: [] };
    }

    if (!this.client) {
      // Try to reconnect
      try {
        this.client = new OBSWebSocket();
        const url = `ws://${this.host}:${this.port}`;
        await this.client.connect(url, this.password || undefined);
      } catch (e) {
        await context.log(`Failed to connect to OBS: ${e}`, "error");
        return { success: false, currentScene: "", scenes: [] };
      }
    }

    // Get target scene name (input overrides config)
    const targetScene: string = inputs.sceneName ?? this.sceneName;

    if (!targetScene) {
      await context.log("No scene name specified", "warning");
      return { success: false, currentScene: "", scenes: [] };
    }

    try {
      // Get available scenes
      const sceneList = await this.client.call("GetSceneList");
      const scenes: string[] = sceneList.scenes.map((s: any) => s.sceneName);

      // Switch scene
      await this.client.call("SetCurrentProgramScene", { sceneName: targetScene });
      await context.log(`Switched to scene: ${targetScene}`);

      // Get current scene to confirm
      const current = await this.client.call("GetCurrentProgramScene");
      const currentScene: string = current.currentProgramSceneName;

      return { success: true, currentScene: currentScene, scenes };
    } catch (e) {
      await context.log(`Failed to switch scene: ${e}`, "error");

      // Try to get current state even if switch failed
      try {
        const sceneList = await this.client.call("GetSceneList");
        const scenes: string[] = sceneList.scenes.map((s: any) => s.sceneName);
        const current = await this.client.call("GetCurrentProgramScene");
        return {
          success: false,
          currentScene: current.currentProgramSceneName,
          scenes,
        };
      } catch {
        return { success: false, currentScene: "", scenes: [] };
      }
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
