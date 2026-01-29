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
│   ├── server/          # Python FastAPI backend
│   │   ├── engine/      # Workflow execution engine
│   │   ├── routers/     # API endpoints
│   │   └── main.py      # Server entry point
│   └── web/             # Next.js frontend
│       ├── app/         # Pages (editor, overlay)
│       ├── components/  # React components
│       └── stores/      # Zustand state management
├── packages/
│   └── sdk/             # Python SDK for node development
│       └── aituber_flow_sdk/
├── plugins/             # Node plugins (each in own directory)
│   ├── {node-name}/
│   │   ├── manifest.json
│   │   └── node.py
└── templates/           # Workflow templates (JSON)
```

## Node Development

### Plugin Structure

Each node is a plugin in `plugins/{node-name}/`:
- `manifest.json` - Node metadata, inputs, outputs, config schema
- `node.py` - Python implementation extending `BaseNode`

### BaseNode Methods

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

### NodeContext API

```python
await context.log(message, level="info")  # Log to frontend
await context.emit_event(Event(type="event.name", payload={}))  # WebSocket event
context.create_task(coroutine)  # Background task
context.cancel_background_tasks()  # Cancel all tasks
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
# Emit from node
await context.emit_event(Event(
    type="avatar.expression",
    payload={"expression": "happy", "intensity": 0.8}
))
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

Use `/create-node` to scaffold a new node plugin with all required files.

## Development Tips

1. **Single Responsibility**: Each node should do one thing well
2. **Events for Real-time**: Use events for time-sensitive data (lip sync, expressions)
3. **Outputs for Data Flow**: Use outputs for data that flows to next node
4. **Pass-through Outputs**: Include input data in outputs when downstream nodes need it
5. **Async/Await**: All node methods are async - use `await` properly
6. **Type Safety**: Match manifest types with Python/TypeScript implementations

## Running the Project

```bash
# Backend (from apps/server)
uv run uvicorn main:app --reload --port 8000

# Frontend (from apps/web)
bun dev
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
- `apps/server/pyproject.toml`
- `CHANGELOG.md`（日付は `date +%Y-%m-%d` で確認）

### 3. コミット＆マージ

```bash
# コミットメッセージに closes #XX を含める
git commit -m "Release vX.X.X

- 変更内容1
- 変更内容2

closes #XX, closes #YY

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

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
