# 変更履歴

このプロジェクトの主な変更点はこのファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づいており、
[セマンティックバージョニング](https://semver.org/lang/ja/) に準拠しています。

## [2.3.0] - 2026-03-01

### 追加

- **ワークフロー実行前バリデーション** - 実行ボタン押下時にワークフローを自動検証し、エラーがあれば実行をブロック (#108)
  - 必須設定フィールドの未入力チェック
  - 未接続の入力ポート検出
  - エントリーポイントから到達不能なノードの検出
  - 循環参照の検出
  - APIキー未設定の警告（グローバル設定のフォールバック考慮）
  - エラー/警告のあるノードをエディタ上でハイライト表示

## [2.2.4] - 2026-02-22

### 追加

- **ノード検索機能（Ctrl+F）** - キャンバス上でノードを名前やタイプで検索し、マッチにナビゲーション。マッチノードはハイライト表示、非マッチは半透明に (#109)
- **ノードの折りたたみ/展開** - シェブロンボタンまたはダブルクリックでノードをコンパクト表示に。接続は維持され、状態はブラウザに保存 (#112)

### 改善

- **LLMプラグインのエラーハンドリング統一** - OpenAI・Anthropic・Google・Ollamaの4プラグインで共通のエラー分類（接続/レート制限/認証/API）とローカライズされたメッセージを使用 (#106)
- Anthropic LLMノードのクライアント初期化をsetup()に移動し、execute()毎の再作成を排除

## [2.2.3] - 2026-02-22

### 修正

- ワークフロー開始/停止にロック機構を追加し、同時起動の競合を防止 (#98)
- WebSocketブロードキャスト中のクライアントSet変更による未定義動作を修正 (#99)
- WebSocketメッセージにサイズ制限（1MB）を追加し、DoS攻撃を防止 (#100)
- APIルートで不正JSONリクエスト時に400エラーを返すように修正 (#101)
- ワークフローリスタート時のコールバック消失を修正（イベント転送が停止する問題）

### 改善

- ワークフロー一覧のソートをDB側のORDER BYに移行 (#114)
- 到達可能ノード計算をZustandストアに移動し、ズーム/パン時の不要な再計算を排除 (#113)

## [2.2.2] - 2026-02-21

### 追加

- **グローバル設定** - APIキー・モデル設定を一度設定すれば全ワークフローで共有可能に。ホーム画面の歯車アイコンから設定 (#77)
  - LLMプロバイダー（OpenAI, Anthropic, Google, Ollama）のAPIキー・モデル
  - 音声合成エンジン（VOICEVOX, COEIROINK, SBV2）のホスト
- ノード設定パネルでグローバル対象フィールドを折りたたみ表示（個別上書き可能）

### 修正

- Tauri デスクトップ版でサイドバーからのノードドラッグ＆ドロップが動作しない問題を修正

## [2.2.1] - 2026-02-20

### 追加

- フッターにアプリバージョンを表示

## [2.2.0] - 2026-02-20

### 追加

- **デスクトップ自動アップデーター** - 起動時に新バージョンをチェックし、モーダルからダウンロード・インストール・再起動が可能に (#94)
- **お知らせシステム** - GitHub リポジトリの `announcements.json` から開発者のお知らせをバナー表示。critical/warning/info の3段階、多言語対応、バージョン指定表示に対応
- `tauri-plugin-process` を追加（再起動機能用）
- `updater:default` / `process:allow-restart` capabilities を追加

## [2.1.0] - 2026-02-19

### 改善

- **プラグイン設定の動的レンダリング** - `manifest.json` の `config` セクションからノード設定UIを自動生成するよう変更。新規プラグイン追加時にフロントエンドのコード変更が不要に (#93)
- `configUtils.ts` を新規追加: manifest config → NodeField 変換、showWhen 条件評価ユーティリティ
- `nodeOutputFields.ts` を新規追加: FieldSelectorNode / DataPreviewPopup で共有するフォールバック定数
- `ConfigField` / `NodeField` / `ShowWhenCondition` 型を拡張（min, max, required, defaultValue, operator 等）
- Canvas.tsx の動的ポート生成を manifest config field 型（prompt-builder, input-list）で汎用化
- openai-llm, text-transform, avatar-configuration, motion-trigger, voicevox-tts, http-request の manifest.json を更新

## [2.0.3] - 2026-02-19

### 改善

- **型安全性の強化** - バックエンド全体で `any` 型を `unknown` / `Record<string, unknown>` に置換し、型安全性を向上 (#85)
- **WAV 音声ユーティリティを SDK に共通化** - VOICEVOX / COEIROINK / Style-Bert-VITS2 の3つの TTS プラグインで重複していた `getWavDuration` 関数を `@aituber-flow/sdk` に統合 (#67)
- **エディタの実行状態同期** - エディタ起動時にサーバーからワークフロー実行状態を取得し、再生ボタンの状態を正しく反映 (#68)
- **LLM プラグインのモデル一覧を更新** - OpenAI (GPT-5 / GPT-4.1 / Codex / o3 / o4-mini)、Anthropic (Claude 4)、Google (Gemini 3 / 2.5) の最新モデルを追加 (#79)
- OpenAI プラグインで o3 / o3-mini / o4-mini の reasoning_effort 設定をサポート
- OpenAI API キーの設定タイプを `password` に変更（マスク表示）
- Anthropic プラグインの説明を Claude 4 対応に更新
- NodeSettings の数値入力で空欄時に NaN が送信されるバグを修正

### テスト

- **SDK テストカバレッジを大幅拡充** - audio-utils / errors / context / types の4モジュールに対するテストを新規追加（テスト数 67 → 135、+68） (#69)

## [2.0.2] - 2026-02-16

### 改善

- **Emotion Analyzer の LLM モデル選択をプルダウンに変更** - テキスト入力からドロップダウンに改善し、LLM プロバイダーに応じたモデル一覧を動的に表示 (#80)
- LLM モデルリストを共通定数に統合し、各 LLM ノードと Emotion Analyzer 間の二重管理を解消

### 修正

- Emotion Analyzer で LLM プロバイダー変更時にモデル選択がリセットされないバグを修正

### 削除

- **Python レガシーコードを完全削除** - Python バックエンド (`apps/server/`)、Python SDK (`packages/sdk/`)、全プラグインの `node.py`、Python テストを削除 (#78, #81)
- `Makefile` を廃止し、全開発コマンドを `package.json` scripts に統一
- CI から Python 関連ジョブを削除

### 変更

- `npm run dev:api-ts` → `npm run dev:api` にコマンド名を変更
- `npm run create-node` コマンドを追加（Python 版 `create_node.py` の TypeScript 移植）
- `docker-compose.yml` を TypeScript バックエンド (Bun + Hono) 用に更新

## [2.0.1] - 2026-02-15

### 修正

- **Windows デスクトップ版で起動時に404が表示される問題を修正** - Tauri リソースバンドルのパス解決が `resources/` プレフィックスを考慮していなかった
- 静的ファイル配信のパス区切り文字をクロスプラットフォーム対応に正規化
- サーバー起動時に STATIC_DIR の診断ログを追加

### 改善

- **デスクトップアプリの自動アップデート機能を有効化** - 署名キーを設定し、次回以降のリリースから自動更新が可能に

## [2.0.0] - 2026-02-15

### 追加

#### デスクトップアプリケーション
- **Tauri v2 デスクトップアプリ** - macOS / Windows 対応のネイティブアプリ (#75)
  - ワンクリック起動（サーバー自動起動）
  - DMG (macOS) / NSIS インストーラー (Windows) で配布
  - GitHub Releases からの自動アップデート機能（v2.0.1 で有効化）
  - スプラッシュスクリーン（サーバー起動待ち表示）

#### TypeScript バックエンド
- **Bun + Hono バックエンド** - Python バックエンドを完全に TypeScript で再実装
  - Bun ランタイムによる高速な起動・実行
  - Hono フレームワークによる軽量 API サーバー
  - bun:sqlite + Drizzle ORM によるデータベース管理
  - Zod によるリクエストバリデーション
  - Biome によるコードフォーマットと静的解析

- **TypeScript SDK** - プラグイン開発用 `@aituber-flow/sdk` パッケージ
  - BaseNode クラス（setup, execute, onEvent, teardown）
  - NodeContext API（ログ出力、イベント発行、バックグラウンドタスク）
  - 型安全なプラグイン開発体験

- **ネイティブ WebSocket** - Socket.IO から Hono/Bun ネイティブ WebSocket に移行
  - 依存関係の削減（socket.io パッケージ不要）
  - バイナリメッセージ対応
  - より軽量な通信プロトコル

#### ビルドシステム
- **静的エクスポート対応** - Next.js の `output: 'export'` モード
  - `BUILD_MODE=desktop` で静的 HTML/JS/CSS を生成
  - Bun サーバーが API + 静的フロントエンドを同一ポートで配信
  - CORS 不要（同一オリジン）
- **デスクトップビルドパイプライン**
  - `npm run build:desktop` で静的ビルド → サイドカーコンパイル → リソースコピー
  - GitHub Actions によるクロスプラットフォームビルド（macOS ARM/Intel, Windows x64）

### 改善

- **環境変数によるパス設定** - デスクトップモード向けに全リソースパスを環境変数でオーバーライド可能に
  - `PLUGINS_DIR`, `TEMPLATES_DIR`, `UPLOAD_DIR`, `ANIMATIONS_DIR`, `AUDIO_DIR`, `STATIC_DIR`, `DATABASE_URL`
- **グレースフルシャットダウン** - SIGTERM/SIGINT ハンドラーによる安全なサーバー停止
- **CI/CD パイプライン** - TypeScript バックエンド用のテスト・型チェック・lint ワークフロー

### 破壊的変更

- **WebSocket プロトコル変更** - Socket.IO → ネイティブ WebSocket
  - フロントエンドの接続方法が変更（自動対応済み）
  - カスタムクライアントは WebSocket API に移行が必要
- **バックエンド API ランタイム変更** - Python (FastAPI) → TypeScript (Bun + Hono)
  - Python バックエンドは `apps/server/` に残存（レガシー）
  - TypeScript バックエンドが `apps/server-ts/` で推奨

### 技術詳細

#### バックエンド（Bun + Hono + TypeScript）
- Bun ランタイムによるサーバー実行
- Hono フレームワークによる REST API
- bun:sqlite + Drizzle ORM によるデータベース管理
- ネイティブ WebSocket によるリアルタイム通信
- Zod スキーマによるリクエストバリデーション
- 95 のユニットテスト（bun:test）

#### デスクトップ（Tauri v2 + Rust）
- Rust シェルによるネイティブウィンドウ管理
- サイドカーパターン（コンパイル済み Bun バイナリ）
- リソースバンドル（プラグイン、テンプレート、フロントエンド）
- 自動アップデーター（GitHub Releases 連携）

---

## [1.3.0] - 2026-02-05

### 追加

- **ワークフロー循環参照チェック** - 無限ループ防止機能を追加 (#53)
  - Kahn's algorithm による循環検出
  - 循環検出時に日本語/英語でエラーメッセージを表示
  - WorkflowCycleError 例外を定義

- **WebSocket再接続ロジック** - 接続の安定性を向上 (#52)
  - 指数バックオフ再接続（1秒〜30秒）
  - 接続状態インジケーターをエディタヘッダーに表示
  - connectionStatus 状態（connected/disconnected/reconnecting）

- **エラーバッジ表示** - ノードエラーの可視化 (#56)
  - ノードエラー時に詳細バッジを表示
  - ホバーでエラーメッセージのツールチップ

- **プラグインエラー処理明確化** - 例外クラスを追加 (#54)
  - NodeExecutionError, NodeConfigError, NodeConnectionError
  - WORKFLOW_CYCLE_DETECTED エラーコード

- **パスワード/APIキーマスク表示** - セキュリティ向上 (#58)
  - パスワードフィールドに表示/非表示トグル
  - YouTube APIキーをパスワードタイプに変更

### 修正

- **SVGエラーアイコン** - 表示サイズを修正し視認性を向上
- **WebSocket再接続スパム** - ステール・クロージャーバグを修正
- **パスワードトグル** - アクセシビリティ属性を追加

---

## [1.2.5] - 2026-02-04

### 追加

- **トースト通知システム** - 操作結果をポップアップ通知で表示
  - 成功/エラー/警告/情報の4種類のトースト
  - スライドインアニメーション付き
  - 自動消去（3秒）または手動で閉じる

- **キーボードショートカット** - エディタの操作を効率化
  - `Ctrl/Cmd + S`: ワークフロー保存
  - `Delete/Backspace`: 選択ノード削除
  - `Escape`: 選択解除・パネルを閉じる

- **プラットフォーム別テンプレート** - すぐに始められるワークフロー
  - YouTube VTuber テンプレート
  - Twitch VTuber テンプレート
  - Discord Bot テンプレート

- **サポート問い合わせ案内** - フッターとREADMEに連絡先を追加
  - GitHub Issue へのリンク
  - X DM (@oboroge9) へのリンク

### 改善

- **CORS設定** - 開発環境でのポート競合に対応
  - localhost:3000-3010 を許可
  - Next.js rewrites でAPIプロキシを追加
  - API URL の正規化（末尾スラッシュ・/api 重複防止）

- **自動保存エラー通知** - スパム防止のスロットリング
  - 30秒間の同一エラー抑制

- **インポート成功通知** - ページ遷移後も表示されるよう改善
  - sessionStorage でメッセージを永続化

---

## [1.2.4] - 2026-02-03

### 修正

- **デフォルトVRM自動読み込み** - VRMモデル未指定時に`Flowchan.vrm`を自動で読み込むように修正 (#44)
  - `constants.ts`のパスを正しいファイル名に修正
  - `AvatarView`でフォールバック処理を追加

---

## [1.2.3] - 2026-02-01

### 追加

- **GPT-5シリーズ対応** - OpenAI LLMノードにGPT-5系モデルを追加
  - GPT-5, GPT-5.1, GPT-5.2, GPT-5 Mini, GPT-5 Nano
  - `reasoning_effort` パラメータ対応（none, minimal, low, medium, high, xhigh）

### 修正

- **Overlayページのデバッグ表示** - 開発環境でも不要なUI要素が表示されないように修正
  - AvatarViewコンポーネントに `showDebugInfo` プロップを追加
  - Next.jsの開発インジケーター（左下のロゴ）を非表示に設定

---

## [1.2.2] - 2026-01-31

### 改善

- **ロゴ刷新** - サイトヘッダーのロゴを新しいAITuberFlowロゴに更新
  - Home/Editorページのヘッダーアイコンを外部PNGファイルに置き換え
  - グラデーション背景を削除しシンプルなデザインに

---

## [1.2.1] - 2026-01-30

### セキュリティ

- **Next.js** 16.1.3 → 16.1.5 にアップデート
- **python-multipart** 0.0.21 → 0.0.22 にアップデート

---

## [1.2.0] - 2026-01-29

### 追加

#### プラグインシステム強化
- **動的UI登録** - プラグイン追加時にフロントエンドの手動編集が不要に
  - `manifest.json` の `ui` セクションでアイコン、色、ラベルを定義
  - サイドバー、ノード表示が自動的に反映
  - 約770行のハードコードを削減
- **プラグイン開発CLI** - `make create-node` でプラグインを対話的に作成
  - プラグイン名、カテゴリ、入出力ポートを対話的に設定
  - `manifest.json`、`node.py`、`README.md` を自動生成
  - バリデーション（名前の重複チェック、形式チェック）

### 改善

#### パフォーマンス
- **開発サーバーのメモリ使用量を改善**
  - `serverExternalPackages` でthree.js系をサーバー側解析から除外
  - Next.js 16のTurbopack設定を最適化

#### 開発者体験
- **プラグイン追加が `manifest.json` と `node.py` だけで完結**
  - 以前: Sidebar.tsx, Canvas.tsx, CustomNode.tsx の3ファイルを手動編集
  - 現在: manifest.jsonにUI設定を追加するだけ

---

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

[2.3.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v2.3.0
[2.2.4]: https://github.com/oboroge0/AITuberFlow/releases/tag/v2.2.4
[2.2.3]: https://github.com/oboroge0/AITuberFlow/releases/tag/v2.2.3
[2.2.2]: https://github.com/oboroge0/AITuberFlow/releases/tag/v2.2.2
[2.2.1]: https://github.com/oboroge0/AITuberFlow/releases/tag/v2.2.1
[2.2.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v2.2.0
[2.0.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v2.0.0
[1.3.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.3.0
[1.2.5]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.2.5
[1.2.4]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.2.4
[1.2.3]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.2.3
[1.2.2]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.2.2
[1.2.1]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.2.1
[1.2.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.2.0
[1.1.2]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.1.2
[1.1.1]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.1.1
[1.1.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.1.0
[1.0.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.0.0
[0.1.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v0.1.0
