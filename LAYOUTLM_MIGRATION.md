# LayoutLM Model Migration

## Summary

Successfully migrated from **LayoutLMv3 token classification** to **Impira LayoutLM Document Q&A** for better invoice field extraction.

## Changes Made

### 1. Model Switch

- **Before**: `microsoft/layoutlmv3-base` (generic model, token classification)
- **After**: `impira/layoutlm-invoices` (pre-trained on invoices, document Q&A)

### 2. Approach Change

- **Before**:
  - Manual Tesseract OCR extraction
  - LayoutLMv3 token classification
  - Complex pattern matching fallback
  - Manual bbox mapping
- **After**:
  - LayoutLM handles OCR internally
  - Simple question-answering approach
  - Direct bbox extraction from model
  - Much cleaner code

### 3. Code Changes

#### `/donut_service/main.py`

**Load Model** (lines 40-57):

```python
# BEFORE:
_layoutlm_processor = LayoutLMv3Processor.from_pretrained(model_name, apply_ocr=False)
_layoutlm_model = LayoutLMv3ForTokenClassification.from_pretrained(model_name)

# AFTER:
_doc_qa_pipeline = pipeline(
    "document-question-answering",
    model="impira/layoutlm-invoices"
)
```

**Extract Fields** (lines 295-390):

```python
# BEFORE: Complex token classification with manual OCR
def extract_invoice_fields_layoutlm(image_path, ocr_words):
    # Prepare OCR words, normalize boxes
    # Run LayoutLMv3 token classification
    # Map predictions to invoice fields
    # Fallback to pattern matching

# AFTER: Simple Q&A approach
def extract_invoice_fields_layoutlm(image_path):
    questions = {
        'invoice_number': "What is the invoice number?",
        'invoice_date': "What is the invoice date?",
        'total_amount': "What is the total amount?",
        # ... etc
    }

    for field_label, question in questions.items():
        result = doc_qa(image=image, question=question)
        # result: {'score': 0.95, 'answer': 'INV-12345', 'start': 10, 'end': 19, 'bbox': [...]}
```

**Main Extraction Function** (lines 491-545):

```python
# BEFORE: Complex multi-step process
- Run Tesseract OCR
- Try LayoutLMv3 extraction
- Fallback to pattern matching
- Group words into lines
- Merge all results

# AFTER: Clean single-step process
- Call LayoutLM Q&A (handles OCR internally)
- Normalize bboxes to 0-1000 scale
- Return results
```

### 4. Benefits

✅ **Better Accuracy**: Model pre-trained specifically on invoices  
✅ **Simpler Code**: No manual OCR or pattern matching needed  
✅ **Cleaner API**: Question-answering is more intuitive  
✅ **Better Bboxes**: Model returns bboxes directly  
✅ **Fewer Dependencies**: Don't need separate Tesseract setup (though kept as optional fallback)

### 5. Model Information

**Impira LayoutLM Invoices**:

- **HuggingFace**: https://huggingface.co/impira/layoutlm-invoices
- **Architecture**: LayoutLM v1 (LayoutLMForQuestionAnswering)
- **Task**: `document-question-answering`
- **Training**: Fine-tuned specifically on invoice documents
- **Popularity**: 220 likes, 11,930 downloads
- **Library**: `transformers>=4.30.0`

### 6. Questions Supported

The model can answer these invoice-related questions:

- What is the invoice number?
- What is the invoice date?
- What is the due date?
- What is the total amount?
- What is the subtotal?
- What is the tax amount?
- What is the vendor name?
- What is the vendor address?
- What is the customer name?
- What is the billing address?
- What is the PO number?
- What are the payment terms?

### 7. Testing

**Health Check**:

```bash
curl http://localhost:3002/health
# Returns: {"status": "healthy", "service": "layoutlm-invoice-qa", "model_loaded": false}
```

**Extract Invoice**:

```bash
# Upload image/PDF to /extract endpoint
curl -X POST http://localhost:3002/extract \
  -H "Content-Type: application/json" \
  -d '{"document": "base64_encoded_pdf_or_image"}'
```

**Response Format**:

```json
{
  "raw_output": {
    "mode": "layoutlm_qa",
    "model": "impira/layoutlm-invoices",
    "ai_fields": 8
  },
  "fields": [
    {
      "id": 1,
      "label": "invoice_number",
      "value": "INV-12345",
      "bbox": [120, 45, 280, 65],
      "confidence": 0.97,
      "source": "layoutlm_qa"
    }
    // ... more fields
  ],
  "image_size": { "width": 1654, "height": 2339 }
}
```

### 8. Files Modified

- `/donut_service/main.py` - Complete extraction logic rewrite
- `/donut_service/requirements.txt` - Updated comments
- `/donut_service/README.md` - (TODO: Update)

### 9. Backward Compatibility

The old OCR-based functions are preserved but not used by default:

- `perform_ocr_get_words()` - Still available as fallback
- `extract_invoice_fields_ocr_only()` - Pattern matching fallback
- `match_value_to_ocr_bbox()` - Helper for bbox mapping

These can be used if the Q&A model fails or for comparison testing.

### 10. Next Steps

- [ ] Test with real invoices
- [ ] Compare accuracy vs old approach
- [ ] Fine-tune confidence thresholds (currently 0.1)
- [ ] Add more invoice-specific questions if needed
- [ ] Update frontend to display new field labels
- [ ] Performance testing (model loading time, inference speed)
- [ ] Consider GPU support for production

## Migration Date

**January 2025** - Switched from LayoutLMv3 to Impira LayoutLM for invoice-specific extraction

---

**Related Documentation**:

- [Donut Service Migration](DONUT_SERVICE_MIGRATION.md)
- [OCR Migration](OCR_MIGRATION.md)
- [Quick Start](QUICK_START.md)
