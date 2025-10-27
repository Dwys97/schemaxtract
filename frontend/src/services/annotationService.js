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
   * Export annotation as JSON
   */
  exportAsJSON(annotation) {
    const data = {
      document: annotation.documentName,
      reviewed: new Date(annotation.reviewDate).toISOString(),
      fields: annotation.fields.map((f) => ({
        field: f.label,
        value: f.value,
        confidence: f.confidence,
        bbox: f.bbox,
      })),
      metadata: annotation.metadata,
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Export annotation as CSV
   */
  exportAsCSV(annotation) {
    const rows = [
      [
        "Field",
        "Value",
        "Confidence",
        "BBox X1",
        "BBox Y1",
        "BBox X2",
        "BBox Y2",
      ],
    ];

    annotation.fields.forEach((field) => {
      const bbox = field.bbox || [0, 0, 0, 0];
      rows.push([
        field.label,
        field.value,
        field.confidence?.toFixed(2) || "0.00",
        bbox[0],
        bbox[1],
        bbox[2],
        bbox[3],
      ]);
    });

    return rows.map((row) => row.join(",")).join("\n");
  }

  /**
   * Export annotation as ROSSUMXML format
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

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += "<document>\n";
    xml += `  <metadata>\n`;
    xml += `    <filename>${escapeXml(annotation.documentName)}</filename>\n`;
    xml += `    <reviewed>${new Date(
      annotation.reviewDate
    ).toISOString()}</reviewed>\n`;
    xml += `    <engine>${escapeXml(
      annotation.metadata?.ocr_engine || "unknown"
    )}</engine>\n`;
    xml += `    <model>${escapeXml(
      annotation.metadata?.model || "unknown"
    )}</model>\n`;
    xml += `  </metadata>\n`;
    xml += `  <fields>\n`;

    annotation.fields.forEach((field) => {
      const bbox = field.bbox || [0, 0, 0, 0];
      xml += `    <field>\n`;
      xml += `      <label>${escapeXml(field.label)}</label>\n`;
      xml += `      <value>${escapeXml(field.value)}</value>\n`;
      xml += `      <confidence>${
        field.confidence?.toFixed(2) || "0.00"
      }</confidence>\n`;
      xml += `      <bbox>\n`;
      xml += `        <x1>${bbox[0]}</x1>\n`;
      xml += `        <y1>${bbox[1]}</y1>\n`;
      xml += `        <x2>${bbox[2]}</x2>\n`;
      xml += `        <y2>${bbox[3]}</y2>\n`;
      xml += `      </bbox>\n`;
      xml += `    </field>\n`;
    });

    xml += `  </fields>\n`;
    xml += "</document>";

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
