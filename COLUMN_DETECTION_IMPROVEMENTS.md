# Column Detection Improvements

## Overview

Enhanced the intelligent template system's column detection capabilities to address OCR quality and header recognition issues.

## Changes Made

### 1. Improved OCR Configuration

**Before:**

- Used Tesseract PSM 3 (automatic page segmentation)
- Confidence threshold: 30
- General purpose OCR optimized for mixed content

**After:**

- **PSM 6** (assume uniform text block) - better for table structures
- **Confidence threshold: 20** - accepts more text, especially in headers
- Better suited for tabular documents with consistent formatting

### 2. Enhanced Header Detection

**Before:**

- Simple Y-position check (above template rows)
- No structured header-to-column matching
- Generic column names like `column_X`

**After:**

- **Dedicated header region detection**: Headers identified as text blocks above template Y position (min_template_y - 20)
- **Spatial matching**: Headers matched to columns by X-coordinate proximity (within 8% tolerance)
- **Semantic field names**: Headers converted to field names (e.g., "Gross Wt KG" → `gross_wt_kg`)
- Fallback to position-based names only if no header found

### 3. Improved Column Grouping

**Before:**

- X-tolerance: 80 units (8%)
- No distinction between header and data regions
- Template column not excluded from suggestions

**After:**

- **X-tolerance: 60 units (6%)** - more precise column boundaries
- **Template column exclusion**: Prevents suggesting the user's own column
- **Data region filtering**: Only considers blocks below header region (min_template_y - 50)
- Better column separation for closely spaced tables

### 4. Better Row Matching

**Before:**

- Y-tolerance: 50 units (5%)
- No confidence scoring

**After:**

- **Y-tolerance: 60 units (6%)** - slightly more flexible for row alignment
- **Confidence from OCR**: Each field includes OCR confidence score
- **Debug logging**: Tracks Y-diff for each match to diagnose alignment issues

### 5. Enhanced Debugging & Logging

**New capabilities:**

- Sample OCR text output (first 20 blocks) for quick verification
- Per-column header detection logging
- Field-by-field extraction tracking with Y-diff measurements
- Debug response includes `total_ocr_blocks` and `columns_detected`

## How Column Detection Works Now

### Step 1: OCR Extraction

```python
# PSM 6: Assumes uniform block of text (better for tables)
ocr_result = pytesseract.image_to_data(
    image, output_type=pytesseract.Output.DICT, config="--psm 6"
)
```

### Step 2: Header Identification

```python
header_y_max = min_template_y - 20  # 2% above data rows
potential_headers = [b for b in text_blocks if b_center_y < header_y_max]
```

### Step 3: Column Grouping

```python
# Group blocks by X position (6% tolerance)
# Exclude template column (avg_template_x ± 60)
# Exclude header region (< min_template_y - 50)
```

### Step 4: Header-to-Column Matching

```python
# For each column, find closest header by X position
# Convert header text to field name: "Gross Wt KG" → gross_wt_kg
```

### Step 5: Row Extraction

```python
# For each template Y position:
#   Find closest block in column (within 6% Y-tolerance)
#   Create field with semantic name from header
```

## Expected Improvements

### OCR Quality

- **PSM 6** should better recognize table cell boundaries
- **Lower confidence threshold (20)** accepts more header text
- Better suited for invoice/table-heavy documents

### Header Recognition

- Headers now explicitly searched in region above data
- Spatial matching ensures correct header-column pairing
- Should detect "Gross Wt KG", "Net Wt KG", "Price/Unit" etc.

### Semantic Field Names

- Fields named after their column headers
- More meaningful than `column_X` generic names
- User sees: `gross_wt_kg_item_1` instead of `column_650_item_1`

### Accuracy

- Template column excluded from suggestions
- Better X/Y tolerances for precise matching
- Confidence scores help identify unreliable extractions

## Testing Recommendations

1. **Test with table documents**:

   - Upload multi-page invoice with clear column headers
   - Select one column (e.g., gross weight)
   - Click "🔮 Suggest Columns"
   - Verify headers are detected and field names make sense

2. **Check OCR quality**:

   - Review backend logs for "Sample OCR text" output
   - Verify headers appear in the OCR results
   - Check confidence scores in response

3. **Validate column matching**:

   - Ensure suggested fields align with correct rows
   - Check `column_header` field in response
   - Verify no duplicate column suggestions

4. **Debug if needed**:
   - Check response `debug` object for `total_ocr_blocks`, `columns_detected`
   - Review logs for per-column header detection
   - Look for Y-diff measurements in field matching logs

## Known Limitations

1. **OCR still limited**: PSM 6 helps but won't solve all table recognition issues - consider PaddleOCR for complex tables
2. **No multi-line headers**: Headers expected as single text blocks
3. **Fixed tolerances**: 6% X/Y tolerance may not work for all document layouts
4. **No semantic understanding**: Still relies on spatial matching, not LayoutLM Q&A capabilities

## Next Steps (Future)

1. **Integrate LayoutLM Q&A**: Use `_doc_qa_pipeline` to ask "What are the column headers?" for semantic understanding
2. **Fuzzy string matching**: Match template field names to headers semantically (e.g., "gross_weight" matches "Gross Wt KG")
3. **Table structure detection**: Use computer vision to detect table borders and cells
4. **Adaptive tolerances**: Learn X/Y tolerances from template field distribution
5. **PaddleOCR integration**: Superior table OCR for complex layouts

## Files Modified

- `/workspaces/schemaxtract/donut_service/main.py`:
  - `apply_template_intelligent()` function (lines 1359-1740)
  - Changed PSM mode, thresholds, header detection, column grouping logic
  - Enhanced logging and debug output

## Rollback Instructions

If the changes cause issues, revert to PSM 3:

```python
ocr_result = pytesseract.image_to_data(
    image, output_type=pytesseract.Output.DICT, config="--psm 3"
)
```

And restore confidence threshold to 30:

```python
if text and conf > 30:  # Changed back from 20
```
