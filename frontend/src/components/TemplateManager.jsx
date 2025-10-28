import React, { useState, useEffect } from "react";
import templateService from "../services/templateService";
import "./TemplateManager.css";

/**
 * TemplateManager Component
 * Manages saved document templates for few-shot learning
 */
function TemplateManager() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [stats, setStats] = useState(null);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    const loaded = templateService.listTemplates();
    setTemplates(loaded);
    setStats(templateService.getStats());
  };

  const handleDelete = (templateId) => {
    if (window.confirm("Delete this template? This cannot be undone.")) {
      templateService.deleteTemplate(templateId);
      loadTemplates();
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }
    }
  };

  const handleExport = () => {
    templateService.exportTemplates();
  };

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const count = await templateService.importTemplates(file);
      alert(`✓ Imported ${count} templates successfully`);
      loadTemplates();
    } catch (error) {
      alert(`Failed to import templates: ${error.message}`);
    }
    event.target.value = ""; // Reset input
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="template-manager">
      <div className="template-header">
        <div>
          <h2>📚 Template Library</h2>
          <p className="text-muted">
            Few-shot learning templates for improved extraction accuracy
          </p>
        </div>
        <div className="template-actions">
          <label className="btn-secondary">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Import
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: "none" }}
            />
          </label>
          <button className="btn-secondary" onClick={handleExport}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export All
          </button>
        </div>
      </div>

      {/* Statistics */}
      {stats && stats.total > 0 && (
        <div className="template-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Templates</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {Math.round(stats.avgFieldsPerTemplate)}
            </div>
            <div className="stat-label">Avg Fields/Template</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {Object.keys(stats.byVendor).length}
            </div>
            <div className="stat-label">Unique Vendors</div>
          </div>
        </div>
      )}

      {/* Template List */}
      <div className="template-content">
        <div className="template-list">
          {templates.length === 0 ? (
            <div className="empty-state">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <h3>No Templates Yet</h3>
              <p className="text-muted">
                Confirm documents and save them as templates to improve
                extraction accuracy
              </p>
            </div>
          ) : (
            <div className="template-grid">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`template-card ${
                    selectedTemplate?.id === template.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <div className="template-card-header">
                    <h3>{template.name}</h3>
                    <button
                      className="delete-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(template.id);
                      }}
                      title="Delete template"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="template-card-body">
                    <div className="template-meta">
                      <span className="badge">{template.fields.length} fields</span>
                      <span className="text-muted">{template.filename}</span>
                    </div>
                    <div className="template-date">
                      {formatDate(template.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Details Panel */}
        {selectedTemplate && (
          <div className="template-details">
            <div className="details-header">
              <h3>📄 {selectedTemplate.name}</h3>
              <button
                className="close-btn"
                onClick={() => setSelectedTemplate(null)}
              >
                ✕
              </button>
            </div>

            <div className="details-section">
              <h4>Metadata</h4>
              <div className="metadata-grid">
                <div className="metadata-item">
                  <span className="label">Filename:</span>
                  <span className="value">{selectedTemplate.filename}</span>
                </div>
                <div className="metadata-item">
                  <span className="label">Created:</span>
                  <span className="value">
                    {formatDate(selectedTemplate.createdAt)}
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="label">Fields:</span>
                  <span className="value">{selectedTemplate.fields.length}</span>
                </div>
                <div className="metadata-item">
                  <span className="label">Template ID:</span>
                  <span className="value code">{selectedTemplate.id}</span>
                </div>
              </div>
            </div>

            <div className="details-section">
              <h4>Learned Fields ({selectedTemplate.fields.length})</h4>
              <div className="fields-table-wrapper">
                <table className="fields-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Example Value</th>
                      <th>Type</th>
                      <th>Confidence</th>
                      <th>BBox</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTemplate.fields.map((field, index) => (
                      <tr key={index}>
                        <td className="field-label">{field.label}</td>
                        <td className="field-value">{field.value}</td>
                        <td>
                          <span className="type-badge">{field.type}</span>
                        </td>
                        <td>
                          <span
                            className={`confidence-badge ${
                              field.confidence >= 0.8
                                ? "high"
                                : field.confidence >= 0.5
                                ? "medium"
                                : "low"
                            }`}
                          >
                            {((field.confidence || 0) * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="bbox-col">
                          {field.bbox
                            ? `[${field.bbox.map((n) => Math.round(n)).join(", ")}]`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="details-footer">
              <p className="text-muted">
                💡 This template will be used to improve field extraction for similar documents
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplateManager;
