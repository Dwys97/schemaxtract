import React, { useState, useEffect } from "react";
import fieldService from "../services/fieldService";
import "./FieldManager.css";

const FieldManager = () => {
  const [fields, setFields] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Field form state
  const [formData, setFormData] = useState({
    name: "",
    key: "",
    type: "text",
    question: "",
    description: "",
    required: false,
    category: "invoice",
  });

  useEffect(() => {
    loadFields();
    loadTemplates();
  }, []);

  const loadFields = () => {
    const allFields = fieldService.getAllFields();
    setFields(allFields);
  };

  const loadTemplates = () => {
    const allTemplates = fieldService.getTemplates();
    setTemplates(allTemplates);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Auto-generate key from name
    if (name === "name" && !editingField) {
      const key = value
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      setFormData((prev) => ({ ...prev, key }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (editingField) {
      // Update existing field
      fieldService.updateField(editingField.id, formData);
    } else {
      // Create new field
      fieldService.createField(formData);
    }

    // Reset form
    resetForm();
    loadFields();
  };

  const handleEdit = (field) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      key: field.key,
      type: field.type,
      question: field.question,
      description: field.description || "",
      required: field.required || false,
      category: field.category || "invoice",
    });
    setIsEditing(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this field?")) {
      fieldService.deleteField(id);
      loadFields();
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      key: "",
      type: "text",
      question: "",
      description: "",
      required: false,
      category: "invoice",
    });
    setEditingField(null);
    setIsEditing(false);
  };

  const handleLoadTemplate = (templateId) => {
    if (window.confirm("This will replace all current fields. Continue?")) {
      fieldService.loadTemplate(templateId);
      loadFields();
      setShowTemplates(false);
    }
  };

  const handleExport = () => {
    const json = fieldService.exportFields();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fields_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        fieldService.importFields(event.target.result, false);
        loadFields();
        alert("Fields imported successfully!");
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  const filteredFields =
    selectedCategory === "all"
      ? fields
      : fields.filter((f) => f.category === selectedCategory);

  const categories = [
    "all",
    ...new Set(fields.map((f) => f.category || "other")),
  ];

  return (
    <div className="field-manager">
      <div className="field-manager-header">
        <h1>📋 Field Manager</h1>
        <p>Define custom fields for document extraction</p>
      </div>

      <div className="field-manager-actions">
        <button
          className="btn btn-primary"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? "✖ Cancel" : "➕ Add Field"}
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => setShowTemplates(!showTemplates)}
        >
          📚 Templates
        </button>

        <button className="btn btn-secondary" onClick={handleExport}>
          ⬇️ Export
        </button>

        <label className="btn btn-secondary" htmlFor="import-file">
          ⬆️ Import
        </label>
        <input
          id="import-file"
          type="file"
          accept=".json"
          onChange={handleImport}
          style={{ display: "none" }}
        />
      </div>

      {/* Templates Section */}
      {showTemplates && (
        <div className="templates-section">
          <h2>Field Templates</h2>
          <div className="templates-grid">
            {templates.map((template) => (
              <div key={template.id} className="template-card">
                <div className="template-icon">{template.icon}</div>
                <h3>{template.name}</h3>
                <p>{template.description}</p>
                <p className="template-count">
                  {template.fields.length} fields
                </p>
                <button
                  className="btn btn-small btn-primary"
                  onClick={() => handleLoadTemplate(template.id)}
                >
                  Load Template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Field Form */}
      {isEditing && (
        <div className="field-form-section">
          <h2>{editingField ? "Edit Field" : "Add New Field"}</h2>
          <form onSubmit={handleSubmit} className="field-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Field Name *</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Invoice Number"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="key">Field Key *</label>
                <input
                  id="key"
                  name="key"
                  type="text"
                  value={formData.key}
                  onChange={handleInputChange}
                  placeholder="e.g., invoice_number"
                  pattern="[a-z0-9_]+"
                  required
                />
                <small>Lowercase letters, numbers, and underscores only</small>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="type">Field Type *</label>
                <select
                  id="type"
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="currency">Currency</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="address">Address</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="category">Category *</label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  required
                >
                  <option value="invoice">Invoice</option>
                  <option value="vendor">Vendor</option>
                  <option value="customer">Customer</option>
                  <option value="amounts">Amounts</option>
                  <option value="shipping">Shipping</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="question">AI Question *</label>
              <input
                id="question"
                name="question"
                type="text"
                value={formData.question}
                onChange={handleInputChange}
                placeholder="e.g., What is the invoice number?"
                required
              />
              <small>Question the AI will ask to extract this field</small>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Help text for users..."
                rows="2"
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="required"
                  checked={formData.required}
                  onChange={handleInputChange}
                />
                <span>Required field</span>
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingField ? "Update Field" : "Create Field"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetForm}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fields List */}
      <div className="fields-section">
        <div className="fields-header">
          <h2>Custom Fields ({fields.length})</h2>

          <div className="category-filter">
            <label>Filter by category:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredFields.length === 0 ? (
          <div className="empty-state">
            <p>📝 No fields defined yet.</p>
            <p>Click "Add Field" or load a template to get started.</p>
          </div>
        ) : (
          <div className="fields-grid">
            {filteredFields.map((field) => (
              <div key={field.id} className="field-card">
                <div className="field-card-header">
                  <h3>{field.name}</h3>
                  {field.required && (
                    <span className="badge required">Required</span>
                  )}
                </div>

                <div className="field-card-body">
                  <div className="field-meta">
                    <span className="field-type">{field.type}</span>
                    <span className="field-category">{field.category}</span>
                  </div>

                  <div className="field-key">
                    <code>{field.key}</code>
                  </div>

                  <div className="field-question">
                    <strong>Question:</strong> {field.question}
                  </div>

                  {field.description && (
                    <div className="field-description">{field.description}</div>
                  )}
                </div>

                <div className="field-card-actions">
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => handleEdit(field)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => handleDelete(field.id)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FieldManager;
