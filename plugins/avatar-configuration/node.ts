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
    const modelUrl = config.model_url ?? "/models/avatar.vrm";
    const idleAnimation = config.idle_animation ?? "";
    const vtubePort = config.vtube_port ?? 8001;
    const vtubeMouthParam = config.vtube_mouth_param ?? "MouthOpen";
    const vtubeExpressionMap = config.vtube_expression_map ?? "{}";
    const pngConfig = config.png_config ?? "{}";

    await context.log(`Avatar Configuration: renderer=${renderer}, model=${modelUrl}`);

    // Emit avatar configuration to frontend
    await context.emitEvent(
      createEvent("avatar.update", {
        renderer,
        model_url: modelUrl,
        idle_animation: idleAnimation,
        vtube_port: vtubePort,
        vtube_mouth_param: vtubeMouthParam,
        vtube_expression_map: vtubeExpressionMap,
        png_config: pngConfig,
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
