/**
 * Template Service - Few-Shot Learning for Document Extraction
 * Manages document templates to improve field extraction accuracy
 */

const STORAGE_KEY = "schemaxtract_templates";
const DONUT_SERVICE_URL = "http://127.0.0.1:3002";

export const templateService = {
  /**
   * Save a confirmed document as a template
   * @param {Object} document - Confirmed document with annotations
   * @param {string} templateName - Optional custom name for template
   */
  saveAsTemplate(document, templateName = null) {
    try {
      const templates = this.getAllTemplates();

      // Generate template name from vendor or use custom name
      const name = templateName || this.suggestTemplateName(document);

      const template = {
        id: `template_${Date.now()}`,
        name: name,
        documentId: document.id,
        filename: document.filename,
        createdAt: new Date().toISOString(),
        fields: document.fields.map((f) => ({
          label: f.label,
          value: f.value,
          bbox: f.bbox,
          confidence: f.confidence,
          type: this.inferFieldType(f.label),
        })),
        metadata: {
          ...document.metadata,
          originalStatus: document.status,
          fieldCount: document.fields?.length || 0,
        },
        // Store image data URL for visual matching (optional)
        imagePreview: document.imageUrl || null,
      };

      templates[template.id] = template;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));

      console.log(`[Template] Saved: ${name}`, template);
      return template;
    } catch (error) {
      console.error("[Template] Save error:", error);
      throw error;
    }
  },

  /**
   * Get all saved templates
   */
  getAllTemplates() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error("[Template] Load error:", error);
      return {};
    }
  },

  /**
   * Get templates as array
   */
  listTemplates() {
    const templates = this.getAllTemplates();
    return Object.values(templates).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  },

  /**
   * Get a specific template by ID
   */
  getTemplate(templateId) {
    const templates = this.getAllTemplates();
    return templates[templateId] || null;
  },

  /**
   * Delete a template
   */
  deleteTemplate(templateId) {
    try {
      const templates = this.getAllTemplates();
      if (templates[templateId]) {
        delete templates[templateId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
        console.log(`[Template] Deleted: ${templateId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error("[Template] Delete error:", error);
      throw error;
    }
  },

  /**
   * Find matching templates based on extracted fields
   * Uses field similarity to suggest best template
   */
  findMatchingTemplates(fields, topK = 3) {
    const templates = this.listTemplates();
    if (templates.length === 0) return [];

    // Score each template based on field overlap
    const scored = templates.map((template) => {
      const templateFieldLabels = new Set(
        template.fields.map((f) => f.label.toLowerCase())
      );
      const documentFieldLabels = new Set(
        fields.map((f) => f.label.toLowerCase())
      );

      // Calculate Jaccard similarity
      const intersection = new Set(
        [...documentFieldLabels].filter((x) => templateFieldLabels.has(x))
      );
      const union = new Set([...documentFieldLabels, ...templateFieldLabels]);

      const similarity = union.size > 0 ? intersection.size / union.size : 0;

      // Bonus for vendor name match
      const docVendor = fields
        .find((f) => f.label.toLowerCase().includes("vendor"))
        ?.value?.toLowerCase();
      const templateVendor = template.fields
        .find((f) => f.label.toLowerCase().includes("vendor"))
        ?.value?.toLowerCase();

      const vendorBonus =
        docVendor && templateVendor && docVendor.includes(templateVendor)
          ? 0.3
          : 0;

      return {
        template,
        score: similarity + vendorBonus,
        matchedFields: intersection.size,
      };
    });

    // Sort by score and return top K
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter((s) => s.score > 0.2); // Minimum similarity threshold
  },

  /**
   * Apply template hints to improve field extraction
   * Returns suggested bbox locations based on template
   */
  applyTemplateHints(template, currentFields) {
    const hints = [];

    template.fields.forEach((templateField) => {
      // Check if field exists in current extraction
      const currentField = currentFields.find(
        (f) => f.label.toLowerCase() === templateField.label.toLowerCase()
      );

      if (!currentField) {
        // Field missing - suggest looking at template's bbox location
        hints.push({
          label: templateField.label,
          suggestedBbox: templateField.bbox,
          type: templateField.type,
          source: "template_hint",
          confidence: 0.6, // Lower confidence for template hints
          fromTemplate: template.id,
        });
      } else if (currentField.confidence < 0.7) {
        // Field has low confidence - template bbox might help
        hints.push({
          ...currentField,
          alternativeBbox: templateField.bbox,
          templateConfidence: templateField.confidence,
          source: "template_boost",
        });
      }
    });

    return hints;
  },

  /**
   * Suggest template name from document
   */
  suggestTemplateName(document) {
    // Try to find vendor name in fields
    const vendorField = document.fields?.find(
      (f) =>
        f.label.toLowerCase().includes("vendor") ||
        f.label.toLowerCase().includes("supplier") ||
        f.label.toLowerCase().includes("seller")
    );

    if (vendorField?.value) {
      return vendorField.value
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);
    }

    // Fallback to filename
    return document.filename
      .replace(/\.[^/.]+$/, "") // Remove extension
      .replace(/[^a-zA-Z0-9]/g, "_")
      .substring(0, 50);
  },

  /**
   * Infer field type from label
   */
  inferFieldType(label) {
    const lower = label.toLowerCase();

    if (lower.includes("date")) return "date";
    if (
      lower.includes("amount") ||
      lower.includes("total") ||
      lower.includes("price") ||
      lower.includes("cost")
    )
      return "currency";
    if (
      lower.includes("number") ||
      lower.includes("id") ||
      lower.includes("code")
    )
      return "number";
    if (lower.includes("email")) return "email";
    if (lower.includes("phone") || lower.includes("tel")) return "phone";

    return "text";
  },

  /**
   * Export templates as JSON file
   */
  exportTemplates() {
    const templates = this.getAllTemplates();
    const blob = new Blob([JSON.stringify(templates, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schemaxtract_templates_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Import templates from JSON file
   */
  async importTemplates(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          const existing = this.getAllTemplates();
          const merged = { ...existing, ...imported };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          console.log(
            `[Template] Imported ${Object.keys(imported).length} templates`
          );
          resolve(Object.keys(imported).length);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  /**
   * Get template statistics
   */
  getStats() {
    const templates = this.listTemplates();
    return {
      total: templates.length,
      byVendor: templates.reduce((acc, t) => {
        const vendor = t.name;
        acc[vendor] = (acc[vendor] || 0) + 1;
        return acc;
      }, {}),
      avgFieldsPerTemplate:
        templates.length > 0
          ? templates.reduce((sum, t) => sum + t.fields.length, 0) /
            templates.length
          : 0,
      oldestTemplate:
        templates.length > 0 ? templates[templates.length - 1].createdAt : null,
      newestTemplate: templates.length > 0 ? templates[0].createdAt : null,
    };
  },
};

export default templateService;
