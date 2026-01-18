# AITuberFlow

**ノーコードでAITuberを作成できるビジュアルワークフローエディタ**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)

---

## 概要

AITuberFlowは、AIを活用したバーチャル配信者（AITuber）のパイプラインを視覚的に構築できるツールです。ノードをドラッグ＆ドロップで配置し、接続するだけで、コードを書かずにAIキャラクターを作成できます。

### 主な特徴

- **ビジュアルエディタ** - 直感的なドラッグ＆ドロップ操作
- **プラグインシステム** - 機能を自由に拡張可能
- **リアルタイム実行** - WebSocketによるライブログ表示
- **VOICEVOX連携** - 日本語音声合成に対応

---

## スクリーンショット

![ワークフローエディタ](docs/images/editor-screenshot.png)
*ノードを接続してワークフローを構築*

---

## 機能

### 入力ノード
| ノード | 説明 |
|--------|------|
| **Manual Input** | テキストを手動入力 |
| **YouTube Chat** | YouTubeライブのチャットを取得 |
| **Twitch Chat** | Twitchチャットを取得 |

### 処理ノード
| ノード | 説明 |
|--------|------|
| **LLM (OpenAI)** | GPTモデルでテキスト生成 |
| **Switch** | 条件分岐 |
| **Delay** | 遅延処理 |

### 出力ノード
| ノード | 説明 |
|--------|------|
| **TTS (VOICEVOX)** | テキストを音声に変換 |
| **Console Output** | ログに出力 |

---

## セットアップ

### 必要な環境

- **Node.js** 18以上
- **Python** 3.11以上
- **VOICEVOX** （音声合成を使用する場合）

### 1. バックエンドのセットアップ

```bash
cd apps/server

# 仮想環境を作成
python -m venv .venv

# 仮想環境を有効化
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 依存関係をインストール
pip install -r requirements.txt

# 環境設定ファイルをコピー
cp .env.example .env

# サーバーを起動
python main.py
```

バックエンドは `http://localhost:8001` で起動します。

### 2. フロントエンドのセットアップ

```bash
cd apps/web

# 依存関係をインストール
npm install

# 環境設定ファイルをコピー
cp .env.example .env.local

# 開発サーバーを起動
npm run dev
```

フロントエンドは `http://localhost:3000` で起動します。

### 3. VOICEVOX（オプション）

音声合成を使用する場合は、[VOICEVOX](https://voicevox.hiroshiba.jp/)をインストールして起動してください。

デフォルトでは `http://localhost:50021` に接続します。

---

## 使い方

### 基本的な流れ

1. ブラウザで `http://localhost:3000` を開く
2. 「New Workflow」をクリックして新しいワークフローを作成
3. サイドバーからノードをキャンバスにドラッグ
4. ノード間を接続（出力ポートから入力ポートへドラッグ）
5. ノードをクリックして設定を変更
6. 「Run Workflow」で実行

### サンプルワークフロー：AIチャットボット

```
[Manual Input] → [LLM] → [TTS] → [Console Output]
```

1. **Manual Input**: テキストを入力
2. **LLM**: OpenAI APIキーとシステムプロンプトを設定
3. **TTS**: VOICEVOXのスピーカーを選択
4. **Console Output**: 結果を確認

実行すると、入力テキストに対してAIが応答し、音声で読み上げます。

---

## プロジェクト構成

```
AITuberFlow/
├── apps/
│   ├── web/           # Next.js フロントエンド
│   └── server/        # FastAPI バックエンド
├── packages/
│   └── sdk/           # プラグインSDK
├── plugins/           # 公式プラグイン
│   ├── manual-input/
│   ├── openai-llm/
│   ├── voicevox-tts/
│   ├── console-output/
│   ├── youtube-chat/
│   ├── twitch-chat/
│   ├── switch/
│   └── delay/
├── templates/         # ワークフローテンプレート
└── docs/              # ドキュメント
```

---

## プラグイン開発

独自のノードを作成できます。

```python
from aituber_flow_sdk import BaseNode, NodeContext, Event

class MyCustomNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        """初期化処理"""
        self.my_setting = config.get("mySetting", "default")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """メイン処理"""
        input_text = inputs.get("text", "")

        # ログを出力
        await context.log(f"処理中: {input_text}")

        # 結果を返す
        return {"output": f"処理結果: {input_text}"}

    async def teardown(self) -> None:
        """終了処理"""
        pass
```

詳細は `packages/sdk/README.md` を参照してください。

---

## API ドキュメント

バックエンド起動後、`http://localhost:8001/docs` でSwagger UIを確認できます。

### 主要なエンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/workflows` | ワークフロー一覧 |
| POST | `/api/workflows` | ワークフロー作成 |
| GET | `/api/workflows/{id}` | ワークフロー取得 |
| PUT | `/api/workflows/{id}` | ワークフロー更新 |
| DELETE | `/api/workflows/{id}` | ワークフロー削除 |
| POST | `/api/workflows/{id}/start` | ワークフロー実行 |
| POST | `/api/workflows/{id}/stop` | ワークフロー停止 |

---

## トラブルシューティング

### バックエンドに接続できない

- サーバーが起動しているか確認（`http://localhost:8001/health`）
- ファイアウォールの設定を確認

### VOICEVOXに接続できない

- VOICEVOXが起動しているか確認
- TTSノードのホスト設定を確認（デフォルト: `http://localhost:50021`）

### 音声が再生されない

- ブラウザの自動再生ポリシーにより、最初の再生がブロックされる場合があります
- ページをクリックしてからワークフローを実行してください

---

## 今後の予定

- [ ] より多くのLLMプロバイダー対応（Claude, Gemini等）
- [ ] 画像生成ノード
- [ ] OBS連携
- [ ] キャラクター状態管理（感情、記憶）
- [ ] ワークフローのインポート/エクスポート

---

## コントリビューション

プルリクエストを歓迎します！

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチをプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

---

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

---

## 謝辞

- [React Flow](https://reactflow.dev/) - ノードエディタライブラリ
- [VOICEVOX](https://voicevox.hiroshiba.jp/) - 無料の音声合成エンジン
- [FastAPI](https://fastapi.tiangolo.com/) - Python Webフレームワーク
- [Next.js](https://nextjs.org/) - React フレームワーク
