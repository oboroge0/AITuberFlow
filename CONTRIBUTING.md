# AITuberFlow への貢献

AITuberFlowへの貢献に興味を持っていただきありがとうございます！このドキュメントでは、貢献のガイドラインと手順を説明します。

[English](CONTRIBUTING.en.md)

## 目次

- [行動規範](#行動規範)
- [はじめに](#はじめに)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [変更の作成](#変更の作成)
- [プルリクエストの手順](#プルリクエストの手順)
- [プラグイン開発](#プラグイン開発)
- [コーディング規約](#コーディング規約)
- [テスト](#テスト)
- [ドキュメント](#ドキュメント)

## 行動規範

このプロジェクトは[行動規範](CODE_OF_CONDUCT.md)に従います。参加することで、この規範を遵守することが期待されます。

## はじめに

### 貢献の種類

以下の種類の貢献を歓迎します：

- **バグ修正** - 既存コードの問題を修正
- **新しいプラグイン** - 機能を拡張する新しいノードの追加
- **ドキュメント** - ドキュメントの改善や翻訳
- **機能強化** - 既存コードへの新機能追加
- **テスト** - テストカバレッジの追加や改善

### Issue

- 新しいIssueを作成する前に既存のIssueを確認してください
- 利用可能な場合はIssueテンプレートを使用してください
- バグの場合は明確な再現手順を提供してください
- 関連する環境情報を含めてください

## 開発環境のセットアップ

### 前提条件

- Node.js 22以上
- Python 3.11以上
- Git

### 開発環境の構築

#### 最も簡単な方法: GitHub Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/oboroge0/AITuberFlow)

ワンクリックで開発環境を構築できます。

#### ローカル環境

1. **リポジトリをフォークしてクローン**

```bash
git clone https://github.com/YOUR_USERNAME/AITuberFlow.git
cd AITuberFlow
```

2. **バックエンドのセットアップ**

```bash
cd apps/server

# uvを使用（推奨）
uv sync
uv pip install -e ../../packages/sdk

# またはpipを使用
python -m venv .venv
source .venv/bin/activate  # Windowsの場合: .venv\Scripts\activate
pip install -r requirements.txt
pip install -e ../../packages/sdk

# 環境設定をコピー
cp .env.example .env
```

3. **フロントエンドのセットアップ**

```bash
cd apps/web
npm install
cp .env.example .env.local
```

4. **開発サーバーを起動**

```bash
# ターミナル1: バックエンド
cd apps/server
uv run python main.py  # またはvenvを有効化してpython main.py

# ターミナル2: フロントエンド
cd apps/web
npm run dev
```

## 変更の作成

### ブランチ命名規則

わかりやすいブランチ名を使用してください：

- `feature/twitter連携追加` - 新機能
- `fix/音声再生問題` - バグ修正
- `docs/readme更新` - ドキュメント変更
- `plugin/画像生成` - 新しいプラグイン

### コミットメッセージ

明確で簡潔なコミットメッセージを日本語で書いてください：

```
type: 簡潔な説明

必要に応じて詳細な説明。
「何を」だけでなく「なぜ」を説明。
```

タイプ：
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `plugin`: 新規または更新されたプラグイン
- `refactor`: コードリファクタリング
- `test`: テストの追加や更新
- `chore`: メンテナンスタスク

例：
```
feat: Discord チャット連携ノードを追加

fix: Safari での音声再生タイミング問題を解決

docs: プラグイン開発ガイドを更新
```

## プルリクエストの手順

1. **変更の準備が整っていることを確認**
   - コードがプロジェクトのコーディング規約に従っている
   - ローカルでテストが通過する
   - 必要に応じてドキュメントが更新されている

2. **プルリクエストを作成**
   - 明確でわかりやすいタイトルを使用
   - 関連するIssueを参照（`Fixes #123`）
   - 変更の概要を提供
   - UI変更の場合はスクリーンショットを含める

3. **PRレビュー**
   - メンテナーがPRをレビューします
   - 要求された変更に対応してください
   - 忍耐強く、レスポンシブに

4. **マージ**
   - 承認後にPRがマージされます
   - クリーンな履歴のためにスカッシュマージが推奨されます

## プラグイン開発

### 新しいプラグインの作成

1. `plugins/`に新しいディレクトリを作成：

```
plugins/my-plugin/
├── manifest.json
└── node.py
```

2. マニフェストを定義（`manifest.json`）：

```json
{
  "id": "my-plugin",
  "name": "マイプラグイン",
  "version": "1.0.0",
  "description": "プラグインの説明",
  "category": "utility",
  "inputs": [
    {
      "id": "text",
      "name": "テキスト入力",
      "type": "string"
    }
  ],
  "outputs": [
    {
      "id": "result",
      "name": "結果",
      "type": "string"
    }
  ],
  "config": [
    {
      "id": "setting",
      "name": "設定",
      "type": "string",
      "default": "デフォルト値"
    }
  ]
}
```

3. ノードを実装（`node.py`）：

```python
from aituber_flow_sdk import BaseNode, NodeContext

class MyPluginNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        self.setting = config.get("setting", "default")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        text = inputs.get("text", "")
        result = f"処理結果: {text}"
        return {"result": result}

    async def teardown(self) -> None:
        pass
```

4. フロントエンドに登録（`Sidebar.tsx`と`Canvas.tsx`を更新）

### プラグインガイドライン

- 1つのプラグインに1つの責任
- エラーを適切に処理
- 意味のあるログメッセージを出力
- `teardown()`でリソースをクリーンアップ
- 設定オプションをドキュメント化

## コーディング規約

### Python（バックエンド & プラグイン）

- PEP 8スタイルガイドラインに従う
- 可能な限り型ヒントを使用
- I/O操作にはasync/awaitを使用
- パブリック関数にはdocstringでドキュメント化

```python
async def process_message(text: str, config: dict) -> dict:
    """
    受信メッセージを処理する。

    Args:
        text: 処理する入力テキスト
        config: 設定辞書

    Returns:
        処理結果を含む辞書
    """
    pass
```

### TypeScript（フロントエンド）

- TypeScript strictモードを使用
- データ構造にインターフェースを定義
- 意味のある変数名を使用
- Reactのベストプラクティスに従う

```typescript
interface NodeConfig {
  id: string;
  type: string;
  position: { x: number; y: number };
}

const processNode = (config: NodeConfig): void => {
  // 実装
};
```

## テスト

### テストの実行

```bash
# バックエンドテスト
cd apps/server
uv run pytest -v

# フロントエンドテスト（利用可能な場合）
cd apps/web
npm test
```

### テストの書き方

- エッジケースとエラー条件をテスト
- わかりやすいテスト名を使用
- 外部サービスをモック

```python
@pytest.mark.asyncio
async def test_node_handles_empty_input():
    node = MyPluginNode()
    result = await node.execute({"text": ""}, mock_context)
    assert result["result"] == "処理結果: "
```

## ドキュメント

### ドキュメントを更新するタイミング

- 新機能の追加時
- 既存の動作の変更時
- 新しいプラグインの追加時
- APIエンドポイントの変更時

### ドキュメントの場所

| ファイル | 日本語 | 英語 |
|---------|-------|------|
| README | `README.md` | `README.en.md` |
| はじめに | `docs/getting-started.ja.md` | `docs/getting-started.md` |
| アーキテクチャ | `docs/architecture.ja.md` | `docs/architecture.md` |
| APIリファレンス | `docs/api-reference.ja.md` | `docs/api-reference.md` |
| SDK | `packages/sdk/README.md` | - |

---

## 質問がありますか？

貢献について質問がある場合：

1. 既存のドキュメントを確認
2. クローズされたIssueを検索
3. 「question」ラベルを付けて新しいIssueを開く

AITuberFlowへの貢献ありがとうございます！
