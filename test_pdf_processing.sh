#!/bin/bash

# Test PDF processing with memory monitoring

echo "=== PDF Processing Test ==="
echo ""

# Check PaddleOCR service
if ! curl -s http://localhost:3002/health > /dev/null; then
    echo "❌ PaddleOCR service is not running!"
    exit 1
fi

echo "✅ PaddleOCR service is healthy"
echo ""

# Get PID
PID=$(ps aux | grep "python main.py" | grep -v grep | awk '{print $2}')
echo "PaddleOCR PID: $PID"
echo ""

# Monitor memory before
echo "Memory usage BEFORE test:"
free -h | grep "Mem:"
ps -p $PID -o pid,rss,vsz,cmd 2>/dev/null || echo "Process not found"
echo ""

# Create minimal PDF (base64 encoded single page)
# This is a valid minimal PDF with one blank page
TEST_PDF="JVBERi0xLjQKJeLjz9MNCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCA2MTIgNzkyXS9QYXJlbnQgMiAwIFI+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmDQowMDAwMDAwMDE1IDAwMDAwIG4NCjAwMDAwMDAwNjQgMDAwMDAgbg0KMDAwMDAwMDExNiAwMDAwMCBuDQp0cmFpbGVyCjw8L1NpemUgNC9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjE5Mwp%%RU9GCg=="

echo "Sending test PDF to PaddleOCR service..."
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3002/process-document \
    -H "Content-Type: application/json" \
    -d "{\"document\": \"$TEST_PDF\", \"filename\": \"test.pdf\"}")

# Check response
if echo "$RESPONSE" | grep -q "success"; then
    echo "✅ PDF processed successfully!"
    echo ""
    echo "Response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null | head -20
else
    echo "❌ Processing failed!"
    echo "$RESPONSE"
fi

echo ""

# Monitor memory after
echo "Memory usage AFTER test:"
free -h | grep "Mem:"

# Check if process still exists
if ps -p $PID > /dev/null 2>&1; then
    ps -p $PID -o pid,rss,vsz,cmd 2>/dev/null
    echo ""
    echo "✅ PaddleOCR process still running (PID: $PID)"
else
    echo ""
    echo "❌ PaddleOCR process was killed! (PID $PID no longer exists)"
    exit 1
fi

echo ""
echo "=== Test completed ==="
