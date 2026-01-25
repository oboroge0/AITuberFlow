# AITuberFlow API Reference

This document describes all API endpoints and WebSocket events for the AITuberFlow backend server.

**Base URL:** `http://localhost:8000`

**Interactive Docs:** `http://localhost:8000/docs` (Swagger UI)

## Table of Contents

- [System Endpoints](#system-endpoints)
- [Workflows API](#workflows-api)
- [Plugins API](#plugins-api)
- [Templates API](#templates-api)
- [Integrations API](#integrations-api)
- [WebSocket Events](#websocket-events)

---

## System Endpoints

### GET /

Returns basic server information.

**Response:**
```json
{
  "name": "AITuberFlow API",
  "version": "0.1.0",
  "docs": "/docs"
}
```

### GET /health

Health check endpoint for monitoring and container orchestration.

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0"
}
```

---

## Workflows API

Base path: `/api/workflows`

### Create Workflow

**POST** `/api/workflows`

Creates a new workflow.

**Request Body:**
```json
{
  "name": "My Workflow",
  "description": "Optional description",
  "nodes": [],
  "connections": [],
  "character": {
    "name": "AI Assistant",
    "personality": "Friendly and helpful"
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid-string",
  "name": "My Workflow",
  "description": "Optional description",
  "nodes": [],
  "connections": [],
  "character": {...},
  "createdAt": "2024-01-01T00:00:00",
  "updatedAt": "2024-01-01T00:00:00"
}
```

### List Workflows

**GET** `/api/workflows`

Returns all workflows, ordered by last updated.

**Response:** `200 OK`
```json
[
  {
    "id": "uuid-string",
    "name": "Workflow Name",
    "description": "...",
    "nodes": [...],
    "connections": [...],
    "character": {...},
    "createdAt": "2024-01-01T00:00:00",
    "updatedAt": "2024-01-01T00:00:00"
  }
]
```

### Get Workflow

**GET** `/api/workflows/{workflow_id}`

Returns a specific workflow by ID.

**Response:** `200 OK`
```json
{
  "id": "workflow-uuid",
  "name": "Workflow Name",
  "description": "...",
  "nodes": [...],
  "connections": [...],
  "character": {...},
  "createdAt": "2024-01-01T00:00:00",
  "updatedAt": "2024-01-01T00:00:00"
}
```

**Error:** `404 Not Found` - Workflow not found

### Update Workflow

**PUT** `/api/workflows/{workflow_id}`

Updates an existing workflow. All fields are optional.

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "nodes": [...],
  "connections": [...],
  "character": {...}
}
```

**Response:** `200 OK` - Returns updated workflow

**Error:** `404 Not Found` - Workflow not found

### Delete Workflow

**DELETE** `/api/workflows/{workflow_id}`

Deletes a workflow. Also stops execution if running.

**Response:** `200 OK`
```json
{
  "status": "deleted"
}
```

**Error:** `404 Not Found` - Workflow not found

### Duplicate Workflow

**POST** `/api/workflows/{workflow_id}/duplicate`

Creates a copy of an existing workflow.

**Response:** `200 OK` - Returns the new workflow with `" (Copy)"` appended to name

**Error:** `404 Not Found` - Workflow not found

### Export Workflow

**GET** `/api/workflows/{workflow_id}/export`

Exports a workflow as a portable JSON format.

**Response:** `200 OK`
```json
{
  "name": "Workflow Name",
  "description": "...",
  "nodes": [...],
  "connections": [...],
  "character": {...},
  "exportedAt": "2024-01-01T00:00:00",
  "version": "1.0"
}
```

### Import Workflow

**POST** `/api/workflows/import`

Imports a workflow from JSON data.

**Request Body:** Exported workflow JSON

**Response:** `200 OK` - Returns the imported workflow with a new ID

### Start Workflow Execution

**POST** `/api/workflows/{workflow_id}/start`

Starts executing a workflow.

**Request Body (optional):**
```json
{
  "nodes": [...],
  "connections": [...],
  "character": {...},
  "start_node_id": "node-uuid"
}
```

If provided, uses the request data instead of saved workflow data. This allows running with unsaved changes.

**Response:** `200 OK`
```json
{
  "status": "started",
  "workflow_id": "uuid"
}
```

### Stop Workflow Execution

**POST** `/api/workflows/{workflow_id}/stop`

Stops a running workflow.

**Response:** `200 OK`
```json
{
  "status": "stopped",
  "workflow_id": "uuid"
}
```

### Get Execution Status

**GET** `/api/workflows/{workflow_id}/status`

Returns the current execution status of a workflow.

**Response:** `200 OK`
```json
{
  "workflow_id": "uuid",
  "status": "idle|running|error",
  "started_at": "2024-01-01T00:00:00",
  "error": null
}
```

---

## Plugins API

Base path: `/api/plugins`

### List Plugins

**GET** `/api/plugins`

Returns all available node plugins.

**Response:** `200 OK`
```json
[
  {
    "id": "manual-input",
    "name": "Manual Input",
    "description": "Allows manual text input",
    "category": "input",
    "inputs": [...],
    "outputs": [...],
    "config": {...}
  }
]
```

### Get Plugin

**GET** `/api/plugins/{plugin_id}`

Returns a specific plugin manifest.

**Response:** `200 OK` - Plugin manifest JSON

**Error:** `404 Not Found` - Plugin not found

---

## Templates API

Base path: `/api/templates`

### List Templates

**GET** `/api/templates`

Returns all available workflow templates.

**Response:** `200 OK`
```json
[
  {
    "id": "basic-chat",
    "name": "Basic Chat",
    "name_ja": "基本チャット",
    "description": "Simple chat workflow",
    "description_ja": "シンプルなチャットワークフロー",
    "nodeCount": 3,
    "connectionCount": 2
  }
]
```

### Get Template

**GET** `/api/templates/{template_id}`

Returns a complete template with all nodes and connections.

**Response:** `200 OK` - Full template JSON

**Error:** `404 Not Found` - Template not found

---

## Integrations API

Base path: `/api/integrations`

### VOICEVOX Integration

#### Get Speakers

**GET** `/api/integrations/voicevox/speakers`

Returns available VOICEVOX speakers and their styles.

**Query Parameters:**
- `host` (optional): VOICEVOX host URL. Default: `http://localhost:50021`

**Response:** `200 OK`
```json
{
  "speakers": [
    {
      "id": 1,
      "name": "四国めたん",
      "style": "ノーマル",
      "label": "四国めたん (ノーマル)"
    }
  ]
}
```

**Error:** `503 Service Unavailable` - Cannot connect to VOICEVOX

#### Health Check

**GET** `/api/integrations/voicevox/health`

Checks if VOICEVOX is accessible.

**Query Parameters:**
- `host` (optional): VOICEVOX host URL

**Response:** `200 OK`
```json
{
  "status": "healthy|unhealthy",
  "version": "0.14.0",
  "host": "http://localhost:50021"
}
```

### Audio Files

#### Serve Audio

**GET** `/api/integrations/audio/{filename}`

Serves generated audio files (WAV only).

**Response:** `200 OK` - Audio file (audio/wav)

**Error:** `404 Not Found` - File not found

### Model Management

#### Upload Model

**POST** `/api/integrations/models/upload`

Uploads a VRM model or image file.

**Request:** `multipart/form-data`
- `file`: Model file (.vrm, .png, .jpg, .jpeg, .gif, .webp)

**Response:** `200 OK`
```json
{
  "success": true,
  "filename": "abc12345_model.vrm",
  "url": "/api/integrations/models/file/abc12345_model.vrm",
  "size": 1234567
}
```

#### List Models

**GET** `/api/integrations/models`

Returns all uploaded models.

**Response:** `200 OK`
```json
{
  "models": [
    {
      "filename": "model.vrm",
      "url": "/api/integrations/models/file/model.vrm",
      "size": 1234567,
      "type": "vrm"
    }
  ]
}
```

#### Delete Model

**DELETE** `/api/integrations/models/{filename}`

Deletes an uploaded model.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Deleted model.vrm"
}
```

#### Serve Model File

**GET** `/api/integrations/models/file/{filename}`

Serves an uploaded model file.

**Response:** `200 OK` - Model file with appropriate media type

### Animation Management

#### Upload Animation

**POST** `/api/integrations/animations/upload`

Uploads an animation file (Mixamo FBX, etc.).

**Request:** `multipart/form-data`
- `file`: Animation file (.fbx, .glb, .gltf)

**Response:** `200 OK`
```json
{
  "success": true,
  "filename": "abc12345_idle.fbx",
  "url": "/api/integrations/animations/file/abc12345_idle.fbx",
  "size": 123456
}
```

#### List Animations

**GET** `/api/integrations/animations`

Returns all uploaded animations.

**Response:** `200 OK`
```json
{
  "animations": [
    {
      "filename": "idle.fbx",
      "url": "/api/integrations/animations/file/idle.fbx",
      "size": 123456,
      "type": "fbx"
    }
  ]
}
```

#### Delete Animation

**DELETE** `/api/integrations/animations/{filename}`

Deletes an uploaded animation.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Deleted idle.fbx"
}
```

#### Serve Animation File

**GET** `/api/integrations/animations/file/{filename}`

Serves an uploaded animation file.

**Response:** `200 OK` - Animation file with appropriate media type

---

## WebSocket Events

AITuberFlow uses Socket.IO for real-time communication.

**Connection URL:** `ws://localhost:8000/ws/socket.io`

### Client Events (Sent by Client)

#### join

Join a workflow room to receive updates.

```javascript
socket.emit('join', { workflowId: 'workflow-uuid' });
```

#### leave

Leave a workflow room.

```javascript
socket.emit('leave', { workflowId: 'workflow-uuid' });
```

#### workflow_start

Start workflow execution.

```javascript
socket.emit('workflow_start', { workflowId: 'workflow-uuid' });
```

#### workflow_stop

Stop workflow execution.

```javascript
socket.emit('workflow_stop', { workflowId: 'workflow-uuid' });
```

#### node_input

Send input data to a node.

```javascript
socket.emit('node_input', {
  workflowId: 'workflow-uuid',
  nodeId: 'node-uuid',
  data: { text: 'Hello' }
});
```

### Server Events (Received by Client)

#### execution.started

Emitted when workflow execution starts.

```javascript
socket.on('execution.started', () => {
  console.log('Workflow started');
});
```

#### execution.stopped

Emitted when workflow execution stops.

```javascript
socket.on('execution.stopped', (data) => {
  console.log('Workflow stopped:', data.reason);
});
```

#### log

Emitted when a node logs a message.

```javascript
socket.on('log', (data) => {
  // data: { nodeId, message, level, timestamp }
  console.log(`[${data.level}] ${data.nodeId}: ${data.message}`);
});
```

#### node.status

Emitted when a node's status changes.

```javascript
socket.on('node.status', (data) => {
  // data: { nodeId, status, data, timestamp }
  // status: 'running' | 'completed' | 'error'
});
```

#### audio

Emitted when audio is generated.

```javascript
socket.on('audio', (data) => {
  // data: { filename, duration, text }
  const audioUrl = `/api/integrations/audio/${data.filename}`;
});
```

#### avatar.expression

Emitted when avatar expression changes.

```javascript
socket.on('avatar.expression', (data) => {
  // data: { expression: 'happy'|'sad'|..., intensity: 0.0-1.0 }
});
```

#### avatar.mouth

Emitted for lip-sync mouth movements.

```javascript
socket.on('avatar.mouth', (data) => {
  // data: { value: 0.0-1.0, viseme?: string }
});
```

#### avatar.motion

Emitted when avatar animation should play.

```javascript
socket.on('avatar.motion', (data) => {
  // data: { motion: 'wave'|'nod'|... }
});
```

#### avatar.update

Emitted for avatar configuration updates.

```javascript
socket.on('avatar.update', (payload) => {
  // General avatar update payload
});
```

#### subtitle

Emitted when subtitle text should be displayed.

```javascript
socket.on('subtitle', (data) => {
  // data: { text: 'Subtitle text' }
});
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request

Invalid request data.

```json
{
  "detail": "Error description"
}
```

### 404 Not Found

Resource not found.

```json
{
  "detail": "Workflow not found"
}
```

### 422 Unprocessable Entity

Validation error.

```json
{
  "detail": [
    {
      "loc": ["body", "name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

### 500 Internal Server Error

Server error.

```json
{
  "detail": "Internal server error"
}
```

### 503 Service Unavailable

External service unavailable.

```json
{
  "detail": "Cannot connect to VOICEVOX at http://localhost:50021"
}
```

---

## Data Types

### Node

```typescript
interface Node {
  id: string;           // UUID
  type: string;         // Plugin ID (e.g., "manual-input")
  position: {
    x: number;
    y: number;
  };
  data: {
    label: string;
    config: Record<string, any>;
  };
}
```

### Connection

```typescript
interface Connection {
  id: string;           // UUID
  from: {
    nodeId: string;
    port: string;       // Output port name
  };
  to: {
    nodeId: string;
    port: string;       // Input port name
  };
}
```

### Character

```typescript
interface Character {
  name: string;
  personality: string;
}
```

### Workflow

```typescript
interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: Node[];
  connections: Connection[];
  character: Character;
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```
