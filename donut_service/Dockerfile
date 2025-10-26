# Donut Service - Standalone Docker container
# Larger image acceptable since not running in Lambda
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Expose port
EXPOSE 3002

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=3002

# Run the service
CMD ["python", "main.py"]
