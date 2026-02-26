/**
 * Avatar Configuration Node
 *
 * Static configuration for avatar display.
 * Sets VRM model, idle animation, and renderer type.
 *
 * This node only emits configuration on setup - it has no inputs or outputs.
 * Avatar control (expression, motion, lip-sync) is handled by dedicated nodes
 * that emit events directly.
 */

import { BaseNode, NodeContext, createEvent } from "@aituber-flow/sdk";

export default class AvatarConfigurationNode extends BaseNode {
  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    const renderer = config.renderer ?? "vrm";
    const modelUrl = config.modelUrl ?? config.model_url ?? "/models/avatar.vrm";
    const idleAnimation = config.idleAnimation ?? config.idle_animation ?? "";
    const vtubePort = config.vtubePort ?? config.vtube_port ?? 8001;
    const vtubeMouthParam = config.vtubeMouthParam ?? config.vtube_mouth_param ?? "MouthOpen";
    const vtubeExpressionMap = config.vtubeExpressionMap ?? config.vtube_expression_map ?? "{}";
    const pngConfig = config.pngConfig ?? config.png_config ?? "{}";

    await context.log(`Avatar Configuration: renderer=${renderer}, model=${modelUrl}`);

    // Emit avatar configuration to frontend
    await context.emitEvent(
      createEvent("avatar.update", {
        renderer,
        modelUrl,
        idleAnimation,
        vtubePort,
        vtubeMouthParam,
        vtubeExpressionMap,
        pngConfig,
      }),
    );
  }

  async execute(
    _inputs: Record<string, any>,
    _context: NodeContext,
  ): Promise<Record<string, any>> {
    // No-op - this node only configures on setup.
    return {};
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
