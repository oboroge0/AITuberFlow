# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-26

### Added

#### Core Features
- **Visual Workflow Editor** - Drag-and-drop node-based workflow builder
- **Real-time Execution** - WebSocket-powered live workflow execution with logs
- **Plugin System** - Extensible node architecture with 32+ official plugins
- **Workflow Templates** - Pre-built templates for common use cases
- **Multi-language Support** - Japanese and English UI

#### Node Categories
- **Control Flow**: Start, End, Loop, ForEach, Switch, Delay
- **Input**: Manual Input, YouTube Chat, Twitch Chat, Discord Chat, Timer
- **LLM**: OpenAI GPT, Anthropic Claude, Google Gemini, Ollama
- **TTS**: VOICEVOX, COEIROINK, Style-Bert-VITS2
- **Avatar**: Avatar Configuration, Motion Trigger, Lip Sync, Emotion Analyzer
- **Output**: Console Output, Audio Player, Subtitle Display
- **OBS Integration**: Scene Switch, Source Toggle
- **Utility**: HTTP Request, Text Transform, Random, Variable, Data Formatter

#### Avatar System
- VRM model loading and rendering
- Expression control (happy, sad, angry, surprised, neutral)
- Real-time lip sync with audio
- Animation support (Mixamo FBX)
- PNG expression mapping for 2D avatars

#### Streaming Features
- OBS-compatible transparent overlay (`/overlay/{workflow-id}`)
- Browser Source ready with customizable parameters
- Real-time subtitle display
- Audio playback synchronization

#### Infrastructure
- **Docker Support** - Multi-stage Dockerfiles for backend and frontend
- **Docker Compose** - Full-stack deployment configuration
- **CI/CD Pipeline** - GitHub Actions with lint, type check, and tests
- **Test Suite** - 91 unit tests covering core modules

#### Documentation
- Architecture documentation with Mermaid diagrams
- Comprehensive API reference (REST + WebSocket)
- Getting started guide with Docker instructions
- Plugin development guide

### Technical Details

#### Backend (FastAPI + Python 3.11)
- Async workflow execution engine
- Event-driven architecture with EventBus
- Socket.IO for real-time communication
- SQLite database with SQLAlchemy ORM
- Plugin hot-loading from `plugins/` directory

#### Frontend (Next.js 16 + React 18)
- @xyflow/react for node editor
- Zustand for state management
- Three.js + @pixiv/three-vrm for 3D avatar rendering
- Tailwind CSS for styling
- TypeScript throughout

#### SDK
- `aituber_flow_sdk` Python package for plugin development
- BaseNode class with lifecycle methods (setup, execute, on_event, teardown)
- NodeContext for logging and event emission

---

## [0.1.0] - 2024-XX-XX

### Added
- Initial development release
- Basic workflow editor functionality
- Core plugin implementations

[1.0.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v1.0.0
[0.1.0]: https://github.com/oboroge0/AITuberFlow/releases/tag/v0.1.0
