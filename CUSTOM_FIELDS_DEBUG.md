# Custom Fields Troubleshooting Guide

## Issue: Custom field not being extracted

When you create a custom field (e.g., "What is the CPC?") but it's not appearing in extraction results, follow this debugging flow:

### Step 1: Verify Field is Saved in Frontend

**In Browser DevTools Console:**

```javascript
// Check if field exists in localStorage
const fields = JSON.parse(localStorage.getItem("schemaxtract_custom_fields"));
console.log("Saved fields:", fields);

// Should show your field with structure:
// {
//   id: "field_...",
//   name: "CPC",
//   key: "cpc",
//   question: "What is the CPC?",
//   type: "text",
//   required: true,
//   category: "other",
//   ...
// }
```

**If fields are empty or null:**

- Go to Fields tab
- Create/recreate your field
- Click "Create Field" button
- Verify it appears in the fields list

### Step 2: Verify Fields are Sent with Upload

**In Browser DevTools Console (during upload):**

You should see console logs:

```
Custom fields being sent: [{field_key: "cpc", question: "What is the CPC?", ...}]
Number of custom fields: 1
```

**Check Network Tab:**

1. Open DevTools → Network tab
2. Upload a document
3. Find the `/api/process-document` POST request
4. Click on it → Payload/Request tab
5. Verify `customFields` array is present in JSON body

**If customFields is missing or empty:**

- Problem is in DocumentUploader.jsx
- Check console for errors
- Verify fieldService is imported correctly

### Step 3: Verify Backend Receives Fields

**Check Lambda (Backend) Logs:**

In SAM Local terminal output, look for:

```
INFO Processing document: filename.pdf (application/pdf)
INFO Using 1 custom field definitions
INFO Custom fields: [
  {
    "field_key": "cpc",
    "question": "What is the CPC?",
    "required": true,
    "type": "text"
  }
]
```

**If you see "No custom fields provided":**

- Backend is not receiving customFields
- Check API Gateway/Lambda integration
- Verify request body parsing in lambda_handler

### Step 4: Verify Donut Service Receives Fields

**Check Donut Service Logs:**

In Donut Service terminal, you should see:

```
INFO Using 1 custom field definitions
INFO Custom fields received: [{'field_key': 'cpc', 'question': 'What is the CPC?', ...}]
INFO Added question for cpc: What is the CPC?
INFO Extracting fields using LayoutLM Q&A for 1 questions...
```

**If you see "No custom fields provided - using default questions":**

- Donut service didn't receive custom_fields parameter
- Check backend call_donut_service() function
- Verify payload includes 'custom_fields' key

**If you see "No valid questions found in custom_fields, using defaults":**

- custom_fields structure is wrong
- Check field has both 'key' or 'field_key' AND 'question'
- Verify JSON serialization

### Step 5: Verify LayoutLM Extraction

**Check extraction results in logs:**

```
INFO ✓ cpc: ABC123 (confidence: 0.85, bbox: [100, 200, 300, 250])
```

**If field extraction succeeds:**

- Field should appear in document viewer
- Check field name matches your key (e.g., "cpc")

**If field extraction fails:**

- Question might be unclear
- Text might not exist in document
- Try rephrasing question
- Check document quality

## Common Issues & Solutions

### Issue: Field appears in UI but question not used

**Cause:** Field key mismatch
**Solution:**

- Frontend sends `field_key`
- Donut expects `key` or `field_key`
- Code handles both: `field.get("key") or field.get("field_key")`

### Issue: Only default fields extracted

**Cause:** Custom fields not reaching Donut service
**Solution:**

- Check all logs in order (frontend → backend → donut)
- Find where custom fields are lost
- Verify data structure at each step

### Issue: Field extracted but not displayed

**Cause:** Label mismatch in frontend
**Solution:**

- Backend uses field `label` in results
- Check DocumentList/AnnotationCanvas expects correct field names

## Quick Debug Commands

```bash
# Check Donut service is running
curl http://localhost:3002/health

# Check backend is running
curl http://localhost:3001/

# View real-time Donut logs
# (if logging to file)
tail -f donut_service.log

# View real-time Lambda logs
# (check SAM Local terminal)

# Test custom fields format
node -e "console.log(JSON.stringify([{field_key: 'cpc', question: 'What is the CPC?', required: true, type: 'text'}], null, 2))"
```

## Expected Data Flow

```
1. FieldManager
   ↓ (saves to localStorage)

2. localStorage: schemaxtract_custom_fields
   ↓ (read by fieldService)

3. fieldService.getFieldsAsQuestions()
   ↓ (called by DocumentUploader)

4. DocumentUploader → axios.post('/api/process-document', {customFields: [...]})
   ↓ (HTTP request)

5. Lambda → body.get('customFields')
   ↓ (passed to Donut)

6. Donut → /extract endpoint → custom_fields parameter
   ↓ (passed to extraction function)

7. extract_fields_with_donut(image_path, custom_fields)
   ↓ (passed to LayoutLM function)

8. extract_invoice_fields_layoutlm(image_path, custom_fields)
   ↓ (builds questions dict)

9. LayoutLM model answers each question
   ↓ (returns extracted fields)

10. Results displayed in DocumentViewer
```

## Testing Your Fix

After making changes, test the complete flow:

1. **Clear localStorage:**

   ```javascript
   localStorage.removeItem("schemaxtract_custom_fields");
   ```

2. **Create fresh field:**

   - Go to Fields tab
   - Click "➕ Add Field"
   - Fill in: Name: "CPC", Question: "What is the CPC?"
   - Save

3. **Upload test document:**

   - Go to Documents tab
   - Upload document with CPC text
   - Watch console logs
   - Watch backend/donut logs

4. **Verify extraction:**
   - Check document viewer shows "cpc" field
   - Verify extracted value
   - Check confidence score

## Still Not Working?

1. **Enable all logging:**

   - Added console.log in DocumentUploader ✅
   - Added logger.info in backend ✅
   - Added logger.info in Donut service ✅

2. **Check each log level:**

   - Frontend console: custom fields sent
   - Backend logs: custom fields received
   - Donut logs: questions generated
   - Donut logs: extraction results

3. **Verify code changes applied:**

   - Frontend rebuild needed? (Vite auto-reloads)
   - Backend rebuild needed? (SAM Local restart)
   - Donut service restart needed? ✅ (done)

4. **Check browser cache:**
   - Hard refresh (Ctrl+Shift+R)
   - Clear site data
   - Incognito mode

The logs we added will show you exactly where the custom fields are being lost or malformed.
