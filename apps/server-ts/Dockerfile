FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY apps/server-ts/package.json apps/server-ts/bun.lock* ./
COPY packages/sdk-ts/package.json ../sdk-ts/package.json
RUN bun install --frozen-lockfile

# Copy source
COPY apps/server-ts/ .
COPY packages/sdk-ts ../sdk-ts
COPY plugins ../plugins
COPY templates ../templates

# Create non-root user
RUN adduser --disabled-password --no-create-home appuser

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
  CMD bun -e "fetch('http://localhost:8001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

USER appuser

CMD ["bun", "run", "src/index.ts"]
