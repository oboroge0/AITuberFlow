# Changelog

All notable changes to AITuberFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-23

### Added

#### Core Features
- Visual workflow editor with drag-and-drop interface
- Real-time execution with WebSocket-based live logs
- Auto-save functionality with status indicator
- Node search, export, and import functionality
- Workflow templates for common use cases
- Node display modes (simple/standard/detailed)

#### Control Flow Nodes
- Start node - workflow entry point
- End node - workflow termination
- Loop node - repeat processing
- ForEach node - iterate over lists
- Switch node - conditional branching
- Delay node - add delays between operations

#### Input Nodes
- Manual Input - text entry
- YouTube Chat - fetch live chat messages
- Twitch Chat - fetch chat messages
- Discord Chat - fetch channel messages
- Timer - periodic triggers
- Donation Alert - donation notifications

#### LLM Nodes
- OpenAI (ChatGPT) - GPT-4o, GPT-5 support
- Anthropic (Claude) - Claude models
- Google (Gemini) - Gemini models
- Ollama - local LLM support

#### TTS Nodes
- VOICEVOX - Japanese voice synthesis
- COEIROINK - high-quality Japanese TTS
- Style-Bert-VITS2 - expressive voice synthesis

#### Avatar System
- VRM model support with @pixiv/three-vrm
- Avatar configuration node
- Motion trigger node with Mixamo animation support
- Lip sync node for audio synchronization
- Emotion analyzer for automatic expression changes
- Avatar controls panel with expression/motion presets

#### OBS Integration
- OBS Scene Switch - change scenes via WebSocket
- OBS Source Toggle - show/hide sources

#### Utility Nodes
- HTTP Request - external API calls
- Text Transform - text manipulation
- Random - random number/selection generation
- Variable - store and retrieve values
- Data Formatter - data transformation
- Field Selector - extract fields from data

#### Output Nodes
- Console Output - logging
- Audio Player - play synthesized audio
- Subtitle Display - show subtitles on overlay

#### Streaming Features
- OBS-compatible overlay system
- Transparent background for browser sources
- Real-time avatar display with expressions

### Security
- CORS configuration via environment variables
- Optional OBS integration (GPL-2.0 licensed dependency)

### Documentation
- English and Japanese README
- Plugin development guide (SDK)
- API documentation via Swagger UI
- Contributing guidelines
- Security policy

## [Unreleased]

### Planned
- Image generation nodes
- Additional streaming platform integrations
- Docker deployment support
