/**
 * Annotation Storage Service
 * Manages saving, loading, and exporting document annotations
 */

const STORAGE_KEY = "schemaxtract_annotations";

/**
 * Annotation schema:
 * {
 *   id: string (UUID)
 *   documentName: string
 *   uploadDate: timestamp
 *   reviewDate: timestamp
 *   fields: Array<{
 *     id: number,
 *     label: string,
 *     value: string,
 *     bbox: [x1, y1, x2, y2],
 *     confidence: number,
 *     source: string
 *   }>
 *   metadata: {
 *     filename: string,
 *     mimeType: string,
 *     fileSize: number,
 *     ocrEngine: string,
 *     model: string
 *   }
 *   base64Image?: string (optional - for preview)
 * }
 */

class AnnotationService {
  /**
   * Get all saved annotations
   */
  getAllAnnotations() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Get a single annotation by ID
   */
  getAnnotation(id) {
    const annotations = this.getAllAnnotations();
    return annotations.find((a) => a.id === id);
  }

  /**
   * Save new annotation (after user confirms review)
   */
  saveAnnotation(annotationData) {
    const annotations = this.getAllAnnotations();

    const newAnnotation = {
      id: `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      uploadDate: annotationData.uploadDate || Date.now(),
      reviewDate: Date.now(),
      documentName: annotationData.filename || "Untitled Document",
      fields: annotationData.fields || [],
      metadata: annotationData.metadata || {},
      base64Image: annotationData.base64Image, // Optional preview
    };

    annotations.push(newAnnotation);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));

    console.log("[AnnotationService] Saved annotation:", newAnnotation.id);
    return newAnnotation;
  }

  /**
   * Update an existing annotation
   */
  updateAnnotation(id, updates) {
    const annotations = this.getAllAnnotations();
    const index = annotations.findIndex((a) => a.id === id);

    if (index === -1) {
      throw new Error(`Annotation ${id} not found`);
    }

    annotations[index] = {
      ...annotations[index],
      ...updates,
      id, // Preserve ID
      reviewDate: Date.now(), // Update review timestamp
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    return annotations[index];
  }

  /**
   * Delete an annotation
   */
  deleteAnnotation(id) {
    const annotations = this.getAllAnnotations();
    const filtered = annotations.filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered.length < annotations.length;
  }

  /**
   * Export annotation as JSON (fields and values only)
   */
  exportAsJSON(annotation) {
    const data = {};

    // Convert fields array to key-value pairs
    annotation.fields.forEach((field) => {
      data[field.label] = field.value || "";
    });

    return JSON.stringify(data, null, 2);
  }

  /**
   * Export annotation as CSV (fields and values only)
   */
  exportAsCSV(annotation) {
    const rows = [["Field", "Value"]];

    annotation.fields.forEach((field) => {
      rows.push([field.label, field.value || ""]);
    });

    return rows.map((row) => row.join(",")).join("\n");
  }

  /**
   * Export annotation as structured XML format (Rossum-style)
   * Organizes fields into sections: basic_info, amounts, vendor, line_items
   */
  exportAsXML(annotation) {
    const escapeXml = (str) => {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    };

    // Helper to get field value by label/pattern
    const getFieldValue = (pattern) => {
      const field = annotation.fields.find((f) => {
        const label = f.label?.toLowerCase() || "";
        const fieldName = f.field_name?.toLowerCase() || "";
        const searchPattern = pattern.toLowerCase();
        return label.includes(searchPattern) || fieldName.includes(searchPattern);
      });
      return field ? escapeXml(field.value) : "";
    };

    // Helper to get all fields matching a pattern (returns array)
    const getFieldsByPattern = (pattern) => {
      return annotation.fields.filter((f) => {
        const label = f.label?.toLowerCase() || "";
        const fieldName = f.field_name?.toLowerCase() || "";
        const searchPattern = pattern.toLowerCase();
        return label.includes(searchPattern) || fieldName.includes(searchPattern);
      });
    };

    // Group line items by row
    const lineItemFields = annotation.fields.filter((f) => {
      const label = f.label?.toLowerCase() || "";
      return label.includes("_row_") || label.includes("item_");
    });

    // Extract row numbers and group items
    const lineItems = {};
    lineItemFields.forEach((field) => {
      const match = field.label?.match(/_row_(\d+)/);
      if (match) {
        const rowNum = match[1];
        if (!lineItems[rowNum]) {
          lineItems[rowNum] = {};
        }
        // Extract field name without row suffix
        const fieldName = field.label.replace(/_row_\d+/, "");
        lineItems[rowNum][fieldName] = escapeXml(field.value);
      }
    });

    // Build XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += "<RossumInvoice>\n";

    // Metadata section
    xml += "  <Metadata>\n";
    xml += `    <AnnotationId>${annotation.id || ""}</AnnotationId>\n`;
    xml += `    <Status>exported</Status>\n`;
    xml += `    <ModifiedAt>${new Date(annotation.reviewDate || Date.now()).toISOString()}</ModifiedAt>\n`;
    xml += "  </Metadata>\n";

    // Basic info section
    xml += "  <basic_info_section>\n";
    xml += `    <document_id>${getFieldValue("invoice_number") || getFieldValue("document_id")}</document_id>\n`;
    xml += `    <date_issue>${getFieldValue("invoice_date") || getFieldValue("date_issue")}</date_issue>\n`;
    xml += `    <document_type>${getFieldValue("document_type") || "invoice"}</document_type>\n`;
    xml += `    <language>${getFieldValue("language") || ""}</language>\n`;
    xml += `    <date_due>${getFieldValue("date_due") || getFieldValue("due_date")}</date_due>\n`;
    xml += `    <order_id>${getFieldValue("order_id") || getFieldValue("po_number")}</order_id>\n`;
    xml += `    <customer_id>${getFieldValue("customer_id")}</customer_id>\n`;
    xml += `    <date_uzp>${getFieldValue("date_uzp")}</date_uzp>\n`;
    xml += "  </basic_info_section>\n";

    // Amounts section
    xml += "  <amounts_section>\n";
    xml += `    <amount_total_base>${getFieldValue("subtotal") || getFieldValue("amount_total_base")}</amount_total_base>\n`;
    xml += `    <amount_total_tax>${getFieldValue("tax") || getFieldValue("amount_total_tax")}</amount_total_tax>\n`;
    xml += `    <amount_total>${getFieldValue("total") || getFieldValue("amount_total")}</amount_total>\n`;
    xml += `    <amount_due>${getFieldValue("amount_due") || getFieldValue("total")}</amount_due>\n`;
    xml += `    <amount_rounding>${getFieldValue("amount_rounding")}</amount_rounding>\n`;
    xml += `    <amount_paid>${getFieldValue("amount_paid")}</amount_paid>\n`;
    xml += `    <currency>${getFieldValue("currency")}</currency>\n`;
    xml += `    <tax_details>${getFieldValue("tax_details")}</tax_details>\n`;
    xml += "  </amounts_section>\n";

    // Vendor section
    xml += "  <vendor_section>\n";
    xml += `    <sender_name>${getFieldValue("vendor") || getFieldValue("sender_name")}</sender_name>\n`;
    xml += `    <sender_address>${getFieldValue("vendor_address") || getFieldValue("sender_address")}</sender_address>\n`;
    xml += `    <sender_vat_id>${getFieldValue("vendor_vat") || getFieldValue("sender_vat_id")}</sender_vat_id>\n`;
    xml += `    <sender_ic>${getFieldValue("sender_ic")}</sender_ic>\n`;
    xml += `    <recipient_name>${getFieldValue("customer") || getFieldValue("recipient_name")}</recipient_name>\n`;
    xml += `    <recipient_address>${getFieldValue("customer_address") || getFieldValue("recipient_address")}</recipient_address>\n`;
    xml += `    <recipient_ic>${getFieldValue("recipient_ic")}</recipient_ic>\n`;
    xml += `    <recipient_vat_id>${getFieldValue("customer_vat") || getFieldValue("recipient_vat_id")}</recipient_vat_id>\n`;
    xml += "  </vendor_section>\n";

    // Payment info section
    xml += "  <payment_info_section>\n";
    xml += `    <account_num>${getFieldValue("account_num")}</account_num>\n`;
    xml += `    <bank_num>${getFieldValue("bank_num")}</bank_num>\n`;
    xml += `    <iban>${getFieldValue("iban")}</iban>\n`;
    xml += `    <bic>${getFieldValue("bic")}</bic>\n`;
    xml += `    <terms>${getFieldValue("terms") || getFieldValue("payment_terms")}</terms>\n`;
    xml += `    <payment_state>${getFieldValue("payment_state")}</payment_state>\n`;
    xml += `    <const_sym>${getFieldValue("const_sym")}</const_sym>\n`;
    xml += `    <var_sym>${getFieldValue("var_sym")}</var_sym>\n`;
    xml += `    <spec_sym>${getFieldValue("spec_sym")}</spec_sym>\n`;
    xml += "  </payment_info_section>\n";

    // Line items section
    xml += "  <line_items_section>\n";
    xml += "    <line_items>\n";

    // Sort line items by row number
    const sortedRows = Object.keys(lineItems).sort((a, b) => parseInt(a) - parseInt(b));
    
    sortedRows.forEach((rowNum) => {
      const item = lineItems[rowNum];
      xml += "      <Item>\n";
      xml += `        <item_quantity>${item.item_quantity || item.quantity || ""}</item_quantity>\n`;
      xml += `        <item_code>${item.item_code || item.product_code || item.hs_code || ""}</item_code>\n`;
      xml += `        <item_description>${item.item_description || item.description || ""}</item_description>\n`;
      xml += `        <item_amount_base>${item.item_amount_base || item.unit_price || ""}</item_amount_base>\n`;
      xml += `        <item_total_base>${item.item_total_base || item.total_price || item.net_price || ""}</item_total_base>\n`;
      xml += `        <item_amount_total>${item.item_amount_total || item.total_price || ""}</item_amount_total>\n`;
      xml += `        <item_uom>${item.item_uom || item.unit || ""}</item_uom>\n`;
      xml += `        <item_rate>${item.item_rate || ""}</item_rate>\n`;
      xml += `        <item_tax>${item.item_tax || ""}</item_tax>\n`;
      xml += `        <item_amount>${item.item_amount || item.unit_price || ""}</item_amount>\n`;
      xml += `        <item_other>${item.item_other || item.country_of_origin || ""}</item_other>\n`;
      xml += `        <gross_weight>${item.gross_weight || item.item_gross_weight || ""}</gross_weight>\n`;
      xml += `        <customs_weight>${item.customs_weight || item.net_weight || item.item_net_weight || ""}</customs_weight>\n`;
      xml += `        <hscode>${item.hscode || item.hs_code || item.item_code || ""}</hscode>\n`;
      xml += `        <item_origin>${item.item_origin || item.country_of_origin || ""}</item_origin>\n`;
      xml += "      </Item>\n";
    });

    xml += "    </line_items>\n";
    xml += "  </line_items_section>\n";

    // Other section
    xml += "  <other_section>\n";
    xml += `    <notes>${getFieldValue("notes") || ""}</notes>\n`;
    xml += "  </other_section>\n";

    xml += "</RossumInvoice>";

    return xml;
  }

  /**
   * Download file with annotation data
   */
  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Export and download annotation in specified format
   */
  exportAnnotation(annotation, format = "json") {
    const timestamp = new Date(annotation.reviewDate)
      .toISOString()
      .split("T")[0];
    const baseName = annotation.documentName.replace(/\.[^/.]+$/, ""); // Remove extension

    let content, filename, mimeType;

    switch (format.toLowerCase()) {
      case "json":
        content = this.exportAsJSON(annotation);
        filename = `${baseName}_${timestamp}.json`;
        mimeType = "application/json";
        break;

      case "csv":
        content = this.exportAsCSV(annotation);
        filename = `${baseName}_${timestamp}.csv`;
        mimeType = "text/csv";
        break;

      case "xml":
        content = this.exportAsXML(annotation);
        filename = `${baseName}_${timestamp}.xml`;
        mimeType = "application/xml";
        break;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    this.downloadFile(filename, content, mimeType);
    console.log(`[AnnotationService] Exported ${filename}`);
  }

  /**
   * Clear all annotations
   */
  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Get annotation statistics
   */
  getStats() {
    const annotations = this.getAllAnnotations();
    return {
      total: annotations.length,
      totalFields: annotations.reduce(
        (sum, a) => sum + (a.fields?.length || 0),
        0
      ),
      avgFieldsPerDoc:
        annotations.length > 0
          ? (
              annotations.reduce((sum, a) => sum + (a.fields?.length || 0), 0) /
              annotations.length
            ).toFixed(1)
          : 0,
    };
  }
}

export default new AnnotationService();
