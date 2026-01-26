# 変更履歴

このプロジェクトの主な変更点はこのファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づいており、
[セマンティックバージョニング](https://semver.org/lang/ja/) に準拠しています。

## [1.1.2] - 2026-01-27

### 改善

#### README刷新
- **ロゴ追加** - プロジェクトロゴを中央配置で表示
- **ダウンロードボタン** - Latest Releaseへの目立つリンクを追加
- **すぐ使うボタン** - GitHub Codespacesへのワンクリックリンク
- **技術スタックセクション** - 使用技術をバッジでビジュアル化
  - フロントエンド: Next.js, React, TypeScript, Tailwind CSS
  - バックエンド: FastAPI, Python, SQLite, Socket.IO
  - その他: Three.js, Docker

---

## [1.1.1] - 2026-01-27

### 修正

- **ズームコントロール位置** - 左サイドバーと重ならないように位置を修正
- **TypeScriptビルドエラー** - ワークフローインポート機能の型エラーを修正

### 改善

#### ドキュメント整理
- **日本語を基準に整理** - 全ドキュメントで日本語版を基準ファイルに変更
  - `CONTRIBUTING.md` (日本語) / `CONTRIBUTING.en.md` (英語)
  - `CODE_OF_CONDUCT.md` (日本語) / `CODE_OF_CONDUCT.en.md` (英語)
  - `SECURITY.md` (日本語) / `SECURITY.en.md` (英語)
- **v1.1.0機能のドキュメント化** - README、はじめにガイドを更新
  - GitHub Codespaces セクション追加
  - デモモードの説明追加
  - インポート/エクスポート機能の説明追加
- **古い情報の更新**
  - Node.js バージョン要件: 18 → 22
  - サポートバージョン: 0.1.x → 1.x
- **スクリーンショット更新**

---

## [1.1.0] - 2026-01-27

### 追加

#### 開発環境
- **devcontainer対応** - GitHub Codespaces / VS Code Dev Containersでワンクリック開発環境構築
  - Python 3.11 + Node.js 20 自動セットアップ
  - uv, bun パッケージマネージャー自動インストール
  - 推奨VS Code拡張機能の自動インストール

#### デモモード
- **LLM自動デモモード** - APIキー未設定時に自動で定型文応答を返す
  - OpenAI, Anthropic, Google, Ollama 全LLMノード対応
  - 外部サービスなしでワークフローの動作確認が可能
- **TTSデモモード** - 設定パネルからDemo Modeを有効化可能
  - VOICEVOX, COEIROINK, Style-Bert-VITS2 対応
  - TTS未接続時にスキップしてワークフロー継続

#### ワークフロー管理
- **インポート/エクスポート機能** - ワークフローをJSONファイルとして保存・共有
  - エクスポート時にAPIキーを自動除外（セキュリティ対策）
  - インポート時に新規ワークフローとして作成、自動で開く

### 改善

#### エラーメッセージ
- **多言語エラーメッセージ** - 日本語/英語で対処法付きエラー表示
  - TTS接続エラー、LLM APIキー未設定など主要エラーに対応
  - `packages/sdk/aituber_flow_sdk/errors.py` にエラーコード集約

---

## [1.0.0] - 2026-01-26

### 追加

#### コア機能
- **ビジュアルワークフローエディタ** - ドラッグ&ドロップでノードベースのワークフロー構築
- **リアルタイム実行** - WebSocket通信によるライブワークフロー実行とログ表示
- **プラグインシステム** - 拡張可能なノードアーキテクチャ（32以上の公式プラグイン）
- **ワークフローテンプレート** - 一般的なユースケース向けのプリセット
- **多言語対応** - 日本語・英語UI

#### ノードカテゴリ
- **制御フロー**: Start, End, Loop, ForEach, Switch, Delay
- **入力**: Manual Input, YouTube Chat, Twitch Chat, Discord Chat, Timer
- **LLM**: OpenAI GPT, Anthropic Claude, Google Gemini, Ollama
- **TTS**: VOICEVOX, COEIROINK, Style-Bert-VITS2
- **アバター**: Avatar Configuration, Motion Trigger, Lip Sync, Emotion Analyzer
- **出力**: Console Output, Audio Player, Subtitle Display
- **OBS連携**: Scene Switch, Source Toggle
- **ユーティリティ**: HTTP Request, Text Transform, Random, Variable, Data Formatter

#### アバターシステム
- VRMモデルの読み込みとレンダリング
- 表情制御（happy, sad, angry, surprised, neutral）
- 音声に同期したリアルタイムリップシンク
- アニメーション対応（Mixamo FBX）
- 2Dアバター向けPNG表情マッピング

#### 配信機能
- OBS互換の透過オーバーレイ（`/overlay/{workflow-id}`）
- カスタマイズ可能なパラメータ付きブラウザソース
- リアルタイム字幕表示
- 音声再生同期

#### インフラ
- **Docker対応** - バックエンド・フロントエンド用マルチステージDockerfile
- **Docker Compose** - フルスタックデプロイ設定
- **CI/CDパイプライン** - GitHub Actionsによるlint、型チェック、テスト
- **テストスイート** - コアモジュールをカバーする91のユニットテスト

#### ドキュメント
- Mermaid図付きアーキテクチャドキュメント
- 包括的なAPIリファレンス（REST + WebSocket）
- Docker手順付きの入門ガイド
- プラグイン開発ガイド

### 技術詳細

#### バックエンド（FastAPI + Python 3.11）
- 非同期ワークフロー実行エンジン
- EventBusによるイベント駆動アーキテクチャ
- Socket.IOによるリアルタイム通信
- SQLAlchemy ORMによるSQLiteデータベース
- `plugins/`ディレクトリからのプラグインホットローディング

#### フロントエンド（Next.js 16 + React 18）
- @xyflow/reactによるノードエディタ
- Zustandによる状態管理
- Three.js + @pixiv/three-vrmによる3Dアバターレンダリング
- Tailwind CSSによるスタイリング
- 全体をTypeScriptで記述

#### SDK
- プラグイン開発用 `aituber_flow_sdk` Pythonパッケージ
- ライフサイクルメソッド付きBaseNodeクラス（setup, execute, on_event, teardown）
- ログ出力とイベント発行用NodeContext

---

## [0.1.0] - 2026-01-19

### 追加
- 初期開発リリース
- 基本的なワークフローエディタ機能
- コアプラグインの実装

[1.1.2]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.1.2
[1.1.1]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.1.1
[1.1.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.1.0
[1.0.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.0.0
[0.1.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v0.1.0
