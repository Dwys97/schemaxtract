/**
 * Template Service - Manage vendor invoice templates
 * Handles saving, loading, and applying learned field layouts
 */

const DONUT_SERVICE_URL = "http://127.0.0.1:3002";

export const templateService = {
  /**
   * Save a template for a vendor
   * @param {string} vendorName - Vendor identifier
   * @param {Array} fields - Field definitions with bboxes
   * @param {Object} metadata - Additional template info
   */
  async saveTemplate(vendorName, fields, metadata = {}) {
    try {
      const response = await fetch(`${DONUT_SERVICE_URL}/templates/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendor_name: vendorName,
          fields: fields.map((f) => ({
            field_name: f.field_name,
            bbox: f.bbox,
            field_type: f.field_type || "text",
            required: f.required || false,
          })),
          metadata: {
            ...metadata,
            field_count: fields.length,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save template: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("[Template] Saved:", vendorName, data);
      return data;
    } catch (error) {
      console.error("[Template] Save error:", error);
      throw error;
    }
  },

  /**
   * Load a saved template
   * @param {string} vendorName - Vendor identifier
   */
  async loadTemplate(vendorName) {
    try {
      const response = await fetch(
        `${DONUT_SERVICE_URL}/templates/load/${vendorName}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null; // Template doesn't exist
        }
        throw new Error(`Failed to load template: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("[Template] Loaded:", vendorName, data);
      return data.template;
    } catch (error) {
      console.error("[Template] Load error:", error);
      throw error;
    }
  },

  /**
   * List all saved templates
   */
  async listTemplates() {
    try {
      const response = await fetch(`${DONUT_SERVICE_URL}/templates/list`);

      if (!response.ok) {
        throw new Error(`Failed to list templates: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("[Template] Available templates:", data.templates);
      return data.templates;
    } catch (error) {
      console.error("[Template] List error:", error);
      throw error;
    }
  },

  /**
   * Delete a template
   * @param {string} vendorName - Vendor identifier
   */
  async deleteTemplate(vendorName) {
    try {
      const response = await fetch(
        `${DONUT_SERVICE_URL}/templates/delete/${vendorName}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to delete template: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("[Template] Deleted:", vendorName);
      return data;
    } catch (error) {
      console.error("[Template] Delete error:", error);
      throw error;
    }
  },

  /**
   * Suggest a vendor name from extracted data
   * @param {Array} fields - Current extracted fields
   */
  suggestVendorName(fields) {
    // Look for vendor/supplier field
    const vendorField = fields.find(
      (f) =>
        f.field_name &&
        (f.field_name.toLowerCase().includes("vendor") ||
          f.field_name.toLowerCase().includes("supplier") ||
          f.field_name.toLowerCase().includes("from"))
    );

    if (vendorField && vendorField.value) {
      // Clean up the name
      return vendorField.value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .trim();
    }

    // Fallback to generic name
    return `vendor_${Date.now()}`;
  },
};

export default templateService;
