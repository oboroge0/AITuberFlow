.PHONY: help install dev test lint clean

help:
	@echo "Available commands:"
	@echo "  make install  - Install all dependencies"
	@echo "  make dev      - Start development servers"
	@echo "  make test     - Run tests"
	@echo "  make lint     - Run linters"
	@echo "  make clean    - Clean build artifacts"

install:
	cd apps/web && npm install
	cd apps/server && uv sync

dev-frontend:
	cd apps/web && npm run dev

dev-backend:
	cd apps/server && uv run python main.py

lint:
	cd apps/web && npm run lint || true
	cd apps/server && uv run ruff check . || true

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
