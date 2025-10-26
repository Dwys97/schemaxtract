#!/bin/bash

echo "🚀 Setting up MD-Copilot IDP Development Environment..."

# Install AWS SAM CLI
echo "📦 Installing AWS SAM CLI..."
pip install --user aws-sam-cli

# Install backend dependencies (for local development/testing)
echo "📦 Installing Python dependencies..."
pip install --user -r backend/requirements.txt

# Install frontend dependencies
echo "📦 Installing Node.js dependencies..."
cd frontend && npm install && cd ..

# Create necessary directories
mkdir -p /tmp/sam-cache

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
echo "   1. Backend: cd backend && sam build --use-container && sam local start-api --port 3001"
echo "   2. Frontend: cd frontend && npm run dev"
echo ""
echo "📚 See QUICK_START.md for detailed instructions"
