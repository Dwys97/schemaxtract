# Development container for MD-Copilot IDP
FROM mcr.microsoft.com/devcontainers/python:1-3.12-bullseye

# Install system dependencies needed for PDF processing and ML
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
    # PDF processing tools
    poppler-utils \
    # OCR tools
    tesseract-ocr \
    tesseract-ocr-eng \
    # Image processing libraries
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1-mesa-glx \
    ffmpeg \
    # Build tools (for Python packages with C extensions)
    build-essential \
    gcc \
    g++ \
    make \
    cmake \
    pkg-config \
    # Additional utilities
    curl \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set up pip and upgrade
RUN pip install --upgrade pip setuptools wheel

# Install AWS SAM CLI globally
RUN pip install --no-cache-dir aws-sam-cli

# Create workspace directory
RUN mkdir -p /workspace && chown -R vscode:vscode /workspace

# Switch to non-root user
USER vscode

# Set working directory
WORKDIR /workspace
