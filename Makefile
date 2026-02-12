.PHONY: help install dev dev-frontend dev-backend dev-backend-ts test test-py test-ts lint clean create-node migrate-manifests

help:
	@echo "Available commands:"
	@echo "  make install           - Install all dependencies"
	@echo "  make dev               - Start development servers (frontend + backend)"
	@echo "  make test              - Run all tests (Python + TypeScript)"
	@echo "  make test-py           - Run Python tests only"
	@echo "  make test-ts           - Run TypeScript tests only"
	@echo "  make lint              - Run linters"
	@echo "  make clean             - Clean build artifacts"
	@echo "  make create-node       - Create a new plugin (interactive)"
	@echo "  make migrate-manifests - Add UI settings to all manifests"

install:
	npm install
	cd apps/web && npm install
	cd apps/server && uv sync
	cd apps/server-ts && bun install
	cd packages/sdk-ts && bun install

dev:
	npm run dev

dev-frontend:
	cd apps/web && npm run dev

dev-backend:
	cd apps/server && uv run python main.py

dev-backend-ts:
	cd apps/server-ts && bun run dev

test: test-py test-ts

test-py:
	cd apps/server && uv run pytest ../../tests/unit/ -v --tb=short

test-ts:
	bun test tests/engine/ tests/routes/ --verbose

lint:
	cd apps/web && npm run lint || true
	cd apps/server && uv run ruff check . || true

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true

create-node:
	cd apps/server && uv run python ../../scripts/create_node.py

migrate-manifests:
	cd apps/server && uv run python ../../scripts/migrate_manifests.py
