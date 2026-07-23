#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

# Only run pnpm install if not on Vercel (Vercel handles install automatically)
if [ -z "${VERCEL:-}" ]; then
  echo "Installing dependencies..."
  pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel error --reporter=append-only
fi

echo "Building the Next.js project..."
pnpm next build

# Only bundle custom server for non-Vercel environments
# Vercel uses its own serverless runtime and doesn't need a custom server
if [ -z "${VERCEL:-}" ]; then
  echo "Bundling server with tsup..."
  pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
fi

echo "Build completed successfully!"
