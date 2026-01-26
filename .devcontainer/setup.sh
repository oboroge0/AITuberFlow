#!/bin/bash
set -e

echo "=== AITuberFlow 開発環境セットアップ ==="

# Install uv (Python package manager)
echo "Installing uv..."
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Install bun (JavaScript runtime/package manager)
echo "Installing bun..."
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# Backend setup
echo "Setting up backend dependencies..."
cd apps/server
uv sync
cd ../..

# Frontend setup
echo "Setting up frontend dependencies..."
cd apps/web
npm install
cd ../..

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p data
mkdir -p apps/server/uploads

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "開発サーバーの起動方法:"
echo "  バックエンド: cd apps/server && uv run uvicorn main:app --reload --port 8000"
echo "  フロントエンド: cd apps/web && npm run dev (または bun dev)"
echo ""
echo "または、ルートディレクトリから:"
echo "  npm run dev"
echo ""
