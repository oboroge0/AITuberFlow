# AITuberFlow Development Guide

## Project Overview

AITuberFlow is a visual workflow editor for creating AI VTuber streaming setups. Users connect nodes in a graph to build pipelines that handle:
- Chat input (YouTube, Twitch)
- LLM responses (OpenAI, Anthropic, Google, Ollama)
- Text-to-Speech (VOICEVOX, COEIROINK, Style-Bert-VITS2)
- Avatar control (VRM models, expressions, lip sync)
- Audio playback and subtitle display

## Architecture

```
AITuberFlow/
├── apps/
│   ├── server-ts/       # TypeScript Bun+Hono backend
│   │   ├── src/
│   │   │   ├── engine/  # Workflow execution engine
│   │   │   ├── routes/  # API endpoints
│   │   │   ├── db/      # Drizzle ORM + bun:sqlite
│   │   │   ├── websocket/ # Native WebSocket handler
│   │   │   └── index.ts # Server entry point
│   │   └── package.json
│   └── web/             # Next.js frontend
│       ├── app/         # Pages (editor, overlay)
│       ├── components/  # React components
│       └── stores/      # Zustand state management
├── packages/
│   └── sdk-ts/          # TypeScript SDK for node development
│       └── src/
├── plugins/             # Node plugins (each in own directory)
│   ├── {node-name}/
│   │   ├── manifest.json
│   │   └── node.ts      # TypeScript implementation
├── tests/               # Test suites
│   ├── engine/          # TypeScript engine tests (bun:test)
│   └── routes/          # TypeScript route tests (bun:test)
└── templates/           # Workflow templates (JSON)
```

## Tech Stack

| 項目 | 技術 |
|------|------|
| Runtime | Bun |
| Framework | Hono |
| Database | bun:sqlite + Drizzle ORM |
| WebSocket | Native WebSocket (Hono/Bun) |
| Validation | Zod |
| Frontend | Next.js + React + Tailwind CSS |

## Node Development

### Plugin Structure

Each node is a plugin in `plugins/{node-name}/`:
- `manifest.json` - Node metadata, inputs, outputs, config schema
- `node.ts` - TypeScript implementation extending `BaseNode`

### BaseNode Methods

```typescript
import { BaseNode, NodeContext, Event } from "@aituber-flow/sdk";

class MyNode extends BaseNode {
  async setup(config: Record<string, unknown>, context: NodeContext): Promise<void> {
    // Called once when workflow starts
  }

  async execute(inputs: Record<string, unknown>, context: NodeContext): Promise<Record<string, unknown>> {
    // Called each time the node runs, returns outputs
    return { outputId: value };
  }

  async onEvent(event: Event, context: NodeContext): Promise<Record<string, unknown> | null> {
    // Handle WebSocket events (optional)
    return null;
  }

  async teardown(): Promise<void> {
    // Called when workflow stops
  }
}
```

### NodeContext API

```typescript
await context.log(message, "info");  // Log to frontend
await context.emitEvent({ type: "event.name", payload: {} });  // WebSocket event
context.createTask(promise);  // Background task
context.cancelBackgroundTasks();  // Cancel all tasks
```

### Frontend Registration (v1.2.0+)

プラグインのUI設定は `manifest.json` の `ui` セクションで定義するだけで自動登録されます。
フロントエンドのコード編集は不要です。

```json
{
  "ui": {
    "label": "My Node",
    "icon": "Cpu",
    "color": "#10B981",
    "bgColor": "rgba(16, 185, 129, 0.1)"
  }
}
```

## Node Categories

- `input` - Data sources (chat, timer, manual input)
- `output` - Endpoints (console, subtitle, audio player)
- `process` - Data transformation (LLM, text transform, emotion analyzer)
- `avatar` - Avatar control (avatar-controller, lip-sync)
- `control` - Flow control (switch, delay, loop)
- `llm` - LLM providers
- `tts` - Text-to-Speech engines

## Event System

Events enable real-time communication between nodes and frontend:

```typescript
await context.emitEvent({
  type: "avatar.expression",
  payload: { expression: "happy", intensity: 0.8 },
});
```

Common events:
- `avatar.expression` - Change avatar expression
- `avatar.mouth` - Lip sync mouth value (0.0-1.0)
- `avatar.motion` - Trigger animation
- `audio.play` - Play audio file
- `audio.stop` - Stop audio playback
- `subtitle` - Display subtitle text

## Overlay System

OBS-compatible overlay at `/overlay/[workflowId]`:
- Unified overlay with avatar, subtitles, and audio playback
- Transparent background for OBS Browser Source
- URL parameters: model, animation, scale, x, y, subtitle, subPosition, subFontSize, volume, debug

## Commands

```bash
# Full stack (backend + frontend)
npm run dev

# Individual services
npm run dev:web         # Frontend only
npm run dev:api         # Backend only

# Install all sub-project dependencies
npm run setup

# Run tests
npm test

# Lint
npm run lint

# Create a new plugin
npm run create-node
```

## Development Tips

1. **Single Responsibility**: Each node should do one thing well
2. **Events for Real-time**: Use events for time-sensitive data (lip sync, expressions)
3. **Outputs for Data Flow**: Use outputs for data that flows to next node
4. **Pass-through Outputs**: Include input data in outputs when downstream nodes need it
5. **Async/Await**: All node methods are async - use `await` properly
6. **Type Safety**: Match manifest types with TypeScript implementations

## Running the Project

```bash
# Backend
cd apps/server-ts && bun run dev

# Frontend
cd apps/web && npm run dev

# Or use the combined command
npm run dev       # Frontend + Backend
```

The backend serves on port **8001** by default. The frontend runs on port **3000**.

## Testing

```bash
# TypeScript tests (bun:test)
npm test
```

## Testing Workflows

1. Open editor at `http://localhost:3000/editor/{workflow-id}`
2. Add nodes from sidebar
3. Connect nodes by dragging between ports
4. Configure nodes in the right panel
5. Click play button to run from a node

## ブランチ運用とリリースフロー

### ブランチの役割

- **`dev`** — 開発統合ブランチ。全ての作業ブランチの PR はここへ向ける。**常にリリース可能な品質を保つ**（CI 緑＋動作確認してからマージ）。
- **`main`** — リリースブランチ。リリース時にのみ dev からマージされる。タグは main 上で打つ。
- **作業ブランチ** — worktree で作業し、dev へ PR。main へ直接 PR しない（hotfix を除く）。

```
feat/xxx (worktree) ──PR──▶ dev ──リリース時にまとめて──▶ main ──tag──▶ CI自動リリース
```

### 原則: 選別はマージ時、リリースは全部

リリース時に機能を選んで取り込む（cherry-pick 式）運用はしない。dev で検証した組み合わせをそのままリリースする。

- 「dev に入った ＝ 次のリリースに入る」
- まだ出したくない機能は、PR をマージせず寝かせるか、設定フラグで隠してマージする
- dev に入れて後悔した変更は、リリース前に dev 上で `git revert`（除外ではなく打ち消しで対応）

### リリースの流れ

1. マイルストーンの issue が揃ったら、dev から `release/vX.Y.Z` ブランチ（worktree）を切る
2. バージョン更新＋ CHANGELOG 更新（下記「リリースプロセス」参照）→ dev へ PR → マージ
3. dev → main へマージ（dev は main の上位互換のはずなので fast-forward になる。ならない場合は分岐の原因を調査してから進める）
4. main 上でタグ作成 → push → CI が GitHub Release ＋デスクトップビルドを自動実行

### 緊急修正（hotfix）

リリース済みバージョンの重大バグのみ対象。

1. main から `hotfix/xxx` を切る → main へ PR →マージ
2. パッチ版（vX.Y.Z+1）のタグを main 上で作成 → push
3. **直後に main を dev へマージし戻す**（忘れると dev/main が分岐し始める）

### リリース頻度

- マイルストーン単位で小さく頻繁に（目安: 2週間〜1ヶ月）。溜めるほどリリース時の検証範囲が爆発する
- マイルストーンが大きすぎて溜まる場合は、issue を次のマイルストーンへ送ってスコープを削り、先にリリースする
- 後方互換を切る大改造（v3 等）は dev に混ぜず、専用の長期ブランチで進める

## Git / GitHub ルール

### dev への直接 push 禁止

**dev ブランチに直接コミット・push しないこと。** 小さな修正でも必ず作業ブランチから PR を経由する。直接 push すると履歴が散らかり、force push でのまとめ直しが必要になる（v2.5.1 で発生）。

```
# NG: git commit && git push origin dev
# OK: git checkout -b fix/xxx dev → commit → push → PR → マージ
```

### コミットメッセージ

- **日本語で書くこと**
- Conventional Commits形式を使用: `<type>: <説明>`
- タイプ: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

例:
```
feat: YouTube チャット入力ノードを追加
fix: リップシンクのタイミング問題を修正
docs: プラグイン開発ガイドを更新
```

### プルリクエスト

- **タイトルと説明は日本語で書くこと**
- 概要セクションで変更内容を箇条書きで説明
- テスト計画を含める

### CHANGELOG.md

- **日本語で書くこと**
- 日付を変更する前に、必ず現在の日付を確認すること（`date` コマンド等）
- フォーマット: `## [バージョン] - YYYY-MM-DD`
- Keep a Changelog 形式に従う

### ドキュメント

| ファイル | 日本語 | 英語 |
|---------|-------|------|
| README | `README.md` | `README.en.md` |
| はじめに | `docs/getting-started.ja.md` | `docs/getting-started.md` |
| アーキテクチャ | `docs/architecture.ja.md` | `docs/architecture.md` |
| APIリファレンス | `docs/api-reference.ja.md` | `docs/api-reference.md` |

- 変更時は両言語を同期して更新すること

## リリースプロセス

### 1. リリース前チェック（ブランチ作業中）

- [ ] 全ての変更が完了している（README更新含む）
- [ ] テストが通る
- [ ] マイルストーンのissueを全て確認

### 2. バージョン更新

以下のファイルのバージョンを更新 (5ファイル全て揃えること):
- `apps/web/package.json`
- `apps/server-ts/package.json`
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml` (更新後 `cd apps/desktop/src-tauri && cargo update -p aituber-flow` で Cargo.lock も更新)
- `CHANGELOG.md`（日付は `date +%Y-%m-%d` で確認）

⚠️ 過去のリリースで `apps/desktop/package.json` (2.0.0 のまま) と `Cargo.toml` (パッチずれ) の
更新漏れが続いていた。Updater 判定の不安定や成果物バージョン文字列の齟齬を防ぐため必ず全て揃える。

### 3. コミット＆マージ

```bash
# コミットメッセージに closes #XX を含める
git commit -m "Release vX.X.X

- 変更内容1
- 変更内容2

closes #XX, closes #YY

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

リリース準備ブランチを dev へ PR →マージした後、dev を main に取り込む:

```bash
git checkout main
git pull origin main
git merge dev        # fast-forward になるはず（ならなければ分岐を調査）
```

**⚠️ 重要: タグ作成前に追加修正がないか最終確認すること**

### 4. タグ作成（全ての修正が終わってから）

```bash
git tag -a vX.X.X -m "Release vX.X.X - 概要"
git push origin main
git push origin vX.X.X
```

### 5. GitHubリリース（CI自動）

タグをpushすると、CI（`.github/workflows/release.yml`）が自動的にGitHubリリースを作成する。

- `softprops/action-gh-release` が CHANGELOG.md からリリースノートを抽出して公開
- デスクトップビルド（`.github/workflows/desktop-release.yml`）もタグpushで自動実行され、成果物がリリースに添付される

**⚠️ `gh release create` で手動リリースを作成しないこと。CIと競合してエラーになる。**

### 6. リリースノートの作成

GitHub Release のリリースノートは**必ず日英両方で記述すること**。CI が CHANGELOG.md から自動抽出する場合もあるが、抽出に失敗した場合や内容が不十分な場合は `gh release edit vX.X.X --notes` で手動更新する。

リリースノートのフォーマット（v2.3.2以降のテンプレート）:

```
vX.X.Xをリリースしました！

[日本語で主な変更内容を2〜3文で要約]

---

vX.X.X has been released!

[英語で同じ内容を要約]
```

⚠️ リリースノートが空のまま公開しないこと。タグ push 後、デスクトップビルド完了を待つ間にリリースノートを書く。

### 7. お知らせ（新機能紹介）の追加 — `announcements.json`

注目機能を含むリリースでは、アプリ内お知らせ（`AnnouncementBanner`）にエントリを1件追加して新機能を紹介すること。**新機能紹介用のモーダルは作らない**（モーダルは使わない方針）。お知らせはこの帯に寄せる。

- 編集対象はリポジトリ**ルートの `announcements.json`**。クライアントは **main の生ファイル**（`https://raw.githubusercontent.com/oboroge0/AITuberFlow/main/announcements.json`）を毎回取得するため、**main にマージした瞬間に全ユーザーへ配信される（ビルド不要・即本番反映）**。内容は慎重に。
- ホーム画面上部に帯で表示され、`type` で配色（`info`=青／`warning`=黄／`critical`=赤）。× で閉じると localStorage に記憶され再表示されない。
- 新機能紹介は `type: "info"` を使う。**title / message は日英両方**を必ず書く。
- `targetVersions` は**完全一致の表示許可リスト**（範囲指定ではない）。
  - 新機能を「更新済みの人にだけ」見せる → その新バージョンだけ列挙（例 `["2.5.2"]`）
  - 全ユーザーに見せる → `targetVersions` を省略
  - 旧版ユーザーへ「更新して」と促す → 対象の旧バージョンを列挙
- 不要になった古いお知らせは削除してよい（`dismissedIds` は自動で掃除される）。

フォーマット:

```json
{
  "id": "feature-vX.Y.Z",
  "type": "info",
  "title":   { "ja": "…", "en": "…" },
  "message": { "ja": "…", "en": "…" },
  "targetVersions": ["X.Y.Z"],
  "date": "YYYY-MM-DD"
}
```

### 8. 最終確認

- [ ] タグが正しいコミットを指している
- [ ] マイルストーンのissueがクローズされている
- [ ] CIのリリースワークフローが成功している
- [ ] **リリースノートが日英両方で記載されている**
- [ ] デスクトップビルドの成果物がリリースに添付されている
- [ ] 注目機能がある場合、`announcements.json` に新機能紹介を追加した（日英両方）
