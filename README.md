<p align="center">
  <img src="docs/images/logo.png" alt="AITuberFlow" width="600">
</p>

<p align="center">
  <strong>ノーコードでAITuberを作成できるビジュアルワークフローエディタ</strong>
</p>

<p align="center">
  <a href="https://github.com/oboroge0/AITuberFlow/releases/latest"><img src="https://img.shields.io/badge/%E3%83%80%E3%82%A6%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%89-Latest%20Release-ff6b6b?style=for-the-badge&logo=github" alt="Download"></a>
  <a href="https://codespaces.new/oboroge0/AITuberFlow"><img src="https://img.shields.io/badge/%E3%81%99%E3%81%90%E4%BD%BF%E3%81%86-Codespaces-24292e?style=for-the-badge&logo=github" alt="Open in Codespaces"></a>
</p>

<p align="center">
  <a href="https://github.com/oboroge0/AITuberFlow/actions/workflows/ci.yml"><img src="https://github.com/oboroge0/AITuberFlow/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <a href="https://github.com/oboroge0/AITuberFlow"><img src="https://img.shields.io/github/stars/oboroge0/AITuberFlow?style=social" alt="GitHub stars"></a>
  <a href="https://github.com/oboroge0/AITuberFlow/issues"><img src="https://img.shields.io/github/issues/oboroge0/AITuberFlow" alt="GitHub issues"></a>
</p>

<p align="center">
  <a href="README.en.md">English</a>
</p>

---

## 概要

AITuberFlowは、AIを活用したバーチャル配信者（AITuber）のパイプラインを視覚的に構築できるツールです。ノードをドラッグ＆ドロップで配置し、接続するだけで、コードを書かずにAIキャラクターを作成できます。

### 主な特徴

- **デスクトップアプリ** - macOS / Windows 対応のネイティブアプリ（Tauri v2）
- **ビジュアルエディタ** - 直感的なドラッグ＆ドロップ操作
- **プラグインシステム** - 機能を自由に拡張可能
- **リアルタイム実行** - ネイティブWebSocketによるライブログ表示
- **複数LLM対応** - OpenAI, Anthropic Claude, Google Gemini, Ollama
- **複数TTS対応** - VOICEVOX, COEIROINK, Style-Bert-VITS2
- **制御フロー** - Start, End, Loop, ForEach, Switchノードで複雑なフローを構築
- **アバター対応** - VRMモデル表示、リップシンク、表情制御
- **OBS連携** - シーン切り替え、ソース制御
- **配信オーバーレイ** - OBS Browser Source対応のオーバーレイ
- **デモモード** - APIキー不要でワークフロー動作確認が可能
- **ワークフロー共有** - インポート/エクスポート機能（APIキー自動除外）
- **GitHub Codespaces対応** - ブラウザからワンクリックで開発環境構築

---

## 🚧 開発状況

> **⚡ 急ピッチで開発中！**
>
> 「みんなに早く使ってほしい！」という想いで爆速開発しています。
> 粗削りな部分もありますが、日々改善中です。
>
> - 🐛 バグを見つけたら → [Issue](https://github.com/oboroge0/AITuberFlow/issues)へ
> - 💡 こんな機能ほしい！→ [Discussions](https://github.com/oboroge0/AITuberFlow/discussions)へ
> - 💬 お問い合わせ → [X DM (@oboroge9)](https://x.com/oboroge9)へ
> - ⭐ 応援してくれる方 → Starお願いします！

---

## スクリーンショット

![ワークフローエディタ](docs/images/image.png)
*ノードを接続してワークフローを構築*

---

## 技術スタック

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.x-f9f1e1?style=for-the-badge&logo=bun&logoColor=black" alt="Bun">
  <img src="https://img.shields.io/badge/Hono-4-E36002?style=for-the-badge&logo=hono&logoColor=white" alt="Hono">
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Drizzle_ORM-0.38-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Drizzle ORM">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Three.js-r170-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
</p>

---

## クイックスタート

### GitHub Codespaces で始める（最も簡単）

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/oboroge0/AITuberFlow)

ブラウザ上でワンクリックで開発環境を構築できます。ローカル環境のセットアップ不要！

### デスクトップアプリで始める

[GitHub Releases](https://github.com/oboroge0/AITuberFlow/releases/latest) からインストーラーをダウンロードして実行するだけ！

- **macOS**: DMG ファイル（Apple Silicon / Intel 対応）
- **Windows**: NSIS インストーラー

起動すると自動的にサーバーが立ち上がり、エディタが表示されます。

### 必要な環境（ローカル開発）

- **Node.js** 22以上
- **[Bun](https://bun.sh/)** 1.0以上
- **VOICEVOX** （音声合成を使用する場合）

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/oboroge0/AITuberFlow.git
cd AITuberFlow

# 依存関係をインストール
npm install && npm run setup

# 開発サーバーを起動（フロントエンド + バックエンド同時起動）
npm run dev
```

これで `http://localhost:3000` でエディタが開きます。

### 個別に起動する場合

```bash
# フロントエンドのみ
npm run dev:web

# バックエンドのみ
npm run dev:api
```

### Docker で起動する場合

```bash
# Docker Compose で一発起動
docker compose up --build

# バックグラウンドで起動
docker compose up -d

# 停止
docker compose down
```

Docker環境では:
- フロントエンド: `http://localhost:3000`
- バックエンド: `http://localhost:8001`

---

## 機能

### 制御フローノード
| ノード | 説明 |
|--------|------|
| **Start** | ワークフローの開始点 |
| **End** | ワークフローの終了点 |
| **Loop** | 指定回数の繰り返し処理 |
| **ForEach** | リスト内の各アイテムに対して処理 |
| **Switch** | 条件分岐 |
| **Delay** | 遅延処理 |

### 入力ノード
| ノード | 説明 |
|--------|------|
| **Manual Input** | テキストを手動入力 |
| **YouTube Chat** | YouTubeライブのチャットを取得 |
| **Twitch Chat** | Twitchチャットを取得 |
| **Discord Chat** | Discordチャンネルのメッセージを取得 |
| **Timer** | 定期的にトリガーを発火 |

### LLMノード
| ノード | 説明 |
|--------|------|
| **ChatGPT** | OpenAI GPTモデル (GPT-4o, GPT-5等) |
| **Claude** | Anthropic Claudeモデル |
| **Gemini** | Google Geminiモデル |
| **Ollama** | ローカルLLM (Ollama経由) |

### TTSノード（音声合成）
| ノード | 説明 |
|--------|------|
| **VOICEVOX** | 無料の日本語音声合成 |
| **COEIROINK** | 高品質な日本語音声合成 |
| **Style-Bert-VITS2** | 感情豊かな音声合成 |

### アバターノード
| ノード | 説明 |
|--------|------|
| **Avatar Configuration** | VRMモデルと設定を構成 |
| **Motion Trigger** | アバターのアニメーションをトリガー |
| **Lip Sync** | 音声に合わせた口の動き |
| **Emotion Analyzer** | テキストから感情を分析して表情を設定 |

### ユーティリティノード
| ノード | 説明 |
|--------|------|
| **HTTP Request** | 外部APIを呼び出し |
| **Text Transform** | テキストを加工（大文字/小文字/トリム等） |
| **Random** | ランダムな数値や選択を生成 |
| **Variable** | 変数の保存と取得 |
| **Data Formatter** | データの整形と変換 |

### 出力ノード
| ノード | 説明 |
|--------|------|
| **Console Output** | ログに出力 |
| **Audio Player** | 合成した音声を再生 |
| **Subtitle Display** | オーバーレイに字幕を表示 |

### OBS連携ノード
| ノード | 説明 |
|--------|------|
| **OBS Scene Switch** | OBSのシーンを切り替え |
| **OBS Source Toggle** | OBSのソースを表示/非表示 |

> **注意:** OBS連携にはOBSのWebSocketサーバーを有効にする必要があります。

---

## 使い方

### 基本的な流れ

1. ブラウザで `http://localhost:3000` を開く
2. 「New Workflow」をクリックして新しいワークフローを作成
3. サイドバーからノードをキャンバスにドラッグ
4. ノード間を接続（出力ポートから入力ポートへドラッグ）
5. ノードをクリックして設定を変更
6. 「Run Workflow」で実行

### エディタの機能

| 操作 | 説明 |
|------|------|
| **ドラッグ＆ドロップ** | サイドバーからノードを追加 |
| **接続線のドラッグ** | 接続線の端をドラッグして別のノードに繋ぎ替え |
| **右クリック** | コンテキストメニューを表示 |
| **Ctrl+Z** | 元に戻す（Undo） |
| **Ctrl+Y** | やり直し（Redo） |
| **Ctrl+C/V** | コピー＆ペースト |
| **Ctrl+S** | ワークフローを保存 |
| **Delete** | 選択したノードを削除 |

### デモモード

外部サービス（LLM API、TTS）なしでワークフローの動作を確認できます。

- **LLMノード**: APIキー未設定時、自動的に定型文応答を返します
- **TTSノード**: 設定パネルで「Demo Mode」を有効にすると、TTS未接続時にスキップして継続

### ワークフローの共有（インポート/エクスポート）

サイドバーのボタンからワークフローをJSONファイルとして保存・共有できます。

- **エクスポート**: APIキーは自動的に除外されます（セキュリティ対策）
- **インポート**: 新規ワークフローとして作成され、自動的に開きます

### Startノードについて

- **Startノード**を配置すると、そこから接続されたノードのみが実行されます
- Startノードに接続されていないノードは点線で表示され、実行されません
- Startノードがない場合は、すべてのノードが実行されます（後方互換性）

### サンプルワークフロー：AIチャットボット

```
[Manual Input] → [LLM] → [TTS] → [Audio Player]
```

1. **Manual Input**: テキストを入力
2. **LLM**: OpenAI APIキーとシステムプロンプトを設定
3. **TTS**: VOICEVOXのスピーカーを選択
4. **Audio Player**: 合成した音声を再生

実行すると、入力テキストに対してAIが応答し、音声で読み上げます。

### 配信オーバーレイ

OBS対応のオーバーレイは以下のURLでアクセスできます：
```
http://localhost:3000/overlay/{workflow-id}
```

OBSのブラウザソースとして透過背景で設定できます。

---

## プロジェクト構成

```
AITuberFlow/
├── apps/
│   ├── web/             # Next.js フロントエンド
│   ├── server-ts/       # Bun + Hono バックエンド
│   └── desktop/         # Tauri v2 デスクトップアプリ
├── packages/
│   └── sdk-ts/          # TypeScript プラグインSDK
├── plugins/             # 公式プラグイン（32+）
├── templates/           # ワークフローテンプレート
└── docs/                # ドキュメント
```

---

## 詳細なセットアップ

### バックエンド

```bash
cd apps/server-ts

# 依存関係をインストール
bun install

# サーバーを起動
bun run dev
```

バックエンドは `http://localhost:8001` で起動します。

### フロントエンド

```bash
cd apps/web

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

フロントエンドは `http://localhost:3000` で起動します。

### VOICEVOX（オプション）

音声合成を使用する場合は、[VOICEVOX](https://voicevox.hiroshiba.jp/)をインストールして起動してください。

デフォルトでは `http://localhost:50021` に接続します。

---

## プラグイン開発

独自のノードを作成できます。

```typescript
import { BaseNode, NodeContext } from "@aituber-flow/sdk";

class MyCustomNode extends BaseNode {
  async setup(config: Record<string, unknown>, context: NodeContext): Promise<void> {
    // 初期化処理
  }

  async execute(inputs: Record<string, unknown>, context: NodeContext): Promise<Record<string, unknown>> {
    const inputText = (inputs.text as string) || "";

    // ログを出力
    await context.log(`処理中: ${inputText}`);

    // 結果を返す
    return { output: `処理結果: ${inputText}` };
  }

  async teardown(): Promise<void> {
    // 終了処理
  }
}
```

詳細は [CLAUDE.md](CLAUDE.md) の「Node Development」セクションを参照してください。

---

## API ドキュメント

詳細なAPIリファレンスは [docs/api-reference.ja.md](docs/api-reference.ja.md) を参照してください。

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

- サーバーが起動しているか確認
  - ローカル開発時: `http://localhost:8001/health`
  - Docker使用時: `http://localhost:8001/health`
- ファイアウォールの設定を確認

### VOICEVOXに接続できない

- VOICEVOXが起動しているか確認
- TTSノードのホスト設定を確認（デフォルト: `http://localhost:50021`）

### 音声が再生されない

- ブラウザの自動再生ポリシーにより、最初の再生がブロックされる場合があります
- ページをクリックしてからワークフローを実行してください

### OBSノードが動作しない

- OBSでWebSocketサーバーを有効にする（ツール → WebSocketサーバー設定）
- ホスト、ポート、パスワードの設定を確認

---

## コントリビューション

プルリクエストを歓迎します！詳細は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

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
- [Hono](https://hono.dev/) - 軽量Webフレームワーク
- [Bun](https://bun.sh/) - 高速JavaScriptランタイム
- [Tauri](https://tauri.app/) - デスクトップアプリフレームワーク
- [VOICEVOX](https://voicevox.hiroshiba.jp/) - 無料の音声合成エンジン
- [Next.js](https://nextjs.org/) - React フレームワーク
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) - VRMモデルレンダリング

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=oboroge0/AITuberFlow&type=Date)](https://star-history.com/#oboroge0/AITuberFlow&Date)
