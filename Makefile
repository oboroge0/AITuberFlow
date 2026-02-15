.PHONY: help install install-all dev dev-py dev-frontend dev-backend dev-backend-py test test-py test-ts lint clean create-node migrate-manifests build-desktop dev-desktop

help:
	@echo "Available commands:"
	@echo "  make install           - Install dependencies (TypeScript only)"
	@echo "  make install-all       - Install all dependencies (TypeScript + Python)"
	@echo "  make dev               - Start development servers (frontend + TS backend)"
	@echo "  make dev-py            - Start development servers (frontend + Python backend)"
	@echo "  make dev-desktop       - Start Tauri desktop app in dev mode"
	@echo "  make build-desktop     - Build desktop app (static frontend + sidecar + Tauri)"
	@echo "  make test              - Run all tests (Python + TypeScript)"
	@echo "  make test-ts           - Run TypeScript tests only"
	@echo "  make test-py           - Run Python tests only"
	@echo "  make lint              - Run linters"
	@echo "  make clean             - Clean build artifacts"
	@echo "  make create-node       - Create a new plugin (interactive)"
	@echo "  make migrate-manifests - Add UI settings to all manifests"

install:
	npm install
	cd apps/web && npm install
	cd apps/server-ts && bun install
	cd packages/sdk-ts && bun install

install-all: install
	cd apps/server && uv sync

dev:
	npm run dev

dev-py:
	npm run dev:py

dev-frontend:
	cd apps/web && npm run dev

dev-backend:
	cd apps/server-ts && bun run dev

dev-backend-py:
	cd apps/server && uv run python main.py

dev-desktop:
	npm run dev:desktop

build-desktop:
	npm run build:desktop

test: test-ts test-py

test-ts:
	bun test tests/engine/ tests/routes/ --verbose

test-py:
	cd apps/server && uv run pytest ../../tests/unit/ -v --tb=short

lint:
	cd apps/web && npm run lint || true

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true

create-node:
	cd apps/server && uv run python ../../scripts/create_node.py

migrate-manifests:
	cd apps/server && uv run python ../../scripts/migrate_manifests.py
