# OCR Mode Switching Guide

The backend now supports three OCR modes that can be toggled via environment variables in `backend/template.yaml`:

## Mode 1: Simulation (LayoutLM-style fields with bounding boxes)

**Best for:** Development, testing UI, demos without OCR dependencies

**Configuration:**
```yaml
Environment:
  Variables:
    USE_SIMULATION_MODE: 'true'
    USE_PADDLEOCR_SERVICE: 'true'  # Ignored when simulation forced
```

**Features:**
- ✅ No external dependencies
- ✅ Instant response (<100ms)
- ✅ Consistent test data
- ✅ Normalized bounding boxes [0-1000]
- ✅ 8 pre-defined invoice fields
- ✅ Memory efficient (~50MB)

**Returns:**
- Invoice Number: INV-2025-001
- Invoice Date: October 26, 2025
- Bill To Name: John Doe
- Bill To Address: 123 Main Street, San Francisco, CA 94102
- Subtotal: $4,000.00
- Tax: $400.00
- Total: $4,400.00
- Due Date: November 25, 2025

## Mode 2: Tesseract OCR (Real extraction)

**Best for:** Production, real documents, resource-constrained environments

**Configuration:**
```yaml
Environment:
  Variables:
    USE_SIMULATION_MODE: 'false'
    USE_PADDLEOCR_SERVICE: 'true'
    PADDLEOCR_HOST: '172.17.0.1'
```

**Features:**
- ✅ Real OCR extraction
- ✅ Lightweight (~126MB RAM)
- ✅ Fast processing (~1-3s per page)
- ✅ Works in Codespaces
- ✅ Regex-based field extraction
- ⚠️ Accuracy: 85-95%

**Requirements:**
- Tesseract service running on port 3002
- 256MB+ available RAM

## Mode 3: Disabled OCR (Simulation fallback)

**Best for:** Testing backend without any OCR service

**Configuration:**
```yaml
Environment:
  Variables:
    USE_SIMULATION_MODE: 'false'
    USE_PADDLEOCR_SERVICE: 'false'
```

**Behavior:**
- Always returns simulation data
- Useful for frontend-only development

## Quick Switch Commands

### Enable Simulation Mode
```bash
# Edit backend/template.yaml
# Set: USE_SIMULATION_MODE: 'true'

cd backend
sam build --use-container
pkill -f "sam local"
sam local start-api --port 3001 --host 0.0.0.0 &
```

### Enable Tesseract OCR
```bash
# Edit backend/template.yaml
# Set: USE_SIMULATION_MODE: 'false'

# Ensure Tesseract service is running
cd ocr_service
pkill -f "python main.py"
python main.py > /tmp/tesseract.log 2>&1 &

# Rebuild backend
cd ../backend
sam build --use-container
pkill -f "sam local"
sam local start-api --port 3001 --host 0.0.0.0 &
```

## Testing

### Test Simulation Mode
```bash
curl -X POST http://127.0.0.1:3001/process-document \
  -H "Content-Type: application/json" \
  -d '{"document": "dGVzdA==", "filename": "test.pdf"}'
```

Expected: Returns 8 simulated fields with consistent bounding boxes

### Test Tesseract Mode
```bash
# Upload real PDF through frontend
# Or use test script:
./test_pdf_processing.sh
```

Expected: Returns extracted text + regex-matched fields

## Current Configuration

**Default:** Simulation Mode (USE_SIMULATION_MODE: 'true')

This ensures:
- Immediate functionality without waiting for OCR service
- Consistent demo data for development
- No memory issues in Codespaces
- Easy frontend testing

**To switch to real OCR:** Set `USE_SIMULATION_MODE: 'false'` and rebuild backend

## Architecture Flow

```
Frontend Upload
     ↓
SAM Backend (port 3001)
     ↓
  Decision Point
     ↓
     ├─→ USE_SIMULATION_MODE=true → Return simulated fields
     ├─→ USE_SIMULATION_MODE=false + Tesseract available → Real OCR
     └─→ Tesseract unavailable → Fallback to simulation
```

## Recommendation

- **Development:** Use Simulation Mode
- **Testing real docs:** Switch to Tesseract
- **Production:** Tesseract or cloud OCR service (AWS Textract, Google Vision)
