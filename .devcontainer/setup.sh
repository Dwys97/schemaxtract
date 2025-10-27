#!/bin/bash
set -e

echo "🚀 Setting up MD-Copilot IDP Development Environment..."

# Fix Docker socket permissions for the vscode user
echo "🐳 Setting up Docker permissions..."
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true

# Install system dependencies (as root if needed)
echo "📦 Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    libgl1-mesa-glx \
    && sudo rm -rf /var/lib/apt/lists/*

# Install AWS SAM CLI
echo "📦 Installing AWS SAM CLI..."
pip install --user aws-sam-cli

# Install backend dependencies (for local development/testing)
echo "📦 Installing Python backend dependencies..."
if [ -f backend/requirements.txt ]; then
    pip install --user -r backend/requirements.txt
fi

# Install frontend dependencies
echo "📦 Installing Node.js dependencies..."
if [ -f frontend/package.json ]; then
    cd frontend && npm install && cd ..
fi

# Create necessary directories
mkdir -p /tmp/sam-cache
mkdir -p logs

# Set up Git (if not already configured)
if [ -z "$(git config --global user.email)" ]; then
    echo "⚙️  Git user.email not set. Please configure it manually."
fi

if [ -z "$(git config --global user.name)" ]; then
    echo "⚙️  Git user.name not set. Please configure it manually."
fi

echo "✅ Setup complete!"
echo ""
echo "📖 Quick Start:"
echo "   1. Start all services: Run the 'Start All Services' task from VS Code"
echo "   2. Or manually:"
echo "      - Backend: cd backend && sam build && sam local start-api --port 3001 --host 0.0.0.0"
echo "      - Frontend: cd frontend && npm run dev -- --host 0.0.0.0"
echo "      - Donut: cd donut_service && python main.py"
echo ""
echo "📚 See QUICK_START.md for detailed instructions"
