#!/usr/bin/env python3
"""
manifest.json に ui 設定を追加するマイグレーションスクリプト

既存の全プラグインに ui セクションを追加します。
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
PLUGINS_DIR = PROJECT_ROOT / "plugins"

# 各プラグインのUI設定（CustomNode.tsx から抽出）
PLUGIN_UI_CONFIG = {
    # Control Flow
    "start": {
        "label": "Start",
        "icon": "Play",
        "color": "#10B981",
        "bgColor": "rgba(16, 185, 129, 0.15)",
        "statusText": "Workflow entry point",
        "category": "control"
    },
    "end": {
        "label": "End",
        "icon": "Square",
        "color": "#EF4444",
        "bgColor": "rgba(239, 68, 68, 0.15)",
        "statusText": "Workflow exit point",
        "category": "control"
    },
    "loop": {
        "label": "Loop",
        "icon": "RefreshCw",
        "color": "#F59E0B",
        "bgColor": "rgba(245, 158, 11, 0.15)",
        "statusText": "Loop iteration",
        "category": "control"
    },
    "foreach": {
        "label": "ForEach",
        "icon": "List",
        "color": "#F97316",
        "bgColor": "rgba(249, 115, 22, 0.15)",
        "statusText": "ForEach iteration",
        "category": "control"
    },
    "switch": {
        "label": "Switch",
        "icon": "GitBranch",
        "color": "#F97316",
        "bgColor": "rgba(249, 115, 22, 0.1)",
        "statusText": "Conditional routing",
        "category": "control"
    },
    "delay": {
        "label": "Delay",
        "icon": "Clock",
        "color": "#F97316",
        "bgColor": "rgba(249, 115, 22, 0.1)",
        "statusText": "Delay: 1000ms",
        "category": "control"
    },

    # Input
    "manual-input": {
        "label": "Manual Input",
        "icon": "Type",
        "color": "#22C55E",
        "bgColor": "rgba(34, 197, 94, 0.1)",
        "statusText": "Ready for input",
        "category": "input"
    },
    "youtube-chat": {
        "label": "YouTube Chat",
        "icon": "MessageSquare",
        "color": "#FF0000",
        "bgColor": "rgba(255, 0, 0, 0.1)",
        "statusText": "Waiting for comments...",
        "category": "input"
    },
    "twitch-chat": {
        "label": "Twitch Chat",
        "icon": "MessageSquare",
        "color": "#9146FF",
        "bgColor": "rgba(145, 70, 255, 0.1)",
        "statusText": "Waiting for chat...",
        "category": "input"
    },
    "discord-chat": {
        "label": "Discord Chat",
        "icon": "MessageSquare",
        "color": "#5865F2",
        "bgColor": "rgba(88, 101, 242, 0.1)",
        "statusText": "Waiting for messages...",
        "category": "input"
    },
    "timer": {
        "label": "Timer",
        "icon": "Clock",
        "color": "#06B6D4",
        "bgColor": "rgba(6, 182, 212, 0.1)",
        "statusText": "Timer",
        "category": "input"
    },

    # LLM
    "openai-llm": {
        "label": "ChatGPT",
        "icon": "Cpu",
        "color": "#10B981",
        "bgColor": "rgba(16, 185, 129, 0.1)",
        "statusText": "Model: gpt-4o-mini",
        "category": "llm"
    },
    "anthropic-llm": {
        "label": "Claude",
        "icon": "Cpu",
        "color": "#D97706",
        "bgColor": "rgba(217, 119, 6, 0.1)",
        "statusText": "Model: Claude",
        "category": "llm"
    },
    "google-llm": {
        "label": "Gemini",
        "icon": "Cpu",
        "color": "#4285F4",
        "bgColor": "rgba(66, 133, 244, 0.1)",
        "statusText": "Model: Gemini",
        "category": "llm"
    },
    "ollama-llm": {
        "label": "Ollama",
        "icon": "Cpu",
        "color": "#1F2937",
        "bgColor": "rgba(31, 41, 55, 0.3)",
        "statusText": "Model: Ollama",
        "category": "llm"
    },

    # TTS
    "voicevox-tts": {
        "label": "VOICEVOX",
        "icon": "Volume2",
        "color": "#F59E0B",
        "bgColor": "rgba(245, 158, 11, 0.1)",
        "statusText": "Engine: VOICEVOX",
        "category": "tts"
    },
    "coeiroink-tts": {
        "label": "COEIROINK",
        "icon": "Volume2",
        "color": "#E91E63",
        "bgColor": "rgba(233, 30, 99, 0.1)",
        "statusText": "Engine: COEIROINK",
        "category": "tts"
    },
    "sbv2-tts": {
        "label": "Style-Bert-VITS2",
        "icon": "Volume2",
        "color": "#9C27B0",
        "bgColor": "rgba(156, 39, 176, 0.1)",
        "statusText": "Engine: Style-Bert-VITS2",
        "category": "tts"
    },

    # Avatar
    "avatar-configuration": {
        "label": "Avatar Config",
        "icon": "User",
        "color": "#E879F9",
        "bgColor": "rgba(232, 121, 249, 0.1)",
        "statusText": "Avatar Configuration",
        "category": "avatar"
    },
    "emotion-analyzer": {
        "label": "Emotion Analyzer",
        "icon": "Smile",
        "color": "#F472B6",
        "bgColor": "rgba(244, 114, 182, 0.1)",
        "statusText": "Emotion Analyzer",
        "category": "avatar"
    },
    "motion-trigger": {
        "label": "Motion Trigger",
        "icon": "Play",
        "color": "#C084FC",
        "bgColor": "rgba(192, 132, 252, 0.1)",
        "statusText": "Motion Trigger",
        "category": "avatar"
    },
    "lip-sync": {
        "label": "Lip Sync",
        "icon": "Mic",
        "color": "#FB7185",
        "bgColor": "rgba(251, 113, 133, 0.1)",
        "statusText": "Lip Sync",
        "category": "avatar"
    },

    # Output
    "console-output": {
        "label": "Console Output",
        "icon": "Terminal",
        "color": "#A855F7",
        "bgColor": "rgba(168, 85, 247, 0.1)",
        "statusText": "Ready to display",
        "category": "output"
    },
    "subtitle-display": {
        "label": "Subtitle Display",
        "icon": "Subtitles",
        "color": "#A855F7",
        "bgColor": "rgba(168, 85, 247, 0.1)",
        "statusText": "Subtitle Display",
        "category": "output"
    },
    "audio-player": {
        "label": "Audio Player",
        "icon": "Volume2",
        "color": "#8B5CF6",
        "bgColor": "rgba(139, 92, 246, 0.1)",
        "statusText": "Audio Player",
        "category": "output"
    },
    "donation-alert": {
        "label": "Donation Alert",
        "icon": "Gift",
        "color": "#F59E0B",
        "bgColor": "rgba(245, 158, 11, 0.1)",
        "statusText": "Donation Alert",
        "category": "output"
    },

    # Utility
    "text-transform": {
        "label": "Text Transform",
        "icon": "Type",
        "color": "#EC4899",
        "bgColor": "rgba(236, 72, 153, 0.1)",
        "statusText": "Text Transform",
        "category": "utility"
    },
    "variable": {
        "label": "Variable",
        "icon": "Variable",
        "color": "#14B8A6",
        "bgColor": "rgba(20, 184, 166, 0.1)",
        "statusText": "Variable",
        "category": "utility"
    },
    "http-request": {
        "label": "HTTP Request",
        "icon": "Globe",
        "color": "#3B82F6",
        "bgColor": "rgba(59, 130, 246, 0.1)",
        "statusText": "HTTP Request",
        "category": "utility"
    },
    "random": {
        "label": "Random",
        "icon": "Dice5",
        "color": "#8B5CF6",
        "bgColor": "rgba(139, 92, 246, 0.1)",
        "statusText": "Random Generator",
        "category": "utility"
    },
    "data-formatter": {
        "label": "Data Formatter",
        "icon": "FileJson",
        "color": "#6366F1",
        "bgColor": "rgba(99, 102, 241, 0.1)",
        "statusText": "Data Formatter",
        "category": "utility"
    },

    # OBS
    "obs-scene-switch": {
        "label": "OBS Scene Switch",
        "icon": "Monitor",
        "color": "#302E31",
        "bgColor": "rgba(48, 46, 49, 0.3)",
        "statusText": "OBS Scene Switch",
        "category": "obs"
    },
    "obs-source-toggle": {
        "label": "OBS Source Toggle",
        "icon": "Eye",
        "color": "#302E31",
        "bgColor": "rgba(48, 46, 49, 0.3)",
        "statusText": "OBS Source Toggle",
        "category": "obs"
    },
}


def migrate_manifest(plugin_dir: Path) -> bool | None:
    """1つのプラグインのmanifest.jsonを更新

    Returns:
        True: 更新成功
        False: スキップ（既に設定済みなど）
        None: エラー
    """
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.exists():
        return False

    plugin_id = plugin_dir.name
    if plugin_id not in PLUGIN_UI_CONFIG:
        print(f"  ⚠️ {plugin_id}: UI設定が定義されていません")
        return False

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except json.JSONDecodeError as e:
        print(f"  ❌ {plugin_id}: JSONパースエラー: {e}")
        return None

    # 既にui設定がある場合はスキップ
    if "ui" in manifest:
        print(f"  ⏭️ {plugin_id}: 既にui設定があります")
        return False

    ui_config = PLUGIN_UI_CONFIG[plugin_id]

    # ui設定を追加
    manifest["ui"] = {
        "label": ui_config["label"],
        "icon": ui_config["icon"],
        "color": ui_config["color"],
        "bgColor": ui_config["bgColor"],
        "statusText": ui_config["statusText"],
    }

    # カテゴリを更新（必要な場合）
    if ui_config.get("category"):
        manifest["category"] = ui_config["category"]

    # $schemaを追加（なければ）
    if "$schema" not in manifest:
        # 先頭に追加するため、新しいdictを作成
        new_manifest = {"$schema": "https://aituber-flow.dev/schemas/plugin-manifest.json"}
        new_manifest.update(manifest)
        manifest = new_manifest

    # 保存
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"  ✅ {plugin_id}: 更新完了")
    return True


def main():
    print("🔄 manifest.json マイグレーション\n")
    print("=" * 50)

    updated = 0
    skipped = 0
    errors = 0

    for plugin_dir in sorted(PLUGINS_DIR.iterdir()):
        if not plugin_dir.is_dir():
            continue
        if plugin_dir.name == "categories.json":
            continue

        result = migrate_manifest(plugin_dir)
        if result is True:
            updated += 1
        elif result is False:
            skipped += 1
        elif result is None:
            errors += 1

    print("\n" + "=" * 50)
    print(f"✅ 更新: {updated}")
    print(f"⏭️ スキップ: {skipped}")
    print(f"❌ エラー: {errors}")


if __name__ == "__main__":
    main()
