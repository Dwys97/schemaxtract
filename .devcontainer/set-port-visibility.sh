#!/bin/bash
# Automatically set ports as public in GitHub Codespaces
# This script runs on container startup to ensure all service ports are publicly accessible

echo "Setting port visibility to public..."

# Check if running in GitHub Codespaces
if [ -n "$CODESPACE_NAME" ]; then
    # Wait a moment for ports to be registered
    sleep 2
    
    # Install GitHub CLI if not present
    if ! command -v gh &> /dev/null; then
        echo "Installing GitHub CLI..."
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
        sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update -qq && sudo apt install -y -qq gh
    fi
    
    # Set all service ports to public
    echo "Making ports 3000, 3001, 3002 public..."
    gh codespace ports visibility 3000:public 3001:public 3002:public -c "$CODESPACE_NAME" 2>/dev/null || true
    
    echo "✓ Port visibility configured"
else
    echo "Not running in Codespaces, skipping port visibility setup"
fi
