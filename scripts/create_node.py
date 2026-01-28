#!/usr/bin/env python3
"""
AITuberFlow プラグイン作成CLI

新しいプラグインの雛形を対話的に作成します。

使用方法:
    python scripts/create_node.py
    python scripts/create_node.py --name my-node --category utility
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

# プロジェクトルートを取得
PROJECT_ROOT = Path(__file__).parent.parent
PLUGINS_DIR = PROJECT_ROOT / "plugins"
CATEGORIES_FILE = PLUGINS_DIR / "categories.json"

# カテゴリごとのデフォルト色
CATEGORY_COLORS = {
    "control": {"color": "#10B981", "bgColor": "rgba(16, 185, 129, 0.15)"},
    "input": {"color": "#22C55E", "bgColor": "rgba(34, 197, 94, 0.1)"},
    "llm": {"color": "#10B981", "bgColor": "rgba(16, 185, 129, 0.1)"},
    "tts": {"color": "#F59E0B", "bgColor": "rgba(245, 158, 11, 0.1)"},
    "avatar": {"color": "#E879F9", "bgColor": "rgba(232, 121, 249, 0.1)"},
    "output": {"color": "#A855F7", "bgColor": "rgba(168, 85, 247, 0.1)"},
    "utility": {"color": "#6366F1", "bgColor": "rgba(99, 102, 241, 0.1)"},
    "obs": {"color": "#302E31", "bgColor": "rgba(48, 46, 49, 0.3)"},
}

# カテゴリごとのデフォルトアイコン
CATEGORY_ICONS = {
    "control": "Play",
    "input": "MessageSquare",
    "llm": "Cpu",
    "tts": "Volume2",
    "avatar": "User",
    "output": "Monitor",
    "utility": "Wrench",
    "obs": "Tv",
}


def load_categories() -> list:
    """カテゴリ定義を読み込む"""
    if CATEGORIES_FILE.exists():
        with open(CATEGORIES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("categories", [])
    return []


def validate_plugin_name(name: str) -> tuple[bool, str]:
    """プラグイン名のバリデーション"""
    if not name:
        return False, "プラグイン名を入力してください"

    if not re.match(r"^[a-z][a-z0-9-]*$", name):
        return False, "プラグイン名は小文字英字で始まり、小文字英数字とハイフンのみ使用できます"

    if (PLUGINS_DIR / name).exists():
        return False, f"プラグイン '{name}' は既に存在します"

    return True, ""


def to_class_name(plugin_name: str) -> str:
    """プラグイン名をクラス名に変換 (my-awesome-node -> MyAwesomeNode)"""
    return "".join(word.capitalize() for word in plugin_name.split("-"))


def create_manifest(
    name: str,
    display_name: str,
    category: str,
    inputs: list,
    outputs: list,
    color: str,
    bg_color: str,
    icon: str,
) -> dict:
    """manifest.jsonの内容を生成"""
    return {
        "$schema": "https://aituber-flow.dev/schemas/plugin-manifest.json",
        "id": name,
        "name": display_name,
        "version": "1.0.0",
        "description": f"{display_name}プラグイン",
        "author": {
            "name": "AITuberFlow",
            "url": "https://github.com/oboroge0/AITuberFlow"
        },
        "license": "MIT",
        "category": category,
        "ui": {
            "label": display_name,
            "icon": icon,
            "color": color,
            "bgColor": bg_color,
            "statusText": "待機中..."
        },
        "node": {
            "inputs": inputs,
            "outputs": outputs,
            "events": {
                "emits": [],
                "listens": []
            }
        },
        "config": {},
        "dependencies": {
            "python": []
        }
    }


def create_node_py(name: str, display_name: str, inputs: list, outputs: list) -> str:
    """node.pyの内容を生成"""
    class_name = to_class_name(name)

    # 入力の取得コード
    input_code = ""
    if inputs:
        input_code = "\n".join(
            f'        {inp["id"]} = inputs.get("{inp["id"]}", "")'
            for inp in inputs
        )
    else:
        input_code = "        # 入力なし"

    # 出力の返却コード
    if outputs:
        output_code = ",\n".join(
            f'            "{out["id"]}": None  # TODO: 出力値を設定'
            for out in outputs
        )
        return_code = f"return {{\n{output_code}\n        }}"
    else:
        return_code = "return {}"

    return f'''"""
{display_name} プラグイン
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext
from typing import Any, Dict


class {class_name}Node(BaseNode):
    """
    {display_name}ノードの実装
    """

    async def setup(self, config: Dict[str, Any], context: NodeContext) -> None:
        """初期化処理"""
        await context.log("{display_name}を初期化しました")

    async def execute(
        self, inputs: Dict[str, Any], context: NodeContext
    ) -> Dict[str, Any]:
        """メイン処理"""
{input_code}

        # TODO: ここに処理を実装
        await context.log("処理を実行しました")

        {return_code}

    async def teardown(self) -> None:
        """終了処理"""
        pass
'''


def create_readme(name: str, display_name: str, inputs: list, outputs: list) -> str:
    """README.mdの内容を生成"""
    inputs_table = ""
    if inputs:
        inputs_table = "| ポート | 型 | 説明 |\n|--------|-----|------|\n"
        inputs_table += "\n".join(
            f'| {inp["id"]} | {inp["type"]} | {inp.get("description", "")} |'
            for inp in inputs
        )
    else:
        inputs_table = "なし"

    outputs_table = ""
    if outputs:
        outputs_table = "| ポート | 型 | 説明 |\n|--------|-----|------|\n"
        outputs_table += "\n".join(
            f'| {out["id"]} | {out["type"]} | {out.get("description", "")} |'
            for out in outputs
        )
    else:
        outputs_table = "なし"

    return f"""# {display_name}

{display_name}プラグイン

## 入力

{inputs_table}

## 出力

{outputs_table}

## 設定

（設定項目があれば記載）

## 使用例

（使用例を記載）
"""


def prompt_input(prompt: str, default: str = "") -> str:
    """ユーザー入力を取得"""
    if default:
        result = input(f"{prompt} [{default}]: ").strip()
        return result if result else default
    return input(f"{prompt}: ").strip()


def prompt_yes_no(prompt: str, default: bool = True) -> bool:
    """Yes/No入力を取得"""
    suffix = " [Y/n]" if default else " [y/N]"
    result = input(f"{prompt}{suffix}: ").strip().lower()
    if not result:
        return default
    return result in ("y", "yes")


def prompt_ports(port_type: str) -> list:
    """入出力ポートを対話的に追加"""
    ports = []
    print(f"\n{port_type}ポートを追加します（空欄で終了）")

    while True:
        port_id = input(f"  ポート名 (例: text): ").strip()
        if not port_id:
            break

        port_data_type = prompt_input("  型", "string")
        port_desc = prompt_input("  説明", "")

        port = {
            "id": port_id,
            "type": port_data_type,
        }
        if port_desc:
            port["description"] = port_desc

        ports.append(port)
        print(f"  ✓ {port_id} を追加しました\n")

    return ports


def interactive_mode() -> Optional[dict]:
    """対話モードでプラグイン情報を収集"""
    print("\n🚀 AITuberFlow プラグイン作成ウィザード\n")
    print("=" * 50)

    # プラグイン名
    while True:
        name = prompt_input("\n1. プラグイン名 (例: my-awesome-node)")
        valid, error = validate_plugin_name(name)
        if valid:
            break
        print(f"   ❌ {error}")

    # 表示名
    default_display = " ".join(word.capitalize() for word in name.split("-"))
    display_name = prompt_input(f"\n2. 表示名", default_display)

    # カテゴリ
    categories = load_categories()
    print("\n3. カテゴリを選択してください:")
    for i, cat in enumerate(categories, 1):
        print(f"   [{i}] {cat['id']:12} - {cat['label']}")

    while True:
        choice = input("\n   選択 (番号): ").strip()
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(categories):
                category = categories[idx]["id"]
                break
        except ValueError:
            pass
        print("   ❌ 有効な番号を入力してください")

    # 入出力ポート
    inputs = prompt_ports("入力")
    outputs = prompt_ports("出力")

    # 色の設定
    colors = CATEGORY_COLORS.get(category, CATEGORY_COLORS["utility"])
    color = colors["color"]
    bg_color = colors["bgColor"]

    # アイコン
    icon = CATEGORY_ICONS.get(category, "Box")

    return {
        "name": name,
        "display_name": display_name,
        "category": category,
        "inputs": inputs,
        "outputs": outputs,
        "color": color,
        "bg_color": bg_color,
        "icon": icon,
    }


def create_plugin(config: dict) -> Path:
    """プラグインディレクトリとファイルを作成"""
    plugin_dir = PLUGINS_DIR / config["name"]
    plugin_dir.mkdir(parents=True, exist_ok=True)

    # manifest.json
    manifest = create_manifest(
        config["name"],
        config["display_name"],
        config["category"],
        config["inputs"],
        config["outputs"],
        config["color"],
        config["bg_color"],
        config["icon"],
    )
    with open(plugin_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    # node.py
    node_py = create_node_py(
        config["name"],
        config["display_name"],
        config["inputs"],
        config["outputs"],
    )
    with open(plugin_dir / "node.py", "w", encoding="utf-8") as f:
        f.write(node_py)

    # README.md
    readme = create_readme(
        config["name"],
        config["display_name"],
        config["inputs"],
        config["outputs"],
    )
    with open(plugin_dir / "README.md", "w", encoding="utf-8") as f:
        f.write(readme)

    return plugin_dir


def main():
    parser = argparse.ArgumentParser(
        description="AITuberFlow プラグイン作成CLI"
    )
    parser.add_argument("--name", help="プラグイン名 (例: my-node)")
    parser.add_argument("--category", help="カテゴリ (例: utility)")
    parser.add_argument("--display-name", help="表示名")

    args = parser.parse_args()

    # 引数が指定されている場合は非対話モード
    if args.name:
        valid, error = validate_plugin_name(args.name)
        if not valid:
            print(f"❌ {error}")
            sys.exit(1)

        category = args.category or "utility"
        display_name = args.display_name or " ".join(
            word.capitalize() for word in args.name.split("-")
        )

        colors = CATEGORY_COLORS.get(category, CATEGORY_COLORS["utility"])

        config = {
            "name": args.name,
            "display_name": display_name,
            "category": category,
            "inputs": [{"id": "input", "type": "string", "description": "入力"}],
            "outputs": [{"id": "output", "type": "string", "description": "出力"}],
            "color": colors["color"],
            "bg_color": colors["bgColor"],
            "icon": CATEGORY_ICONS.get(category, "Box"),
        }
    else:
        # 対話モード
        config = interactive_mode()
        if not config:
            print("\n❌ キャンセルされました")
            sys.exit(1)

    # プラグイン作成
    plugin_dir = create_plugin(config)

    print("\n" + "=" * 50)
    print(f"✅ プラグインを作成しました: {plugin_dir.relative_to(PROJECT_ROOT)}/")
    print("\n📁 作成されたファイル:")
    print(f"   - manifest.json  (プラグイン設定)")
    print(f"   - node.py        (実装)")
    print(f"   - README.md      (ドキュメント)")
    print("\n📝 次のステップ:")
    print(f"   1. {plugin_dir.relative_to(PROJECT_ROOT)}/node.py を編集して処理を実装")
    print(f"   2. manifest.json で設定項目を追加")
    print(f"   3. エディタを開いて動作確認")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    main()
