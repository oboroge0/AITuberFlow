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
│   ├── server/          # Python FastAPI backend (legacy)
│   │   ├── engine/      # Workflow execution engine
│   │   ├── routers/     # API endpoints
│   │   └── main.py      # Server entry point
│   ├── server-ts/       # TypeScript Bun+Hono backend (primary)
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
│   ├── sdk/             # Python SDK for node development (legacy)
│   │   └── aituber_flow_sdk/
│   └── sdk-ts/          # TypeScript SDK for node development
│       └── src/
├── plugins/             # Node plugins (each in own directory)
│   ├── {node-name}/
│   │   ├── manifest.json
│   │   └── node.py      # Python implementation (being migrated to TS)
├── tests/               # Test suites
│   ├── engine/          # TypeScript engine tests (bun:test)
│   ├── routes/          # TypeScript route tests (bun:test)
│   └── unit/            # Python unit tests (pytest)
└── templates/           # Workflow templates (JSON)
```

## Backend Options

### TypeScript Backend (Primary - Recommended)

| 項目 | 技術 |
|------|------|
| Runtime | Bun |
| Framework | Hono |
| Database | bun:sqlite + Drizzle ORM |
| WebSocket | Native WebSocket (Hono/Bun) |
| Validation | Zod |

### Python Backend (Legacy)

| 項目 | 技術 |
|------|------|
| Runtime | Python 3.11+ |
| Framework | FastAPI |
| Database | SQLite + SQLAlchemy |
| WebSocket | python-socketio |
| Validation | Pydantic |

## Node Development

### Plugin Structure

Each node is a plugin in `plugins/{node-name}/`:
- `manifest.json` - Node metadata, inputs, outputs, config schema
- `node.py` - Python implementation extending `BaseNode`

### BaseNode Methods (Python)

```python
class MyNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        """Called once when workflow starts"""
        pass

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Called each time the node runs, returns outputs"""
        return {"output_id": value}

    async def on_event(self, event: Event, context: NodeContext) -> Optional[dict]:
        """Handle WebSocket events (optional)"""
        return None

    async def teardown(self) -> None:
        """Called when workflow stops"""
        pass
```

### BaseNode Methods (TypeScript SDK)

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

```python
# Python
await context.log(message, level="info")  # Log to frontend
await context.emit_event(Event(type="event.name", payload={}))  # WebSocket event
context.create_task(coroutine)  # Background task
context.cancel_background_tasks()  # Cancel all tasks
```

```typescript
// TypeScript
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

```python
# Python
await context.emit_event(Event(
    type="avatar.expression",
    payload={"expression": "happy", "intensity": 0.8}
))
```

```typescript
// TypeScript
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
# Full stack (TypeScript backend + frontend) - recommended
npm run dev

# Full stack (Python backend + frontend) - legacy
npm run dev:py

# Individual services
npm run dev:web         # Frontend only
npm run dev:api-ts      # TypeScript backend only
npm run dev:api         # Python backend only

# Install dependencies (TypeScript only)
make install

# Install all dependencies (TypeScript + Python)
make install-all

# Run tests
make test               # All tests (Python + TypeScript)
make test-ts            # TypeScript tests only
make test-py            # Python tests only

# Lint
make lint
```

## Development Tips

1. **Single Responsibility**: Each node should do one thing well
2. **Events for Real-time**: Use events for time-sensitive data (lip sync, expressions)
3. **Outputs for Data Flow**: Use outputs for data that flows to next node
4. **Pass-through Outputs**: Include input data in outputs when downstream nodes need it
5. **Async/Await**: All node methods are async - use `await` properly
6. **Type Safety**: Match manifest types with Python/TypeScript implementations

## Running the Project

```bash
# TypeScript backend (recommended)
cd apps/server-ts && bun run dev

# Python backend (legacy)
cd apps/server && uv run python main.py

# Frontend
cd apps/web && npm run dev

# Or use the combined command
npm run dev       # Frontend + TypeScript backend (default)
npm run dev:py    # Frontend + Python backend (legacy)
```

Both backends serve on port **8001** by default. The frontend runs on port **3000**.

## Testing

```bash
# TypeScript tests (bun:test)
bun test tests/engine/ tests/routes/ --verbose

# Python tests (pytest)
cd apps/server && uv run pytest ../../tests/unit/ -v --tb=short

# All tests
make test
```

## Testing Workflows

1. Open editor at `http://localhost:3000/editor/{workflow-id}`
2. Add nodes from sidebar
3. Connect nodes by dragging between ports
4. Configure nodes in the right panel
5. Click play button to run from a node

## Git / GitHub ルール

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

以下のファイルのバージョンを更新:
- `apps/web/package.json`
- `apps/server-ts/package.json`
- `apps/server/pyproject.toml` (legacy)
- `CHANGELOG.md`（日付は `date +%Y-%m-%d` で確認）

### 3. コミット＆マージ

```bash
# コミットメッセージに closes #XX を含める
git commit -m "Release vX.X.X

- 変更内容1
- 変更内容2

closes #XX, closes #YY

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

# mainにマージ
git checkout main
git merge <branch>
```

**⚠️ 重要: タグ作成前に追加修正がないか最終確認すること**

### 4. タグ作成（全ての修正が終わってから）

```bash
git tag -a vX.X.X -m "Release vX.X.X - 概要"
git push origin main
git push origin vX.X.X
```

### 5. GitHubリリースノート作成

- URL: `https://github.com/oboroge0/AITuberFlow/releases/new?tag=vX.X.X`
- CHANGELOGからコピーして整形
- 絵文字を追加（✨新機能、🚀改善、🐛修正）

### 6. 最終確認

- [ ] タグが正しいコミットを指している
- [ ] マイルストーンのissueがクローズされている
- [ ] リリースノートが公開されている
- [ ] ZIPダウンロードで最新のREADMEが含まれている
