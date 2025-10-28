/**
 * Field Management Service
 * Handles CRUD operations for custom field definitions
 */

const STORAGE_KEY = "schemaxtract_custom_fields";
const TEMPLATES_KEY = "schemaxtract_field_templates";

/**
 * Field definition schema:
 * {
 *   id: string (UUID)
 *   name: string (display name)
 *   key: string (machine-readable key, e.g., "invoice_number")
 *   type: 'text' | 'number' | 'date' | 'currency' | 'email' | 'phone' | 'address'
 *   question: string (question for LayoutLM, e.g., "What is the invoice number?")
 *   description: string (help text for users)
 *   required: boolean
 *   validation: {
 *     pattern?: string (regex pattern)
 *     min?: number (for numbers/currency)
 *     max?: number (for numbers/currency)
 *     format?: string (date format)
 *   }
 *   category: string (e.g., "invoice", "vendor", "line_items")
 *   defaultValue?: any
 *   examples?: string[] (example values to help users)
 *   createdAt: timestamp
 *   updatedAt: timestamp
 * }
 */

/**
 * Field template/preset schema:
 * {
 *   id: string
 *   name: string (e.g., "Commercial Invoice", "Receipt", "Purchase Order")
 *   description: string
 *   fields: Field[] (array of field definitions)
 *   icon?: string
 * }
 */

// Default field templates
const DEFAULT_TEMPLATES = [
  {
    id: "template_invoice",
    name: "Commercial Invoice",
    description: "Standard fields for commercial invoices",
    icon: "📄",
    fields: [
      {
        id: "field_inv_number",
        name: "Invoice Number",
        key: "invoice_number",
        type: "text",
        question: "What is the invoice number?",
        description: "Unique invoice identifier",
        required: true,
        category: "invoice",
        examples: ["INV-2024-001", "TLS-2024-123"],
      },
      {
        id: "field_inv_date",
        name: "Invoice Date",
        key: "invoice_date",
        type: "date",
        question: "What is the invoice date?",
        description: "Date the invoice was issued",
        required: true,
        category: "invoice",
        validation: {
          format: "MM/DD/YYYY",
        },
        examples: ["01/15/2024", "2024-01-15"],
      },
      {
        id: "field_due_date",
        name: "Due Date",
        key: "due_date",
        type: "date",
        question: "What is the payment due date?",
        description: "Date payment is due",
        required: false,
        category: "invoice",
        examples: ["02/15/2024"],
      },
      {
        id: "field_vendor_name",
        name: "Vendor Name",
        key: "vendor_name",
        type: "text",
        question: "What is the vendor name?",
        description: "Name of the company issuing the invoice",
        required: true,
        category: "vendor",
        examples: ["Acme Corporation", "Tech Solutions Ltd"],
      },
      {
        id: "field_vendor_address",
        name: "Vendor Address",
        key: "vendor_address",
        type: "address",
        question: "What is the vendor address?",
        description: "Full address of the vendor",
        required: false,
        category: "vendor",
      },
      {
        id: "field_customer_name",
        name: "Customer Name",
        key: "customer_name",
        type: "text",
        question: "What is the customer name?",
        description: "Name of the customer/bill to",
        required: false,
        category: "customer",
        examples: ["ABC Company", "John Smith"],
      },
      {
        id: "field_po_number",
        name: "PO Number",
        key: "po_number",
        type: "text",
        question: "What is the PO number?",
        description: "Purchase order number",
        required: false,
        category: "invoice",
        examples: ["PO-2024-456"],
      },
      {
        id: "field_subtotal",
        name: "Subtotal",
        key: "subtotal",
        type: "currency",
        question: "What is the subtotal amount?",
        description: "Amount before tax",
        required: false,
        category: "amounts",
        validation: {
          min: 0,
        },
      },
      {
        id: "field_tax",
        name: "Tax Amount",
        key: "tax_amount",
        type: "currency",
        question: "What is the tax amount?",
        description: "Total tax charged",
        required: false,
        category: "amounts",
        validation: {
          min: 0,
        },
      },
      {
        id: "field_total",
        name: "Total Amount",
        key: "total_amount",
        type: "currency",
        question: "What is the total amount?",
        description: "Final total including tax",
        required: true,
        category: "amounts",
        validation: {
          min: 0,
        },
      },
    ],
  },
  {
    id: "template_receipt",
    name: "Receipt",
    description: "Fields for retail receipts",
    icon: "🧾",
    fields: [
      {
        id: "field_receipt_number",
        name: "Receipt Number",
        key: "receipt_number",
        type: "text",
        question: "What is the receipt number?",
        description: "Receipt identifier",
        required: true,
        category: "receipt",
      },
      {
        id: "field_store_name",
        name: "Store Name",
        key: "store_name",
        type: "text",
        question: "What is the store name?",
        description: "Name of the retail store",
        required: true,
        category: "vendor",
      },
      {
        id: "field_transaction_date",
        name: "Transaction Date",
        key: "transaction_date",
        type: "date",
        question: "What is the transaction date?",
        description: "Date of purchase",
        required: true,
        category: "receipt",
      },
      {
        id: "field_receipt_total",
        name: "Total",
        key: "total",
        type: "currency",
        question: "What is the total amount?",
        description: "Total amount paid",
        required: true,
        category: "amounts",
      },
    ],
  },
  {
    id: "template_purchase_order",
    name: "Purchase Order",
    description: "Fields for purchase orders",
    icon: "📋",
    fields: [
      {
        id: "field_po_num",
        name: "PO Number",
        key: "po_number",
        type: "text",
        question: "What is the purchase order number?",
        description: "Purchase order identifier",
        required: true,
        category: "po",
      },
      {
        id: "field_po_date",
        name: "PO Date",
        key: "po_date",
        type: "date",
        question: "What is the purchase order date?",
        description: "Date PO was created",
        required: true,
        category: "po",
      },
      {
        id: "field_supplier",
        name: "Supplier Name",
        key: "supplier_name",
        type: "text",
        question: "What is the supplier name?",
        description: "Name of the supplier",
        required: true,
        category: "vendor",
      },
      {
        id: "field_ship_to",
        name: "Ship To",
        key: "ship_to_address",
        type: "address",
        question: "What is the shipping address?",
        description: "Delivery address",
        required: false,
        category: "shipping",
      },
    ],
  },
  {
    id: "template_customs_invoice",
    name: "Customs Invoice",
    description:
      "Fields for customs/export invoices with exporter, importer, and line item details",
    icon: "🌍",
    fields: [
      // Exporter fields
      {
        id: "field_exporter_name",
        name: "Exporter Name",
        key: "exporter_name",
        type: "text",
        question: "What is the vendor name?",
        description: "Name of the exporter/shipper/seller",
        required: true,
        category: "exporter",
        examples: ["Global Trade Corp", "Export Solutions Ltd"],
      },
      {
        id: "field_exporter_address",
        name: "Exporter Address",
        key: "exporter_address",
        type: "address",
        question: "What is the vendor address?",
        description: "Complete address of the exporter",
        required: true,
        category: "exporter",
        examples: ["123 Export St, London, UK"],
      },
      {
        id: "field_exporter_eori",
        name: "Exporter EORI",
        key: "exporter_eori",
        type: "text",
        question: "What is the vendor tax ID?",
        description: "Economic Operator Registration and Identification number",
        required: true,
        category: "exporter",
        examples: ["GB123456789000", "DE987654321000"],
      },
      {
        id: "field_exporter_tax_id",
        name: "Exporter VAT/Tax ID",
        key: "exporter_tax_id",
        type: "text",
        question: "What is the VAT number?",
        description: "VAT or Tax identification number",
        required: true,
        category: "exporter",
        examples: ["GB999 9999 73", "DE123456789"],
      },
      // Importer fields
      {
        id: "field_importer_name",
        name: "Importer Name",
        key: "importer_name",
        type: "text",
        question: "What is the customer name?",
        description: "Name of the importer/consignee/buyer",
        required: true,
        category: "importer",
        examples: ["Import Trading Inc", "Customs Buyers Co"],
      },
      {
        id: "field_importer_address",
        name: "Importer Address",
        key: "importer_address",
        type: "address",
        question: "What is the shipping address?",
        description: "Complete address of the importer",
        required: true,
        category: "importer",
        examples: ["456 Import Ave, New York, NY 10001"],
      },
      {
        id: "field_importer_eori",
        name: "Importer EORI",
        key: "importer_eori",
        type: "text",
        question: "What is the customer tax ID?",
        description: "Economic Operator Registration and Identification number",
        required: true,
        category: "importer",
        examples: ["US123456789000", "FR987654321000"],
      },
      {
        id: "field_importer_tax_id",
        name: "Importer VAT/Tax ID",
        key: "importer_tax_id",
        type: "text",
        question: "What is the tax ID?",
        description: "VAT or Tax identification number",
        required: true,
        category: "importer",
        examples: ["12-3456789", "FR12345678901"],
      },
      // Amount/Currency fields
      {
        id: "field_invoice_currency",
        name: "Invoice Currency",
        key: "invoice_currency",
        type: "text",
        question: "What is the currency?",
        description: "ISO currency code",
        required: true,
        category: "amounts",
        examples: ["USD", "EUR", "GBP"],
      },
      // Shipping/Weight fields
      {
        id: "field_total_gross_weight",
        name: "Total Gross Weight",
        key: "total_gross_weight",
        type: "number",
        question: "What is the total weight?",
        description: "Total gross weight including packaging",
        required: true,
        category: "shipping",
        validation: {
          min: 0,
        },
        examples: ["150.5", "2500"],
      },
      {
        id: "field_total_net_weight",
        name: "Total Net Weight",
        key: "total_net_weight",
        type: "number",
        question: "What is the net weight?",
        description: "Total net weight of goods only",
        required: true,
        category: "shipping",
        validation: {
          min: 0,
        },
        examples: ["145.0", "2450"],
      },
      // Customs fields
      {
        id: "field_preferential_statement",
        name: "Preferential Statement",
        key: "preferential_statement",
        type: "text",
        question: "What is the origin statement?",
        description: "Statement claiming preferential tariff treatment",
        required: false,
        category: "customs",
        examples: ["REX Number: EU123456789"],
      },
      // Line item fields
      {
        id: "field_item_hs_code",
        name: "HS Code",
        key: "item_hs_code",
        type: "text",
        question: "What is the product code?",
        description: "Harmonized System code for customs classification",
        required: true,
        category: "line_items",
        examples: ["8517.62.00", "6203.42.11"],
      },
      {
        id: "field_item_description",
        name: "Item Description",
        key: "item_description",
        type: "text",
        question: "What is the product description?",
        description: "Detailed commercial description of the goods",
        required: true,
        category: "line_items",
        examples: ["Smartphones", "Cotton trousers"],
      },
      {
        id: "field_item_country_of_origin",
        name: "Country of Origin",
        key: "item_country_of_origin",
        type: "text",
        question: "What is the country of origin?",
        description: "Where the item was manufactured/produced",
        required: true,
        category: "line_items",
        examples: ["China", "Germany", "United States"],
      },
      {
        id: "field_item_quantity",
        name: "Quantity",
        key: "item_quantity",
        type: "number",
        question: "What is the quantity?",
        description: "Number of units",
        required: true,
        category: "line_items",
        validation: {
          min: 0,
        },
        examples: ["100", "500"],
      },
      {
        id: "field_item_unit_of_measure",
        name: "Unit of Measure",
        key: "item_unit_of_measure",
        type: "text",
        question: "What is the unit of measure?",
        description: "Unit of measurement",
        required: true,
        category: "line_items",
        examples: ["PCS", "KGS", "M", "L"],
      },
      {
        id: "field_item_unit_value",
        name: "Unit Value",
        key: "item_unit_value",
        type: "currency",
        question: "What is the unit price?",
        description: "Price per single unit",
        required: true,
        category: "line_items",
        validation: {
          min: 0,
        },
        examples: ["25.00", "150.50"],
      },
      {
        id: "field_item_net_weight",
        name: "Item Net Weight",
        key: "item_net_weight",
        type: "number",
        question: "What is the net weight?",
        description: "Net weight of the line item",
        required: true,
        category: "line_items",
        validation: {
          min: 0,
        },
        examples: ["1.5", "25.0"],
      },
      {
        id: "field_item_gross_weight",
        name: "Item Gross Weight",
        key: "item_gross_weight",
        type: "number",
        question: "What is the gross weight?",
        description: "Gross weight including packaging",
        required: true,
        category: "line_items",
        validation: {
          min: 0,
        },
        examples: ["1.6", "26.5"],
      },
    ],
  },
];

class FieldService {
  constructor() {
    this.initializeTemplates();
  }

  /**
   * Initialize default templates if not already in storage
   */
  initializeTemplates() {
    const existing = localStorage.getItem(TEMPLATES_KEY);
    if (!existing) {
      console.log("[FieldService] Initializing templates for first time");
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(DEFAULT_TEMPLATES));
    } else {
      console.log("[FieldService] Templates already exist in localStorage");
      const stored = JSON.parse(existing);
      console.log(
        `[FieldService] Found ${stored.length} templates:`,
        stored.map((t) => t.name)
      );

      // Check if we have all 4 templates OR if customs invoice needs update
      const customsTemplate = stored.find(
        (t) => t.id === "template_customs_invoice"
      );
      const needsUpdate =
        stored.length < DEFAULT_TEMPLATES.length ||
        (customsTemplate && !customsTemplate.fields[0].examples);

      if (needsUpdate) {
        console.log(
          `[FieldService] ⚠️ Templates need update - re-initializing with latest version`
        );
        localStorage.setItem(TEMPLATES_KEY, JSON.stringify(DEFAULT_TEMPLATES));
      }
    }
  }

  /**
   * Get all custom field definitions
   */
  getAllFields() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Get a single field by ID
   */
  getField(id) {
    const fields = this.getAllFields();
    return fields.find((f) => f.id === id);
  }

  /**
   * Create a new field
   */
  createField(fieldData) {
    const fields = this.getAllFields();

    const newField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...fieldData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    fields.push(newField);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));

    return newField;
  }

  /**
   * Update an existing field
   */
  updateField(id, updates) {
    const fields = this.getAllFields();
    const index = fields.findIndex((f) => f.id === id);

    if (index === -1) {
      throw new Error(`Field with id ${id} not found`);
    }

    fields[index] = {
      ...fields[index],
      ...updates,
      id, // Preserve ID
      updatedAt: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));

    return fields[index];
  }

  /**
   * Delete a field
   */
  deleteField(id) {
    const fields = this.getAllFields();
    const filtered = fields.filter((f) => f.id !== id);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

    return filtered.length < fields.length; // Return true if deleted
  }

  /**
   * Get all field templates
   */
  getTemplates() {
    const stored = localStorage.getItem(TEMPLATES_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_TEMPLATES;
  }

  /**
   * Load fields from a template
   */
  loadTemplate(templateId) {
    const templates = this.getTemplates();
    const template = templates.find((t) => t.id === templateId);

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Add timestamp to each field from template
    const fieldsWithTimestamps = template.fields.map((field) => ({
      ...field,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // Replace all current fields with template fields
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fieldsWithTimestamps));

    return fieldsWithTimestamps;
  }

  /**
   * Export fields as JSON
   */
  exportFields() {
    const fields = this.getAllFields();
    return JSON.stringify(fields, null, 2);
  }

  /**
   * Import fields from JSON
   */
  importFields(jsonString, merge = false) {
    const imported = JSON.parse(jsonString);

    if (!Array.isArray(imported)) {
      throw new Error("Invalid format: expected array of fields");
    }

    let fields;
    if (merge) {
      // Merge with existing fields
      const existing = this.getAllFields();
      fields = [...existing, ...imported];
    } else {
      // Replace all fields
      fields = imported;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));

    return fields;
  }

  /**
   * Get fields grouped by category
   */
  getFieldsByCategory() {
    const fields = this.getAllFields();
    const grouped = {};

    fields.forEach((field) => {
      const cat = field.category || "other";
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(field);
    });

    return grouped;
  }

  /**
   * Convert fields to LayoutLM questions format
   * Used by backend to know what questions to ask
   */
  getFieldsAsQuestions() {
    const fields = this.getAllFields();
    console.log("[FieldService] All fields from storage:", fields);

    const questions = fields.map((field) => ({
      field_key: field.key,
      question: field.question,
      required: field.required,
      type: field.type,
      category: field.category || "other", // Include category for line item detection
    }));

    console.log("[FieldService] Formatted as questions:", questions);
    return questions;
  }

  /**
   * Clear all custom fields
   */
  clearAllFields() {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export default new FieldService();
