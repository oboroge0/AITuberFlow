# AITuberFlow アーキテクチャ

このドキュメントでは、AITuberFlowのアーキテクチャの包括的な概要を提供し、コントリビューターがシステムの仕組みを理解できるようにします。

## 目次

- [システム概要](#システム概要)
- [高レベルアーキテクチャ](#高レベルアーキテクチャ)
- [バックエンドアーキテクチャ](#バックエンドアーキテクチャ)
  - [ワークフローエグゼキューター](#ワークフローエグゼキューター)
  - [イベントバス](#イベントバス)
  - [APIエンドポイント](#apiエンドポイント)
- [フロントエンドアーキテクチャ](#フロントエンドアーキテクチャ)
  - [状態管理](#状態管理)
  - [エディタコンポーネント](#エディタコンポーネント)
- [プラグインシステム](#プラグインシステム)
  - [プラグイン構造](#プラグイン構造)
  - [プラグインライフサイクル](#プラグインライフサイクル)
  - [SDK概要](#sdk概要)
- [データフロー](#データフロー)
- [データベーススキーマ](#データベーススキーマ)
- [リアルタイム通信](#リアルタイム通信)

---

## システム概要

AITuberFlowは、AITuber配信セットアップを作成するための**ビジュアルワークフローエディタ**です。クライアント・サーバーアーキテクチャに従っています：

- **フロントエンド** (Next.js): ワークフローを構築・管理するビジュアルエディタ
- **バックエンド** (FastAPI): ワークフロー実行エンジンとAPIサーバー
- **プラグイン**: モジュラーなノード実装 (Python)

```
┌─────────────────────────────────────────────────────────────────┐
│                         ユーザーのブラウザ                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Next.js フロントエンド                  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │   エディタ    │  │オーバーレイ  │  │   プレビュー     │  │  │
│  │  │  キャンバス   │  │   (OBS)     │  │  (アバター)      │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP / WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI バックエンド                        │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │  ルーター    │  │  ワークフロー    │  │  イベントバス      │  │
│  │  (API)      │──│  エグゼキューター │──│  (リアルタイム)     │  │
│  └─────────────┘  └─────────────────┘  └────────────────────┘  │
│         │                  │                                     │
│         ▼                  ▼                                     │
│  ┌─────────────┐  ┌─────────────────┐                           │
│  │  SQLite DB  │  │  プラグイン      │                           │
│  │  (ストレージ) │  │  (32以上のノード) │                           │
│  └─────────────┘  └─────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 高レベルアーキテクチャ

### ディレクトリ構造

```
AITuberFlow/
├── apps/
│   ├── server/              # Python FastAPI バックエンド
│   │   ├── engine/          # ワークフロー実行エンジン
│   │   │   ├── executor.py  # コア実行ロジック (~1,130行)
│   │   │   └── event_bus.py # イベントpub/subシステム
│   │   ├── routers/         # APIエンドポイント
│   │   │   ├── workflows.py # ワークフローCRUD & 実行
│   │   │   ├── plugins.py   # プラグイン管理
│   │   │   ├── templates.py # ワークフローテンプレート
│   │   │   └── integrations.py # VTube Studio等
│   │   ├── models/          # Pydanticスキーマ
│   │   ├── db/              # SQLAlchemyデータベース
│   │   └── main.py          # サーバーエントリーポイント
│   │
│   └── web/                 # Next.js フロントエンド
│       ├── app/             # App Routerページ
│       │   ├── (editor)/    # エディタ & プレビューページ
│       │   └── (overlay)/   # OBSオーバーレイページ
│       ├── components/      # Reactコンポーネント
│       │   ├── editor/      # Canvas, Sidebar, CustomNode
│       │   ├── avatar/      # VRMレンダリング, リップシンク
│       │   └── panels/      # 設定, ログ, モーション
│       ├── stores/          # Zustand状態管理
│       ├── hooks/           # カスタムReactフック
│       └── lib/             # ユーティリティ, 型, APIクライアント
│
├── packages/
│   └── sdk/                 # Python プラグインSDK
│       └── aituber_flow_sdk/
│           ├── base.py      # BaseNodeクラス
│           ├── context.py   # NodeContext, Event
│           └── types.py     # 型定義
│
├── plugins/                 # ノードプラグイン (32以上の公式)
│   ├── openai-llm/
│   │   ├── manifest.json    # ノードメタデータ & 設定
│   │   └── node.py          # ノード実装
│   └── ...
│
└── templates/               # ワークフローテンプレート (JSON)
```

---

## バックエンドアーキテクチャ

### ワークフローエグゼキューター

`WorkflowExecutor` (`apps/server/engine/executor.py`) はAITuberFlowの心臓部です。ワークフロー実行、ノードオーケストレーション、イベントハンドリングを管理します。

#### 主要クラス

```python
class NodeContext:
    """ノードに実行コンテキストを提供します。"""
    async def emit_event(event: Event) -> None    # イベントを発火
    async def log(message: str, level: str) -> None  # フロントエンドにログを送信
    def create_task(coroutine) -> Task            # バックグラウンドタスクを作成
    def update_character(updates: dict) -> None   # キャラクター状態を更新

class EventQueue:
    """イベント処理用のスレッドセーフなキュー。"""
    async def put(event: Event) -> None
    async def get() -> Event
    def is_processing() -> bool

class WorkflowExecutor:
    """ワークフロー実行をオーケストレーションします。"""
    async def start_workflow(workflow_id: str, start_node_id: str) -> None
    async def stop_workflow(workflow_id: str) -> None
    def get_status(workflow_id: str) -> ExecutionStatus
```

#### 実行モード

エグゼキューターは2つの実行モードをサポートします：

1. **リニアモード**: 接続に従った順次実行
   - 標準的なリクエスト・レスポンスフローに使用
   - トポロジカル順でノードを実行

2. **イベント駆動モード**: イベントに基づくリアクティブ実行
   - `event_filter` 設定を持つノードに使用
   - ノードは特定のイベントタイプに反応

```python
# リニア実行フロー
async def _run_linear(self, workflow_id: str, start_node_id: str):
    order = self._get_execution_order_from(workflow, start_node_id)
    for node_id in order:
        outputs = await self._execute_node(node_id, inputs)
        # 下流ノードに出力を渡す

# イベント駆動実行フロー
async def _run_event_driven(self, workflow_id: str, source_nodes: List[str]):
    while self._workflows[workflow_id]["status"] == "running":
        event = await event_queue.get()
        for node in matching_nodes:
            await self._execute_node_runtime(node, event)
```

### イベントバス

`EventBus` (`apps/server/engine/event_bus.py`) はリアルタイム通信のためのpublish-subscribeシステムを提供します。

```python
class Event:
    type: str           # 例: "avatar.expression", "audio.play"
    payload: dict       # イベント固有のデータ
    source: str         # 発生元ノードID (任意)
    timestamp: datetime

class EventFilter:
    type_pattern: str   # Globパターン, 例: "avatar.*"
    conditions: dict    # ペイロード条件

class EventBus:
    async def emit(event: Event) -> None
    def subscribe(filter: EventFilter, callback: Callable) -> str
    def unsubscribe(subscription_id: str) -> None
```

#### 主要イベント

| イベントタイプ | ペイロード | 説明 |
|------------|---------|-------------|
| `avatar.expression` | `{expression, intensity}` | アバター表情変更 |
| `avatar.mouth` | `{value: 0.0-1.0}` | リップシンク口の位置 |
| `avatar.motion` | `{motion, fadeIn, loop}` | アニメーショントリガー |
| `audio.play` | `{url, volume}` | 音声ファイル再生 |
| `audio.stop` | `{}` | 音声再生停止 |
| `subtitle` | `{text, duration}` | 字幕表示 |

### APIエンドポイント

#### ワークフロールーター (`/api/workflows`)

| メソッド | エンドポイント | 説明 |
|--------|----------|-------------|
| GET | `/` | 全ワークフロー一覧 |
| POST | `/` | 新規ワークフロー作成 |
| GET | `/{id}` | ID指定でワークフロー取得 |
| PUT | `/{id}` | ワークフロー更新 |
| DELETE | `/{id}` | ワークフロー削除 |
| POST | `/{id}/execute` | 実行開始 |
| POST | `/{id}/stop` | 実行停止 |
| GET | `/{id}/status` | 実行ステータス取得 |

#### プラグインルーター (`/api/plugins`)

| メソッド | エンドポイント | 説明 |
|--------|----------|-------------|
| GET | `/` | 利用可能な全プラグイン一覧 |

#### テンプレートルーター (`/api/templates`)

| メソッド | エンドポイント | 説明 |
|--------|----------|-------------|
| GET | `/` | ワークフローテンプレート一覧 |
| GET | `/{id}` | ID指定でテンプレート取得 |

---

## フロントエンドアーキテクチャ

### 状態管理

AITuberFlowは状態管理に**Zustand**を使用し、3つの主要ストアがあります：

#### WorkflowStore (`stores/workflowStore.ts`)

```typescript
interface WorkflowState {
  // ワークフローデータ
  workflow: Workflow | null;
  nodes: Node[];
  edges: Edge[];

  // 実行状態
  executionStatus: ExecutionStatus;
  nodeLogs: Map<string, LogEntry[]>;

  // アクション
  loadWorkflow: (id: string) => Promise<void>;
  saveWorkflow: () => Promise<void>;
  addNode: (type: string, position: Position) => void;
  updateNodeConfig: (nodeId: string, config: object) => void;
  startExecution: (nodeId: string) => Promise<void>;
  stopExecution: () => Promise<void>;
}
```

#### UIPreferencesStore (`stores/uiPreferencesStore.ts`)

```typescript
interface UIPreferencesState {
  sidebarCollapsed: boolean;
  panelSizes: { left: number; right: number };
  theme: 'light' | 'dark';
}
```

#### LocaleStore (`stores/localeStore.ts`)

```typescript
interface LocaleState {
  locale: 'en' | 'ja';
  setLocale: (locale: string) => void;
}
```

### エディタコンポーネント

```
┌─────────────────────────────────────────────────────────────────┐
│                        エディタレイアウト                         │
│ ┌──────────┬──────────────────────────────────┬──────────────┐ │
│ │          │                                  │              │ │
│ │サイドバー │           キャンバス              │  ノード設定   │ │
│ │          │                                  │    パネル     │ │
│ │ - ノード  │  ┌─────┐      ┌─────┐           │              │ │
│ │  パレット │  │ノード│──────│ノード│           │ - 設定       │ │
│ │          │  └─────┘      └─────┘           │ - 入力       │ │
│ │ - 検索   │       │                          │ - 出力       │ │
│ │          │       ▼                          │              │ │
│ │          │  ┌─────┐                         │              │ │
│ │          │  │ノード│                         │              │ │
│ │          │  └─────┘                         │              │ │
│ └──────────┴──────────────────────────────────┴──────────────┘ │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │                       ログパネル                            │ │
│ └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### 主要コンポーネント

| コンポーネント | ファイル | 目的 |
|-----------|------|---------|
| `Canvas` | `components/editor/Canvas.tsx` | @xyflow/reactを使用したメインワークフローエディタ |
| `CustomNode` | `components/editor/CustomNode.tsx` | ノードのレンダリングと可視化 |
| `Sidebar` | `components/editor/Sidebar.tsx` | ノードパレットと検索 |
| `NodeSettings` | `components/panels/NodeSettings.tsx` | ノード設定パネル |
| `LogPanel` | `components/panels/LogPanel.tsx` | 実行ログ表示 |
| `AvatarView` | `components/avatar/AvatarView.tsx` | VRMアバターレンダリング |

---

## プラグインシステム

### プラグイン構造

各プラグインは `plugins/{plugin-id}/` に配置され、2つの必須ファイルがあります：

```
plugins/openai-llm/
├── manifest.json    # プラグインメタデータと設定スキーマ
└── node.py          # Python実装
```

### マニフェストスキーマ

```json
{
  "$schema": "https://aituber-flow.dev/schemas/plugin-manifest.json",
  "id": "openai-llm",
  "name": "OpenAI LLM",
  "version": "1.0.0",
  "description": "OpenAI GPTモデルを使用してテキストを生成",
  "author": {
    "name": "AITuberFlow Team",
    "url": "https://github.com/aituber-flow"
  },
  "license": "MIT",
  "category": "process",
  "node": {
    "inputs": [
      {"id": "prompt", "type": "string", "description": "入力プロンプト"}
    ],
    "outputs": [
      {"id": "response", "type": "string", "description": "生成されたレスポンス"}
    ],
    "events": {
      "emits": ["response.generated"],
      "listens": []
    }
  },
  "config": {
    "apiKey": {
      "type": "string",
      "label": "APIキー",
      "required": true
    },
    "model": {
      "type": "select",
      "label": "モデル",
      "default": "gpt-4o-mini",
      "options": [
        {"label": "GPT-4o Mini", "value": "gpt-4o-mini"},
        {"label": "GPT-4o", "value": "gpt-4o"}
      ]
    }
  },
  "dependencies": {
    "python": ["openai>=1.0.0"]
  }
}
```

### プラグインライフサイクル

```
┌─────────────────────────────────────────────────────────────────┐
│                      プラグインライフサイクル                       │
│                                                                 │
│  ワークフロー開始                                                 │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────┐                                                    │
│  │ setup() │ ← 設定で一度だけ呼び出される                          │
│  └────┬────┘                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────────────────────────┐                       │
│  │         実行ループ                    │                       │
│  │  ┌───────────┐    ┌───────────────┐ │                       │
│  │  │ execute() │ or │  on_event()   │ │ ← サイクルごとに呼び出し │
│  │  └───────────┘    └───────────────┘ │                       │
│  └──────────────────────────────────────┘                       │
│       │                                                         │
│       ▼                                                         │
│  ┌────────────┐                                                 │
│  │ teardown() │ ← 停止時に一度だけ呼び出される                      │
│  └────────────┘                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### SDK概要

プラグインSDK (`packages/sdk/aituber_flow_sdk/`) は基底クラスを提供します：

```python
from aituber_flow_sdk import BaseNode, NodeContext, Event

class MyNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        """リソース、接続、キャッシュデータを初期化。"""
        self.api_key = config.get("apiKey")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """入力を処理して出力を返す。"""
        result = await self.process(inputs["prompt"])
        await context.log(f"処理完了: {result[:50]}...")
        return {"response": result}

    async def on_event(self, event: Event, context: NodeContext) -> dict | None:
        """受信イベントに反応（任意）。"""
        if event.type == "chat.message":
            return await self.execute({"prompt": event.payload["text"]}, context)
        return None

    async def teardown(self) -> None:
        """リソースをクリーンアップ。"""
        pass
```

#### ノードカテゴリ

| カテゴリ | 基底クラス | 目的 |
|----------|------------|---------|
| `input` | `InputNode` | データソース（入力なし、出力を生成） |
| `process` | `ProcessNode` | データ変換 |
| `output` | `OutputNode` | データシンク（入力を消費、出力なし） |
| `control` | `BaseNode` | フロー制御（switch, loop, delay） |

---

## データフロー

### ワークフロー実行フロー

```
┌────────────────────────────────────────────────────────────────────┐
│                    ワークフロー実行フロー                            │
│                                                                    │
│  1. ユーザーがノードの「再生」をクリック                               │
│            │                                                       │
│            ▼                                                       │
│  2. フロントエンドが POST /api/workflows/{id}/execute を送信         │
│            │                                                       │
│            ▼                                                       │
│  3. バックエンドがデータベースからワークフローを読み込み                 │
│            │                                                       │
│            ▼                                                       │
│  4. エグゼキューターが実行グラフを構築                                 │
│     - 開始ノードからのトポロジカルソート                               │
│     - イベント駆動 vs リニアノードを識別                              │
│            │                                                       │
│            ▼                                                       │
│  5. エグゼキューターが全ノードで setup() を呼び出し                    │
│            │                                                       │
│            ▼                                                       │
│  6. 実行ループ:                                                     │
│     ┌─────────────────────────────────────┐                       │
│     │  順番に各ノードについて:              │                       │
│     │   - 接続から入力を収集               │                       │
│     │   - execute(inputs) を呼び出し       │                       │
│     │   - 下流用に出力を保存               │                       │
│     │   - イベントを発火（あれば）          │                       │
│     │   - WebSocket経由でログを送信         │                       │
│     └─────────────────────────────────────┘                       │
│            │                                                       │
│            ▼                                                       │
│  7. 停止時: 全ノードで teardown() を呼び出し                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### リアルタイムデータフロー (WebSocket)

```
フロントエンド                        バックエンド
   │                                 │
   │──── connect (workflow_id) ─────▶│
   │                                 │
   │◀──── node.status (running) ────│
   │                                 │
   │◀──── node.log (message) ───────│
   │                                 │
   │◀──── event (avatar.expression) │
   │                                 │
   │◀──── node.output (data) ───────│
   │                                 │
   │──── node.input (data) ─────────▶│ (manual-inputノード用)
   │                                 │
   │──── stop ──────────────────────▶│
   │                                 │
```

---

## データベーススキーマ

AITuberFlowはSQLAlchemy ORMを使用したSQLiteを使用します。

### Workflows テーブル

| カラム | 型 | 説明 |
|--------|------|-------------|
| `id` | STRING (PK) | 一意のワークフロー識別子 |
| `name` | STRING | ワークフロー表示名 |
| `description` | TEXT | 任意の説明 |
| `nodes_json` | TEXT | ノード定義のJSON配列 |
| `connections_json` | TEXT | エッジ定義のJSON配列 |
| `character_json` | TEXT | キャラクター設定のJSONオブジェクト |
| `created_at` | DATETIME | 作成タイムスタンプ |
| `updated_at` | DATETIME | 最終更新タイムスタンプ |

### Node JSON構造

```json
{
  "id": "node-1",
  "type": "openai-llm",
  "position": {"x": 100, "y": 200},
  "data": {
    "label": "GPT ノード",
    "config": {
      "apiKey": "sk-...",
      "model": "gpt-4o-mini",
      "temperature": 0.7
    }
  }
}
```

### Connection JSON構造

```json
{
  "id": "edge-1",
  "source": "node-1",
  "sourceHandle": "response",
  "target": "node-2",
  "targetHandle": "text"
}
```

---

## リアルタイム通信

AITuberFlowはリアルタイム双方向通信に**Socket.IO**を使用します。

### WebSocketイベント

#### クライアント → サーバー

| イベント | ペイロード | 説明 |
|-------|---------|-------------|
| `join` | `{workflow_id}` | ワークフロールームに参加 |
| `leave` | `{workflow_id}` | ワークフロールームから退出 |
| `workflow:start` | `{workflow_id, node_id}` | 実行開始 |
| `workflow:stop` | `{workflow_id}` | 実行停止 |
| `node:input` | `{workflow_id, node_id, data}` | ノードに入力を送信 |

#### サーバー → クライアント

| イベント | ペイロード | 説明 |
|-------|---------|-------------|
| `node:status` | `{node_id, status}` | ノードステータス変更 |
| `node:log` | `{node_id, message, level}` | ノードログメッセージ |
| `node:output` | `{node_id, outputs}` | ノード出力データ |
| `event` | `{type, payload}` | ワークフローイベント（アバター、音声等） |
| `workflow:status` | `{status, error?}` | ワークフローステータス変更 |

### WebSocketフック (フロントエンド)

```typescript
// hooks/useWebSocket.ts
const { socket, isConnected } = useWebSocket(workflowId);

useEffect(() => {
  socket.on('node:log', (data) => {
    addLog(data.node_id, data.message, data.level);
  });

  socket.on('event', (event) => {
    if (event.type === 'avatar.expression') {
      setExpression(event.payload.expression);
    }
  });
}, [socket]);
```

---

## コントリビューション

AITuberFlowにコントリビュートする際：

1. **バックエンド変更**: コアロジックは `apps/server/engine/` に集中
2. **フロントエンド変更**: コンポーネントは `apps/web/components/` に配置
3. **新規ノード**: 上記の構造に従って `plugins/` にプラグインを作成
4. **API変更**: `apps/server/routers/` のルーターを更新

詳細なガイドラインは [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

---

## 関連ドキュメント

- [はじめに](./getting-started.ja.md) - インストールと最初のステップ
- [APIリファレンス](./api-reference.ja.md) - RESTとWebSocket APIドキュメント
- [CLAUDE.md](../CLAUDE.md) - 開発ガイドラインとノード作成
