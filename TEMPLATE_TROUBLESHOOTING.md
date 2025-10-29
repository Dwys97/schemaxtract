# Template Matching Troubleshooting Guide

## Issue: "Templates not being used"

### How to Verify Templates Are Working

#### 1. Check if you have templates saved

Open browser console and run:

```javascript
localStorage.getItem("schemaxtract_templates");
```

If this returns `null`, you have no templates saved yet!

#### 2. Save your first template

1. Upload a document
2. Wait for extraction to complete
3. Review all fields and confirm they're correct
4. Click **"Save as Template"** button in the document list
5. Template is saved with all bbox coordinates

#### 3. Check console logs when uploading

When you upload a new document, you should see:

```
[Upload] Looking for matching templates...
[Upload] OCR text length: 1234 chars
[Upload] Extracted vendor from OCR: "ACME Corporation"
[Upload] ✅ Found matching template: "ACME_Corp" (score: 0.85)
[Upload] Template has 8 fields with bbox hints
[Upload] Template hints prepared: {...}
```

If you see:

```
[Upload] ❌ No matching templates found (save a good extraction as template first!)
```

This means either:

- You have no templates saved yet
- Your templates don't match the current document's vendor/fields

#### 4. Check backend logs

When template is used, donut_service logs show:

```
[/extract-batch] Using template 'ACME_Corp' with 8 bbox hints
  Template hint for invoice_number: bbox=[120, 45, 280, 65], confidence=0.92
  Template hint for total_amount: bbox=[650, 890, 780, 920], confidence=0.95
```

And during extraction:

```
✓ invoice_number: INV-12345 (confidence: 0.68, bbox: [120, 45, 280, 65])
  ⭐ Applied template hint for total_amount: bbox=[650, 890, 780, 920], conf=0.85
```

The ⭐ emoji indicates template was applied!

## About CPC Question

**This is NOT a bug!** The CPC question appears because:

1. You created a custom field with the question "What is the CPC?"
2. The system is correctly sending this question to LayoutLM
3. LayoutLM is searching the document for the answer
4. If it finds text matching CPC, it extracts it

This is the **expected behavior** of the custom field system!

### To manage custom fields:

1. Go to "Fields" tab
2. View/Edit/Delete custom field definitions
3. Add new fields or modify existing questions
4. Changes apply to future extractions

## Template Matching Algorithm

Templates are matched based on:

1. **Field Structure Similarity** (Jaccard)
   - Compares field labels between template and current document
   - Higher overlap = better match
2. **Vendor Name Bonus** (+0.3)
   - If vendor names match, adds significant bonus
   - Extracted from OCR text or field values
3. **Minimum Threshold** (0.2)
   - Templates with score < 0.2 are ignored
4. **Best Match Selection**
   - Top 1 template is selected
   - Hints are created for all fields in template

## Template Application Logic

For each field during extraction:

```python
if field_confidence < 0.7 AND template_has_hint:
    if template_confidence > layoutlm_confidence:
        use_template_bbox()
        boost_confidence(max=0.85)
        mark_as_template_applied()
```

This means templates help **low-confidence fields** without overriding high-confidence results.

## Testing Template System

### Test 1: Save a template

```
1. Upload invoice from "ACME Corp"
2. Review extraction results
3. Confirm all fields are accurate
4. Click "Save as Template"
5. Check console: Template saved successfully
```

### Test 2: Use the template

```
1. Upload another invoice from "ACME Corp"
2. Check console logs during upload
3. Should see: "Found matching template"
4. Should see: "Template hints prepared"
5. Check backend logs for ⭐ indicators
```

### Test 3: Verify improvement

```
1. Compare extraction confidence scores
2. Fields with template help should show higher confidence
3. Source field shows "layoutlm_qa_with_template"
4. Review tab shows all extracted fields
```

## Common Issues

### "No templates found" but I saved one

- Check if vendor names match (case-insensitive)
- Check if field structure is similar enough
- View saved templates in Templates tab
- Check localStorage in browser console

### Template not improving accuracy

- Make sure template was saved from GOOD extraction
- Verify template bbox coordinates are correct
- Check if document layout is similar to template
- Backend needs to restart to pick up code changes

### Backend not using templates

- Check donut_service logs for template messages
- Verify POST /extract-batch includes template_hints
- Restart donut_service if code was updated
- Check Python syntax errors in main.py

## Debug Commands

```bash
# Check if donut service is running
ps aux | grep "python main.py"

# View donut service logs
# (output from terminal where service is running)

# Restart donut service
pkill -f "python main.py"
# Then re-run the task

# Check for Python errors
cd /workspaces/schemaxtract/donut_service
python3 -m py_compile main.py
```

## Quick Reference

**Frontend Console Logs** = Template matching happens here  
**Backend Logs** = Template application happens here  
**LocalStorage** = Templates stored here  
**FieldManager** = Custom questions defined here

All working as designed! ✅
