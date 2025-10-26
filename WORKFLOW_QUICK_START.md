# 🎯 Quick Start - Rossum-Style Workflow

## What You Get

A complete **document management system** with Rossum AI-inspired workflow:

```
Upload → Review List → Modal Viewer → Confirm/Reject → Archive
```

---

## 🚀 Start in 3 Commands

```bash
# 1. Start Backend (SAM Local)
cd backend && sam build --use-container && sam local start-api --port 3001

# 2. Start Frontend (Vite) - in new terminal
cd frontend && npm run dev

# 3. Open Browser
http://localhost:3000
```

---

## 📸 UI Overview

### Main Screen
```
┌─────────────────────────────────────────────────────────┐
│  MD-Copilot IDP System                    [Upload] [×]  │
│  Interactive Document Processing                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Drag & Drop Upload Area]                             │
│  ┌──────────────────────────────────┐                  │
│  │  📄  Drop your file here         │                  │
│  │      or click to browse          │                  │
│  │                                  │                  │
│  │  Supports PDF, PNG, JPEG         │                  │
│  └──────────────────────────────────┘                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Tax invoices (UK)                      🔍 ⚙️ ⋮        │
├─────────────────────────────────────────────────────────┤
│  All  [Reviews (2)]  Postpone  Rejected  Confirmed      │
├─────────────────────────────────────────────────────────┤
│  Status includes To review, Reviewing...  [+ Add filter]│
├─────────────────────────────────────────────────────────┤
│  ☐  Status  │  Document name         │  Details │ ... │
│  ☐  [To review]  invoice-001.pdf        96%          │
│  ☐  [To review]  tax-invoice-uk-3.pdf   78%   [Review]│
└─────────────────────────────────────────────────────────┘
```

### Modal Viewer (Click "Review")
```
┌──────────────────────────────────────────────────────────────┐
│  invoice-001.pdf    [Postpone] [Reject] [✓ Confirm]  [×]    │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌────────────────────────────────┐   │
│  │ Extracted Fields │  │      PDF/Image Viewer          │   │
│  │                  │  │  ┌──────────────────────────┐  │   │
│  │ ▶ invoice_number │  │  │                          │  │   │
│  │   INV-2025-001   │  │  │  [Document Preview]      │  │   │
│  │   95%            │  │  │                          │  │   │
│  │                  │  │  │  [Bounding Boxes]        │  │   │
│  │ ▶ invoice_date   │  │  │                          │  │   │
│  │   Oct 26, 2025   │  │  │                          │  │   │
│  │   92%            │  │  │                          │  │   │
│  │                  │  │  └──────────────────────────┘  │   │
│  │ ▶ total          │  │                                │   │
│  │   $4,400.00      │  │    Page 1 of 1                 │   │
│  │   96%            │  │                                │   │
│  └──────────────────┘  └────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│  Uploaded: Oct 26, 2025 • 8 fields        [Close] [Confirm] │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎬 Complete Workflow Demo

### Step 1: Upload Document
1. Drag PDF/image onto upload area OR click to browse
2. Select file (max 10MB, PDF/PNG/JPEG)
3. Watch progress: "Processing..."
4. Document appears in list with **"To review"** status

### Step 2: Document List
- View in **"Reviews"** tab (count badge shows number)
- See extracted data:
  - **Status**: Blue "To review" badge
  - **Confidence**: 96% (avg of all fields)
  - **Invoice ID**: INV-2025-001
  - **Issue Date**: 29/5/2025
  - **Due Amount**: 82,600.50
- Click **"Review"** button (blue, eye icon)

### Step 3: Review in Modal
- **Modal opens full-screen**
- **Left Pane**: List of 8 extracted fields
  - invoice_number: INV-2025-001 (95%)
  - invoice_date: October 26, 2025 (92%)
  - bill_to_name: John Doe (89%)
  - subtotal: $4,000.00 (94%)
  - tax: $400.00 (93%)
  - total: $4,400.00 (96%)
  - due_date: November 25, 2025 (91%)

- **Right Pane**: PDF viewer with interactive boxes
  - Click field in left pane → highlights on document
  - Blue box for selected field
  - Green boxes for other fields
  - Bounding boxes perfectly aligned

### Step 4: Take Action
Choose one:
- **✓ Confirm** (green) → Document approved
- **✗ Reject** (red) → Document rejected
- **⏰ Postpone** (orange) → Review later

### Step 5: View Results
- Document moves to appropriate tab
- Status badge color changes
- No longer in "Reviews" tab
- Persisted in localStorage

---

## 💡 Key Features

### 🎨 Beautiful UI
- **Rossum AI dark theme** (exact colors)
- **Glassmorphic cards** with backdrop blur
- **Smooth animations** on all interactions
- **Color-coded badges** for instant status recognition

### 📊 Smart Extraction
- **PebbleOCR simulation** (realistic text extraction)
- **LayoutML inference** (8 common invoice fields)
- **Confidence scores** per field (85-99%)
- **Normalized bounding boxes** [0,0,1000,1000]

### 🔄 Workflow Management
- **Status tracking**: to_review → reviewing → confirmed/rejected
- **Filter tabs**: All, Reviews, Confirmed, Rejected, Postponed
- **Count badges**: Shows documents per status
- **LocalStorage**: Auto-save all documents

### 🖱️ Interactive Viewer
- **Dual-pane layout**: Fields on left, document on right
- **Click to highlight**: Select field → see on document
- **PDF + Image support**: react-pdf and native img
- **Page navigation**: Multi-page PDF support

### 🔐 Privacy First
- **No backend storage**: Temp files deleted immediately
- **Client-side only**: Documents in your browser
- **GDPR compliant**: try...finally cleanup
- **No tracking**: Zero analytics or cookies

---

## 📋 Status Workflow

```
┌──────────────┐
│  Upload      │  User uploads document
│  Document    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  To Review   │  🔵 Blue badge, appears in "Reviews" tab
│  (status)    │
└──────┬───────┘
       │  Click "Review" button
       ▼
┌──────────────┐
│  Reviewing   │  🔵 Status auto-updates when modal opens
│  (status)    │
└──────┬───────┘
       │  User chooses action
       ├─────────────┬─────────────┬─────────────┐
       ▼             ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│Confirmed │  │ Rejected │  │Postponed │  │ Exported │
│   🟢     │  │    🔴    │  │    🟠    │  │    🟣    │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

## 🎯 Use Cases

### Invoice Processing
1. Upload supplier invoice
2. Auto-extract: invoice #, date, amounts, vendor
3. Review in dual-pane viewer
4. Confirm → Trigger payment workflow
5. Export to accounting system

### Receipt Management
1. Upload expense receipt
2. Extract: merchant, date, total, category
3. Review and verify
4. Confirm → Add to expense report
5. Archive for audit

### Contract Review
1. Upload contract PDF
2. Extract: parties, dates, amounts, terms
3. Review key clauses
4. Postpone for legal review
5. Confirm after approval

### Compliance Documents
1. Upload regulatory forms
2. Extract required fields
3. Verify accuracy
4. Reject if incomplete
5. Confirm compliant documents

---

## 🛠️ Customization

### Add Custom Fields
Edit `backend/src/process_document/app.py`:
```python
def _simulate_layoutml_inference(text, file_path):
    fields = [
        {
            "field_name": "custom_field",
            "value": "extracted_value",
            "confidence": 0.92,
            "bbox": [x1, y1, x2, y2],
            "page": 1
        },
        # ... more fields
    ]
    return fields
```

### Add Status Types
Edit `frontend/src/components/DocumentList.jsx`:
```javascript
<button 
  className={`filter-btn ${activeFilter === 'custom_status' ? 'active' : ''}`}
  onClick={() => setActiveFilter('custom_status')}
>
  Custom Status
</button>
```

### Change Theme Colors
Edit `frontend/src/theme.css`:
```css
:root {
  --accent-blue: #your-color;
  --bg-primary: #your-bg;
  /* ... more variables */
}
```

---

## 📦 LocalStorage Data

Documents stored as JSON array in browser:

```javascript
localStorage.getItem('schemaxtract_documents')
// Returns JSON string

JSON.parse(localStorage.getItem('schemaxtract_documents'))
// Returns array of document objects

// Clear all documents
localStorage.removeItem('schemaxtract_documents')
```

**Storage Limit**: ~5MB (approx 500 documents with base64)

---

## 🚨 Troubleshooting

### Document not appearing in list
- Check browser console for errors
- Verify backend is running (port 3001)
- Check upload response in Network tab
- Try refreshing page

### Modal not opening
- Check for JavaScript errors
- Verify `selectedDocument` state is set
- Ensure DocumentViewerModal is rendered
- Check z-index conflicts

### Bounding boxes misaligned
- Verify bbox coordinates are [0,0,1000,1000] normalized
- Check `pageWidth` and `pageHeight` state
- Ensure PDF rendered before Konva overlay
- Inspect `normalizedToPixels()` function

### Status not updating
- Check `handleStatusChange()` callback
- Verify localStorage permissions
- Inspect documents array state
- Clear browser cache

---

## 🎓 Learning Resources

### React Hooks Used
- `useState` - Document list, selected document, filters
- `useEffect` - LocalStorage sync, modal status update
- `useRef` - PDF container, file input

### Libraries
- **react-pdf** - PDF rendering
- **react-konva** - Canvas annotations
- **axios** - HTTP requests

### Patterns
- **Controlled components** - Form inputs
- **Lift state up** - Parent-child communication
- **Render props** - Flexible component composition
- **CSS modules** - Scoped styling

---

## 📞 Support

**Issues?** Check these first:
1. Backend running? `curl http://127.0.0.1:3001/process-document`
2. Frontend running? Open http://localhost:3000
3. Console errors? Check browser DevTools
4. LocalStorage full? Clear data

**Need Help?**
- Review `ROSSUM_WORKFLOW_COMPLETE.md` for detailed docs
- Check `PHASE2_COMPLETE.md` for implementation details
- Inspect browser console for detailed errors

---

**Ready to process documents like Rossum AI!** 🚀

Upload your first document and experience the workflow in action.
