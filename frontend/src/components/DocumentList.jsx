import React, { useState } from "react";
import annotationService from "../services/annotationService";
import "./DocumentList.css";

/**
 * DocumentList Component
 *
 * Rossum-style document management interface with:
 * - Status-based filtering (Reviews, Postpone, Rejected, Confirmed, Exports, Deleted)
 * - Table view with Status, Document name, Details, Labels, invoice_id, Issue Date, Due Amount
 * - Review button to open document viewer modal
 * - Export buttons (JSON, CSV, XML) for confirmed documents
 * - Info button to view annotation details
 * - Delete button to remove documents
 */
function DocumentList({
  documents,
  onReviewDocument,
  onStatusChange,
  onDeleteDocument,
}) {
  const [activeFilter, setActiveFilter] = useState("reviews");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocForInfo, setSelectedDocForInfo] = useState(null);

  // Handle document deletion
  const handleDelete = (doc) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${
          doc.metadata?.filename || "this document"
        }"?`
      )
    ) {
      if (onDeleteDocument) {
        onDeleteDocument(doc.id);
      }
    }
  };

  // Handle export
  const handleExport = (doc, format) => {
    try {
      // Create annotation-like object from document
      const annotation = {
        id: doc.id,
        documentName: doc.filename,
        reviewDate: doc.updatedAt || doc.uploadedAt,
        fields: doc.fields || [],
        metadata: {
          ...doc.metadata,
          filename: doc.filename,
          mime_type: doc.mimeType,
        },
      };

      annotationService.exportAnnotation(annotation, format);
    } catch (error) {
      console.error("Export failed:", error);
      alert(`Failed to export: ${error.message}`);
    }
  };

  // Handle info button click
  const handleShowInfo = (doc) => {
    setSelectedDocForInfo(doc);
  };

  // Status filter counts
  const statusCounts = {
    all: documents.length,
    reviews: documents.filter(
      (d) => d.status === "to_review" || d.status === "reviewing"
    ).length,
    postpone: documents.filter((d) => d.status === "postponed").length,
    rejected: documents.filter((d) => d.status === "rejected").length,
    confirmed: documents.filter((d) => d.status === "confirmed").length,
    exports: documents.filter((d) => d.status === "exported").length,
    deleted: documents.filter((d) => d.status === "deleted").length,
  };

  // Filter documents based on active filter
  const getFilteredDocuments = () => {
    let filtered = documents;

    // Apply status filter
    switch (activeFilter) {
      case "reviews":
        filtered = documents.filter(
          (d) => d.status === "to_review" || d.status === "reviewing"
        );
        break;
      case "postpone":
        filtered = documents.filter((d) => d.status === "postponed");
        break;
      case "rejected":
        filtered = documents.filter((d) => d.status === "rejected");
        break;
      case "confirmed":
        filtered = documents.filter((d) => d.status === "confirmed");
        break;
      case "exports":
        filtered = documents.filter((d) => d.status === "exported");
        break;
      case "deleted":
        filtered = documents.filter((d) => d.status === "deleted");
        break;
      default:
        break;
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (d) =>
          d.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.metadata?.invoice_id
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  };

  const filteredDocuments = getFilteredDocuments();

  // Get status badge class
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "to_review":
      case "reviewing":
        return "status-review";
      case "confirmed":
        return "status-confirmed";
      case "rejected":
        return "status-rejected";
      case "postponed":
        return "status-postponed";
      case "exported":
        return "status-exported";
      default:
        return "status-default";
    }
  };

  // Get status display text
  const getStatusText = (status) => {
    switch (status) {
      case "to_review":
        return "To review";
      case "reviewing":
        return "Reviewing";
      case "confirmed":
        return "Confirmed";
      case "rejected":
        return "Rejected";
      case "postponed":
        return "Postponed";
      case "exported":
        return "Exported";
      case "deleted":
        return "Deleted";
      default:
        return status;
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB");
  };

  // Get confidence percentage
  const getConfidence = (doc) => {
    if (!doc.fields || doc.fields.length === 0) return 0;
    const avgConfidence =
      doc.fields.reduce((sum, f) => sum + (f.confidence || 0), 0) /
      doc.fields.length;
    return Math.round(avgConfidence * 100);
  };

  return (
    <div className="document-list">
      {/* Header */}
      <div className="list-header">
        <div className="header-title">
          <h2>Tax invoices (UK)</h2>
          <button className="dropdown-btn">
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
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
        <div className="header-actions">
          <button className="icon-btn">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
          <button className="icon-btn">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
              />
            </svg>
          </button>
          <button className="icon-btn">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Status Filters */}
      <div className="status-filters">
        <button
          className={`filter-btn ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          All
        </button>
        <button
          className={`filter-btn ${activeFilter === "reviews" ? "active" : ""}`}
          onClick={() => setActiveFilter("reviews")}
        >
          Reviews
          {statusCounts.reviews > 0 && (
            <span className="count-badge">{statusCounts.reviews}</span>
          )}
        </button>
        <button
          className={`filter-btn ${
            activeFilter === "postpone" ? "active" : ""
          }`}
          onClick={() => setActiveFilter("postpone")}
        >
          Postpone
        </button>
        <button
          className={`filter-btn ${
            activeFilter === "rejected" ? "active" : ""
          }`}
          onClick={() => setActiveFilter("rejected")}
        >
          Rejected
        </button>
        <button
          className={`filter-btn ${
            activeFilter === "confirmed" ? "active" : ""
          }`}
          onClick={() => setActiveFilter("confirmed")}
        >
          Confirmed
        </button>
        <button
          className={`filter-btn ${activeFilter === "exports" ? "active" : ""}`}
          onClick={() => setActiveFilter("exports")}
        >
          Exports
        </button>
        <button
          className={`filter-btn ${activeFilter === "deleted" ? "active" : ""}`}
          onClick={() => setActiveFilter("deleted")}
        >
          Deleted
        </button>
      </div>

      {/* Filter Info */}
      <div className="filter-info">
        <div className="filter-tags">
          <span className="filter-tag">
            Status includes To review, Reviewing...
            <button className="remove-filter">×</button>
          </span>
        </div>
        <button className="add-filter-btn">
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add filter
        </button>
        <button className="clear-filters-btn">Clear filters</button>
      </div>

      {/* Document Table */}
      <div className="document-table-container">
        <table className="document-table">
          <thead>
            <tr>
              <th className="col-checkbox">
                <input type="checkbox" />
              </th>
              <th className="col-status">Status</th>
              <th className="col-document">Document name</th>
              <th className="col-details">Details</th>
              <th className="col-labels">Labels</th>
              <th className="col-invoice-id">invoice_id</th>
              <th className="col-issue-date">Issue Date</th>
              <th className="col-due-amount">Due Amount</th>
              <th className="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.length === 0 ? (
              <tr>
                <td colSpan="9" className="empty-state">
                  <p className="text-muted">No documents found</p>
                </td>
              </tr>
            ) : (
              filteredDocuments.map((doc) => (
                <tr key={doc.id} className="document-row">
                  <td className="col-checkbox">
                    <input type="checkbox" />
                  </td>
                  <td className="col-status">
                    <span
                      className={`status-badge ${getStatusBadgeClass(
                        doc.status
                      )}`}
                    >
                      {getStatusText(doc.status)}
                    </span>
                  </td>
                  <td className="col-document">
                    <div className="document-name">{doc.filename}</div>
                  </td>
                  <td className="col-details">
                    <div className="details-info">
                      <span className="confidence">{getConfidence(doc)}%</span>
                    </div>
                  </td>
                  <td className="col-labels">
                    {doc.labels && doc.labels.length > 0 && (
                      <div className="labels">
                        {doc.labels.map((label, idx) => (
                          <span key={idx} className="label-tag">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="col-invoice-id">
                    {doc.metadata?.invoice_id || "-"}
                  </td>
                  <td className="col-issue-date">
                    <div className="date-info">
                      <div>{formatDate(doc.metadata?.issue_date)}</div>
                      <div className="confidence-text">
                        {getConfidence(doc)}%
                      </div>
                    </div>
                  </td>
                  <td className="col-due-amount">
                    <div className="amount-info">
                      <div>{doc.metadata?.total || "-"}</div>
                      <div className="confidence-text">
                        {getConfidence(doc)}%
                      </div>
                    </div>
                  </td>
                  <td className="col-actions">
                    <div className="action-buttons">
                      {/* Review button for documents to review */}
                      {(doc.status === "to_review" ||
                        doc.status === "reviewing") && (
                        <button
                          className="review-btn"
                          onClick={() => onReviewDocument(doc)}
                          title="Review document"
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
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          Review
                        </button>
                      )}

                      {/* Export buttons for confirmed documents */}
                      {doc.status === "confirmed" && (
                        <>
                          <button
                            className="review-btn"
                            onClick={() => onStatusChange(doc.id, "to_review")}
                            title="Send back for review"
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
                                d="M11 17l-5-5m0 0l5-5m-5 5h12"
                              />
                            </svg>
                            Review
                          </button>
                          <button
                            className="export-btn export-json"
                            onClick={() => handleExport(doc, "json")}
                            title="Export as JSON"
                          >
                            JSON
                          </button>
                          <button
                            className="export-btn export-csv"
                            onClick={() => handleExport(doc, "csv")}
                            title="Export as CSV"
                          >
                            CSV
                          </button>
                          <button
                            className="export-btn export-xml"
                            onClick={() => handleExport(doc, "xml")}
                            title="Export as XML"
                          >
                            XML
                          </button>
                          <button
                            className="info-btn"
                            onClick={() => handleShowInfo(doc)}
                            title="View details"
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
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </button>
                        </>
                      )}

                      {/* Delete button */}
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(doc)}
                        title="Delete document"
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info Modal */}
      {selectedDocForInfo && (
        <div
          className="info-modal-overlay"
          onClick={() => setSelectedDocForInfo(null)}
        >
          <div
            className="info-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="info-modal-header">
              <h3>📄 {selectedDocForInfo.filename}</h3>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedDocForInfo(null)}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="info-modal-body">
              {/* Metadata Section */}
              <div className="info-section">
                <h4>Metadata</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Uploaded:</span>
                    <span className="info-value">
                      {new Date(selectedDocForInfo.uploadedAt).toLocaleString()}
                    </span>
                  </div>
                  {selectedDocForInfo.updatedAt && (
                    <div className="info-item">
                      <span className="info-label">Reviewed:</span>
                      <span className="info-value">
                        {new Date(
                          selectedDocForInfo.updatedAt
                        ).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="info-item">
                    <span className="info-label">MIME Type:</span>
                    <span className="info-value">
                      {selectedDocForInfo.mimeType || "N/A"}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Status:</span>
                    <span
                      className={`status-badge ${getStatusBadgeClass(
                        selectedDocForInfo.status
                      )}`}
                    >
                      {getStatusText(selectedDocForInfo.status)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Extracted Fields Section */}
              <div className="info-section">
                <h4>
                  Extracted Fields ({selectedDocForInfo.fields?.length || 0})
                </h4>
                <div className="fields-table-wrapper">
                  <table className="fields-info-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Value</th>
                        <th>Confidence</th>
                        <th>BBox</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDocForInfo.fields &&
                      selectedDocForInfo.fields.length > 0 ? (
                        selectedDocForInfo.fields.map((field, index) => (
                          <tr key={index}>
                            <td className="field-label-col">{field.label}</td>
                            <td className="field-value-col">
                              {field.value || "-"}
                            </td>
                            <td className="field-confidence-col">
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
                            <td className="field-bbox-col">
                              {field.bbox
                                ? `[${field.bbox
                                    .map((n) => Math.round(n))
                                    .join(", ")}]`
                                : "-"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="text-center text-muted">
                            No fields extracted
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Export Actions */}
              <div className="info-section">
                <h4>Export Options</h4>
                <div className="export-actions">
                  <button
                    className="btn-export-modal export-json"
                    onClick={() => {
                      handleExport(selectedDocForInfo, "json");
                      setSelectedDocForInfo(null);
                    }}
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
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                      />
                    </svg>
                    Export as JSON
                  </button>
                  <button
                    className="btn-export-modal export-csv"
                    onClick={() => {
                      handleExport(selectedDocForInfo, "csv");
                      setSelectedDocForInfo(null);
                    }}
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
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                      />
                    </svg>
                    Export as CSV
                  </button>
                  <button
                    className="btn-export-modal export-xml"
                    onClick={() => {
                      handleExport(selectedDocForInfo, "xml");
                      setSelectedDocForInfo(null);
                    }}
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
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                      />
                    </svg>
                    Export as XML
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentList;
