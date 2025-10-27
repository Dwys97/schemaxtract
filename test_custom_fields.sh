#!/bin/bash
# Test script to verify custom fields are being used

echo "=== Testing Custom Fields Flow ==="
echo ""

# Check if fields exist in localStorage (simulated)
echo "1. Check frontend localStorage for custom fields:"
echo "   Open browser console and run: JSON.parse(localStorage.getItem('schemaxtract_custom_fields'))"
echo ""

# Check backend logs
echo "2. Check Lambda logs for custom field receipt:"
echo "   Should see: 'Using X custom field definitions'"
echo "   Should see: Custom fields JSON dump"
echo ""

# Check Donut service logs
echo "3. Check Donut service logs for field processing:"
tail -f /workspaces/schemaxtract/logs/donut.log 2>/dev/null &
TAIL_PID=$!

echo "   Watching Donut service logs..."
echo "   Should see:"
echo "   - 'Using X custom field definitions'"
echo "   - 'Custom fields received: [...]'"
echo "   - 'Added question for <field_key>: <question>'"
echo "   - 'Extracting fields using LayoutLM Q&A for X questions...'"
echo ""

# Instructions
echo "=== To Test ==="
echo "1. In browser, go to Fields tab"
echo "2. Create a field:"
echo "   - Name: CPC"
echo "   - Key: cpc (auto-generated)"
echo "   - Type: text"
echo "   - Question: What is the CPC?"
echo "   - Category: other"
echo "   - Required: yes"
echo ""
echo "3. Go to Documents tab"
echo "4. Upload a document"
echo "5. Watch the logs above for custom field processing"
echo ""
echo "Press Ctrl+C to stop watching logs"

# Wait for user to stop
wait $TAIL_PID 2>/dev/null
