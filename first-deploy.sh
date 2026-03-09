#!/bin/bash
# ForgeTrack — First Deploy Script
# Run as the deploy user after setup.sh has been run as root
# Usage: bash first-deploy.sh [develop|staging|production] [git-branch]
#
# Examples:
#   bash first-deploy.sh develop develop
#   bash first-deploy.sh staging staging
#   bash first-deploy.sh production main

set -e

ENV=${1:-develop}
BRANCH=${2:-develop}
REPO=${3:-""}  # e.g. https://github.com/youruser/forgetrack.git

if [[ -z "$REPO" ]]; then
  echo ""
  echo "Usage: bash first-deploy.sh [develop|staging|production] [branch] [repo-url]"
  echo "Example: bash first-deploy.sh develop develop https://github.com/you/forgetrack.git"
  echo ""
  exit 1
fi

APP_DIR="/var/www/forgetrack"
ENV_FILE=".env.${ENV}"

echo ""
echo "=========================================="
echo " ForgeTrack — First Deploy"
echo " Env:    $ENV"
echo " Branch: $BRANCH"
echo " Repo:   $REPO"
echo "=========================================="
echo ""

# ── Clone ─────────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "Repo already cloned, pulling latest..."
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  echo "Cloning repo..."
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
  git checkout "$BRANCH"
fi

# ── Install deps ───────────────────────────────────────────────────
echo "Installing dependencies..."
npm ci --omit=dev

# ── Check env file ─────────────────────────────────────────────────
if [ ! -f "$APP_DIR/$ENV_FILE" ]; then
  echo ""
  echo "ERROR: $ENV_FILE not found in repo root."
  echo "Make sure .env.develop / .env.staging / .env.production are committed."
  exit 1
fi

# ── Data dir + migrate ─────────────────────────────────────────────
echo "Running database migration..."
mkdir -p "$APP_DIR/data"
NODE_ENV="$ENV" node "$APP_DIR/server/db/migrate.js"

# ── Start with PM2 ────────────────────────────────────────────────
echo "Starting app with PM2..."
pm2 delete forgetrack 2>/dev/null || true
NODE_ENV="$ENV" pm2 start "$APP_DIR/server/index.js" --name forgetrack
pm2 save

echo ""
echo "=========================================="
echo " ForgeTrack is running!"
echo " Visit: http://$(hostname -I | awk '{print $1}')"
echo "=========================================="
echo ""
