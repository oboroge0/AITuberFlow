# AITuberFlow はじめに

このガイドでは、AITuberFlowをセットアップして実行する方法を説明します。

## 最も簡単な方法: デスクトップアプリ

[GitHub Releases](https://github.com/oboroge0/AITuberFlow/releases/latest) からインストーラーをダウンロードして実行するだけ！

- **macOS**: DMG ファイル（Apple Silicon / Intel 対応）
- **Windows**: NSIS インストーラー (x64)

起動すると自動的にサーバーが立ち上がり、アプリウィンドウにエディタが表示されます。セットアップ不要！

---

## 代替方法: GitHub Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/oboroge0/AITuberFlow)

GitHub Codespacesを使えば、ブラウザ上でワンクリックで開発環境を構築できます。

1. 上のバッジをクリック
2. Codespaceが起動するまで待つ（1-2分）
3. ターミナルで `npm run dev` を実行
4. ポート3000と8001を開く

ローカル環境のセットアップは一切不要です！

---

## ローカル環境でのセットアップ

### 前提条件

開始する前に、以下がインストールされていることを確認してください：

- **Node.js** 22以上
- **[Bun](https://bun.sh/)** 1.0以上（TypeScriptバックエンド用）
- **npm** (Node.jsに付属)


## インストール

### 1. リポジトリをクローン

```bash
git clone https://github.com/oboroge0/AITuberFlow.git
cd AITuberFlow
```

### 2. バックエンドのセットアップ

```bash
# サーバーディレクトリに移動
cd apps/server-ts

# 依存関係をインストール
bun install
```

### 3. フロントエンドのセットアップ

```bash
# webディレクトリに移動 (プロジェクトルートから)
cd apps/web

# npm依存関係をインストール
npm install

# 環境設定ファイルを作成
cp .env.example .env.local
```

### 一括インストール

```bash
# プロジェクトルートから全ての依存関係をインストール
npm install
```

## アプリケーションの実行

AITuberFlowはDocker（クイックセットアップに推奨）またはローカル開発ツールを使用して手動で実行できます。

### オプションA: Dockerを使用 (推奨)

Dockerはローカルに個別のランタイムをインストールせずに始める最も簡単な方法です。

#### Dockerの前提条件

- **Docker** 20.10以上
- **Docker Compose** v2.0以上

#### Dockerでクイックスタート

```bash
# プロジェクトルートから
docker compose up --build
```

これにより：
- バックエンドとフロントエンドの両方のイメージをビルド
- バックエンドを `http://localhost:8001` で起動
- フロントエンドを `http://localhost:3000` で起動
- SQLiteデータベース用の永続ボリュームを作成

#### Docker環境変数

プロジェクトルートに `.env` ファイルを作成して設定をカスタマイズ：

```bash
# バックエンド設定
BACKEND_PORT=8001
CORS_ORIGINS=http://localhost:3000

# フロントエンド設定
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:8001
```

#### 本番環境デプロイ

本番環境では：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### 便利なDockerコマンド

```bash
# ログを表示
docker compose logs -f

# サービスを停止
docker compose down

# コード変更後に再ビルド
docker compose up --build

# 全データを削除（データベース含む）
docker compose down -v
```

### オプションB: 手動セットアップ

Dockerを使用せずにアプリケーションを実行する場合：

#### バックエンドを起動

```bash
# プロジェクトルートから
npm run dev
```

これによりフロントエンドとバックエンドが同時に起動します。

個別に起動する場合：

```bash
# バックエンドのみ (apps/server-tsから)
bun run dev
```

バックエンドは `http://localhost:8001` で起動します。

#### フロントエンド開発サーバーを起動

```bash
# apps/webから (新しいターミナルで)
npm run dev
```

フロントエンドは `http://localhost:3000` で起動します。

## 最初のワークフローを作成

1. **アプリケーションを開く**
   - ブラウザで `http://localhost:3000` に移動
   - 「New Workflow」をクリックして新しいワークフローを作成

2. **ノードを追加**
   - 左サイドバーからキャンバスにノードをドラッグ
   - 利用可能なノード：
     - **Manual Input**: 下流に送信するテキストを入力
     - **OpenAI LLM**: AI応答を生成
     - **Console Output**: ログパネルにテキストを表示

3. **ノードを接続**
   - 出力ポート（ノードの右側）からクリック＆ドラッグ
   - 入力ポート（別のノードの左側）にドロップ
   - 接続がアニメーション線として表示

4. **ノードを設定**
   - ノードをクリックして選択
   - 右側の設定パネルでノードを設定
   - OpenAI LLMの場合、APIキーの入力が必要

5. **ワークフローを保存**
   - ツールバーの「保存」ボタンをクリック
   - ワークフローがデータベースに保存

6. **ワークフローを実行**
   - 「開始」ボタンをクリックしてワークフローを実行
   - 下部のログパネルで実行の進行状況を確認
   - 「停止」をクリックして実行を停止

## 例: シンプルなチャットワークフロー

入力を受け取り、AI応答を生成する基本的なワークフローを作成：

1. **Manual Input** ノードを追加
   - 「入力テキスト」を「こんにちは！2 + 2は？」に設定

2. **OpenAI LLM** ノードを追加
   - OpenAI APIキーを入力
   - システムプロンプトを「あなたは親切な数学の先生です。」に設定
   - モデルを選択（テスト用にはGPT-4o Miniを推奨）

3. **Console Output** ノードを追加
   - デフォルト設定のまま

4. ノードを接続：
   - Manual Input (text) → OpenAI LLM (prompt)
   - OpenAI LLM (response) → Console Output (text)

5. 保存してワークフローを実行！

## デモモード

外部サービスなしでワークフローをテストできます：

### LLMノード（自動）
- APIキーが未設定の場合、LLMノードは自動的にデモ応答を返します
- APIコストなしでワークフローのロジックをテストするのに便利です

### TTSノード（手動）
- TTSノードの設定で「デモモード」を有効にします
- TTSサービスが利用できない場合、ノードはスキップされます
- エラーなしでワークフローが継続します

## ワークフローの共有（インポート/エクスポート）

サイドバーのボタンでワークフローを共有できます：

### エクスポート
- 「エクスポート」をクリックしてワークフローをJSONとしてダウンロード
- セキュリティのため、APIキーは自動的に除外されます
- 公開共有しても安全です

### インポート
- 「インポート」をクリックしてワークフローJSONファイルを選択
- 新しいワークフローが作成されます（既存のものは上書きされません）
- インポートしたワークフローが自動的に開きます

## トラブルシューティング

### Dockerの問題

**コンテナが起動しない:**
- ポート8001または3000が既に使用されていないか確認: `lsof -i :8001` または `lsof -i :3000`
- コンテナログを表示: `docker compose logs backend` または `docker compose logs frontend`
- 再ビルドを試す: `docker compose build --no-cache`

**フロントエンドがバックエンドに接続できない:**
- 両方のコンテナが同じネットワーク上にあることを確認: `docker network ls`
- バックエンドが健全かどうか確認: `docker compose ps`
- `.env` のCORS設定を確認

**データベースの永続化:**
- データは `aituberflow-backend-data` という名前のDockerボリュームに保存
- リセットするには: `docker compose down -v` (全データが削除されます)

### バックエンドが起動しない

- Bunがインストールされていることを確認: `bun --version` (1.0以上)
- 依存関係をインストール: `cd apps/server-ts && bun install`
- ポート8001が使用中でないか確認: `lsof -i :8001`

### フロントエンドが起動しない

- すべてのnpmパッケージがインストールされていることを確認: `npm install`
- Node.jsバージョンを確認: `node --version` (22以上であること)
- `node_modules` を削除して再インストールを試す

### バックエンドに接続できない

- バックエンドがポート8001で実行されていることを確認
- `apps/web/.env.local` のAPI URLが正しいことを確認
- ブラウザコンソールでCORSエラーを確認

### OpenAIエラー

- APIキーが正しいことを確認
- APIクレジットがあることを確認
- レート制限がかかっている場合は別のモデルを試す

## デスクトップアプリのビルド（開発者向け）

ソースからデスクトップアプリをビルドする場合：

### 前提条件

- **Node.js** 22+、**Bun** 1.0+、**Rust**（stable）
- **プラットフォーム固有**: Xcode CLI ツール (macOS) または Visual Studio Build Tools (Windows)

### ビルド手順

```bash
# 1. フロントエンドの静的エクスポート
cd apps/web && npm ci && cross-env BUILD_MODE=desktop npx next build

# 2. サーバーサイドカーのビルド
cd apps/server-ts && bun install
bun build --compile src/index.ts --outfile=../desktop/src-tauri/binaries/server

# 3. リソースのコピー（プラグイン、テンプレート、静的フロントエンド）
node apps/desktop/scripts/copy-resources.js

# 4. Tauri アプリのビルド
cd apps/desktop && npm install && npx tauri build
```

ビルドされたインストーラーは `apps/desktop/src-tauri/target/release/bundle/` にあります。

## 次のステップ

- [アーキテクチャ概要](./architecture.ja.md) でAITuberFlowの仕組みを理解
- [APIリファレンス](./api-reference.ja.md) でRESTとWebSocketドキュメントを確認
- [CLAUDE.md](../CLAUDE.md) で開発ガイドラインを確認
