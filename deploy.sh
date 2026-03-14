#!/bin/bash

# ==============================================================================
# Neon Math - Unified Deployment Script
# ==============================================================================
# This script automates the process of building the React frontend and 
# moving it securely into the Cloudflare Pages backend repository.
# ==============================================================================

# Exit on any error
set -e

# Define directories
FRONTEND_DIR="/Users/tom/projekte/websites/neo-math"
BACKEND_DIR="/Users/tom/projekte/websites/games.codecho.de"
BACKEND_TARGET_DIR="$BACKEND_DIR/neon"

echo "========================================"
echo "🚀 CODECHO GAMES: STARTING DEPLOYMENT 🚀"
echo "========================================"

# 1. Build the React project
echo "📦 1. Building React Frontend (Vite)..."
cd "$FRONTEND_DIR"
npm run build
echo "✅ Build complete."

# 2. Clear out the old files in the backend repository
echo "🧹 2. Cleaning old files from $BACKEND_TARGET_DIR..."
rm -rf "$BACKEND_TARGET_DIR"/*
echo "✅ Old files removed."

# 3. Copy the fresh build over
echo "🚚 3. Copying new build files to backend repository..."
cp -r "$FRONTEND_DIR/dist/"* "$BACKEND_TARGET_DIR/"
echo "✅ Files copied successfully."

# 4. Commit and push the backend repository to trigger Cloudflare Deployment
echo "☁️  4. Triggering Cloudflare Pages Deployment via GitHub..."
cd "$BACKEND_DIR"
git add .
git commit -m "🚀 deploy(neon-math): auto-deploy latest frontend build" || true # ignore if nothing changed
git push origin main
echo "✅ Code pushed to GitHub."

echo "============================================================"
echo "🎉 DEPLOYMENT SUCCESSFUL!"
echo "Cloudflare is now building your changes in the background."
echo "Your frontend will be live on games.codecho.de in ~30 seconds."
echo "============================================================"
