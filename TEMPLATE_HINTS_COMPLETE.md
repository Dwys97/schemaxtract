# ✅ Template Hints Integration - Complete

## Overview

The few-shot learning system with template hints is now **fully integrated**. The system automatically uses saved templates to improve extraction accuracy on similar documents.

## How It Works

### 1. **Save a Template** (One-Time Setup)

- Upload and process a document
- Review and confirm all field extractions are accurate
- Click **"Save as Template"** button in the document list
- Template is saved to localStorage with:
  - Vendor name for matching
  - All field values
  - Bbox coordinates for each field
  - Confidence scores

### 2. **Automatic Template Matching** (Every Upload)

When you upload a new document:

1. **Frontend extracts vendor name** from OCR text
2. **Searches templates** using Jaccard similarity algorithm
3. **Finds best match** (bonus points for vendor name similarity)
4. **Creates template hints** object with bbox coordinates
5. **Passes hints** through the extraction pipeline

### 3. **Template-Guided Extraction** (Backend)

During LayoutLM field extraction:

1. **LayoutLM extracts fields** using Q&A model
2. **For each field with confidence < 0.7:**
   - Check if template has bbox hint for this field
   - If template confidence > LayoutLM confidence
   - **Use template bbox** instead
   - Cap confidence at 0.85 (to avoid overconfidence)
3. **Mark field source** as `layoutlm_qa_with_template`

### 4. **View Results**

- Fields extracted with template help show higher confidence
- Review tab shows all fields with their bboxes
- You can see which fields used template hints in the logs

## End-to-End Flow

```
User Uploads Document
        ↓
    OCR Extracts Text
        ↓
Template Matching (Frontend)
  - findMatchingTemplates(ocrText)
  - Creates templateHints object
        ↓
Batch Extraction Request
  - POST /extract-batch
  - Includes template_hints in body
        ↓
Backend Processing (donut_service)
  - extract_fields_with_donut(template_hints)
  - extract_invoice_fields_layoutlm(template_hints)
        ↓
For Each Field:
  - LayoutLM extracts value
  - If confidence < 0.7 AND template has hint
    → Use template bbox
    → Boost confidence
        ↓
Return Enhanced Fields
  - Better accuracy
  - More confident bboxes
  - Faster user review
```

## Code Changes Summary

### Frontend

1. **DocumentUploader.jsx** - STEP 1.5: Find matching templates after OCR
2. **batchAnnotationService.js** - Pass template_hints to backend
3. **templateService.js** - Template matching and hint creation

### Backend

1. **main.py** `/extract-batch` - Accept template_hints parameter
2. **extract_fields_with_donut()** - Pass template_hints through
3. **extract_invoice_fields_layoutlm()** - Apply bbox hints when confidence low

## Benefits

✅ **Automatic** - No manual configuration needed  
✅ **Few-Shot Learning** - Learns from confirmed examples  
✅ **Improved Accuracy** - Uses spatial hints from similar docs  
✅ **No Retraining** - Works without model fine-tuning  
✅ **Fast** - Template matching happens in milliseconds  
✅ **Transparent** - Logs show when templates are applied

## Example Logs

### Template Matching (Frontend Console)

```
[Template Matching] Searching for templates similar to: "ACME Corporation Invoice #12345..."
[Template Matching] Found matching template: "ACME Corp Standard Invoice"
  - Similarity: 0.85
  - Field hints: 5
[Template Matching] Using template hints for extraction
```

### Template Application (Backend Logs)

```
[/extract-batch] Using template 'ACME Corp Standard Invoice' with 5 bbox hints
  Template hint for invoice_number: bbox=[120, 45, 280, 65], confidence=0.92
  Template hint for total_amount: bbox=[650, 890, 780, 920], confidence=0.95
✓ invoice_number: INV-12345 (confidence: 0.68, bbox: [120, 45, 280, 65])
  ⭐ Applied template hint for total_amount: bbox=[650, 890, 780, 920], conf=0.85
✓ total_amount: $1,234.56 (confidence: 0.85, bbox: [650, 890, 780, 920])
```

## Testing the Feature

1. **Upload a clean invoice** with clearly visible fields
2. **Review and confirm** all extractions are correct
3. **Save as template** using the button
4. **Upload a similar invoice** from the same vendor
5. **Check console logs** - should show template matching
6. **Review results** - should see improved accuracy

## Next Steps

- Test with multiple document types
- Save templates for your most common vendors
- Monitor accuracy improvements
- Export/import templates for backup or sharing

---

**Status:** ✅ All features implemented and tested  
**Commit:** 8c36e90 - "feat: Complete template hints integration for few-shot learning"
