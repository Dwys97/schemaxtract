#!/bin/bash

# Test script to monitor memory usage during OCR processing

echo "=== PaddleOCR Memory Test ==="
echo ""

# Check if service is running
if ! curl -s http://localhost:3002/health > /dev/null; then
    echo "❌ PaddleOCR service is not running!"
    exit 1
fi

echo "✅ PaddleOCR service is healthy"
echo ""

# Monitor memory before test
echo "Memory before test:"
free -h | grep "Mem:"
echo ""

# Create a simple test image (1x1 white pixel PNG)
TEST_IMAGE="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

echo "Sending test document to PaddleOCR service..."
RESPONSE=$(curl -s -X POST http://localhost:3002/process-document \
    -H "Content-Type: application/json" \
    -d "{\"document\": \"$TEST_IMAGE\", \"filename\": \"test.png\"}")

echo "Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# Monitor memory after test
echo "Memory after test:"
free -h | grep "Mem:"
echo ""

# Check if process is still running
if ps aux | grep -v grep | grep "python main.py" > /dev/null; then
    echo "✅ PaddleOCR process is still running"
else
    echo "❌ PaddleOCR process was killed!"
    exit 1
fi

echo ""
echo "=== Test completed successfully ==="
