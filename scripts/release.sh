#!/bin/bash
# Usage: bash scripts/release.sh [patch|minor|major]
# Run from repo root OR from electron-app/ (both work).
# Bumps version in electron-app/package.json, commits from repo root, tags, pushes.
set -euo pipefail

BUMP="${1:-patch}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$REPO_ROOT/electron-app"

cd "$APP_DIR"
npm version "$BUMP" --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")

cd "$REPO_ROOT"
git add electron-app/package.json electron-app/package-lock.json
git commit -m "$VERSION"
git tag "v$VERSION"
git push origin main
git push origin "v$VERSION"

echo ""
echo "Released v$VERSION — CI is building the .deb now."
echo "Watch: https://github.com/PhilRice-CITU/edge-client/actions"
