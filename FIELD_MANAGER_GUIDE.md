# Field Manager - User Guide

## Overview

The Field Manager allows you to create and manage custom field definitions that the AI model uses to extract data from documents. Instead of extracting predefined fields, you can now configure exactly what information you want to extract.

## Features

### 📋 Custom Field Definitions
- **Name**: Human-readable field name (e.g., "Invoice Number")
- **Key**: Machine-readable identifier (e.g., "invoice_number")
- **Type**: Data type (text, number, date, currency, email, phone, address)
- **AI Question**: The question the AI asks to extract this field
- **Category**: Logical grouping (invoice, vendor, customer, amounts, etc.)
- **Required**: Mark critical fields as required
- **Description**: Help text for users

### 🎨 Field Templates
Pre-built field sets for common document types:
- **Commercial Invoice** - Complete invoice fields (number, date, amounts, vendor, etc.)
- **Receipt** - Retail receipt fields (store, transaction date, total)
- **Purchase Order** - PO fields (number, date, supplier, shipping)

### 📤 Import/Export
- Export your field definitions as JSON
- Import field sets from other projects
- Share configurations across teams

## How It Works

### 1. Define Your Fields

Navigate to the **Fields** tab in the main navigation. Here you can:

**Option A: Load a Template**
1. Click "📚 Templates"
2. Select a template (Invoice, Receipt, PO)
3. Customize as needed

**Option B: Create Custom Fields**
1. Click "➕ Add Field"
2. Fill in the form:
   - **Field Name**: What users see
   - **Field Key**: Internal identifier (auto-generated from name)
   - **Type**: Select data type
   - **Category**: Group related fields
   - **AI Question**: How the AI should extract this field
   - **Description**: Help text
3. Click "Create Field"

### 2. Upload Documents

Once fields are defined:
1. Switch to **📄 Documents** tab
2. Upload a document (PDF or image)
3. The system automatically uses your custom fields to extract data

### 3. Review & Adjust

After extraction:
- Review extracted values in the document viewer
- Adjust bounding boxes if needed
- System learns from your corrections

## Example Field Definitions

### Invoice Number
```json
{
  "name": "Invoice Number",
  "key": "invoice_number",
  "type": "text",
  "question": "What is the invoice number?",
  "category": "invoice",
  "required": true
}
```

### Total Amount
```json
{
  "name": "Total Amount",
  "key": "total_amount",
  "type": "currency",
  "question": "What is the total amount?",
  "category": "amounts",
  "required": true
}
```

### Vendor Name
```json
{
  "name": "Vendor Name",
  "key": "vendor_name",
  "type": "text",
  "question": "What is the vendor name?",
  "category": "vendor",
  "required": true
}
```

## AI Question Best Practices

The AI uses LayoutLM document question-answering. Write questions that are:

✅ **Good Questions**
- "What is the invoice number?"
- "What is the total amount?"
- "What is the vendor name?"
- "What is the invoice date?"

❌ **Avoid**
- "Find invoice number" (not a question)
- "Where is the total?" (too vague)
- "Invoice #?" (incomplete question)

## Data Flow

```
User Defines Fields → Upload Document → Backend receives custom_fields →
Donut Service uses questions → LayoutLM extracts data → Results displayed
```

### Technical Details

1. **Storage**: Fields are stored in browser localStorage
2. **Format**: JSON array of field objects
3. **Transmission**: Sent with each document upload request
4. **Processing**: Donut service dynamically generates questions
5. **Extraction**: LayoutLM model answers each question on the document

## Field Types

| Type | Description | Example |
|------|-------------|---------|
| `text` | Any text string | "ABC Company" |
| `number` | Numeric value | "12345" |
| `date` | Date in any format | "01/15/2024" |
| `currency` | Monetary amount | "$1,234.56" |
| `email` | Email address | "contact@example.com" |
| `phone` | Phone number | "+1-555-0123" |
| `address` | Full address | "123 Main St, City, State" |

## Categories

Organize fields logically:
- **invoice** - Document identifiers (number, date, PO)
- **vendor** - Seller information (name, address, tax ID)
- **customer** - Buyer information (name, address)
- **amounts** - Financial values (subtotal, tax, total)
- **shipping** - Delivery information
- **other** - Miscellaneous fields

## Tips & Tricks

### Performance
- Limit to 10-15 fields per document type for optimal speed
- Each field adds ~5-10 seconds processing time
- Group related information when possible

### Accuracy
- Use clear, specific questions
- Provide examples in field descriptions
- Test with sample documents
- Adjust questions if extraction is poor

### Organization
- Use consistent naming conventions
- Group by category
- Add descriptions for team members
- Export configurations regularly

### Reusability
- Create templates for document types you process often
- Export successful configurations
- Share JSON files with team
- Import pre-configured field sets

## Troubleshooting

### Fields Not Extracting
1. Check AI question clarity
2. Verify field type matches data
3. Test with different document samples
4. Check if data exists in document

### Poor Accuracy
1. Rephrase AI questions
2. Ensure questions are specific
3. Check document quality (scans, resolution)
4. Try different question formats

### Missing Data
1. Verify field is in document
2. Check bounding box visualization
3. Try re-extraction with bbox adjustment
4. Review confidence scores

## Advanced Features

### Custom Validation
While not yet implemented, future versions will support:
- Regex pattern matching
- Min/max value constraints
- Date format specifications
- Required field validation

### Field Dependencies
Coming soon:
- Conditional fields (if A exists, extract B)
- Calculated fields (total = subtotal + tax)
- Field relationships

## API Integration

Custom fields are automatically sent with document processing:

```javascript
const customFields = fieldService.getFieldsAsQuestions();

axios.post('/api/process-document', {
  document: base64Data,
  filename: file.name,
  mimeType: file.type,
  customFields: customFields  // Sent to backend
});
```

Backend forwards to Donut service:

```python
donut_result = call_donut_service(
    document_data, 
    file_format, 
    custom_fields  # Uses custom questions
)
```

## Keyboard Shortcuts

- **Tab Navigation**: Switch between Documents and Fields
- **Esc**: Close field editor
- **Ctrl/Cmd + S**: Save field (when editing)

## Support

For issues or feature requests, check:
- Field template examples
- Sample documents in test suite
- Backend logs for extraction errors
- Frontend console for UI errors
