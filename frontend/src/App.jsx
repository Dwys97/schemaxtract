import React, { useState, useEffect } from "react";
import DocumentUploader from "./components/DocumentUploader";
import DocumentList from "./components/DocumentList";
import DocumentViewerModal from "./components/DocumentViewerModal";
import FieldManager from "./components/FieldManager";
import TemplateManager from "./components/TemplateManager";
import "./App.css";

function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showUploader, setShowUploader] = useState(true);
  const [currentView, setCurrentView] = useState("documents"); // 'documents', 'fields', or 'templates'

  // Load documents from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("schemaxtract_documents");
    if (saved) {
      try {
        setDocuments(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load documents:", e);
      }
    }
  }, []);

  // Save documents to localStorage whenever they change
  useEffect(() => {
    console.log("[App] Documents changed, count:", documents.length);
    if (documents.length > 0) {
      localStorage.setItem("schemaxtract_documents", JSON.stringify(documents));
      console.log("[App] Saved to localStorage");
    }
  }, [documents]);

  // Handle document processing completion from DocumentUploader
  const handleDocumentProcessed = (data) => {
    console.log("Document processed:", data);
    console.log("Data keys:", Object.keys(data));
    console.log("Fields:", data.fields);
    console.log("Batch in progress:", data.batchInProgress);

    // Extract metadata from fields
    const metadata = {
      invoice_id:
        data.fields?.find((f) => f.field_name === "invoice_number" || f.label === "invoice_number")?.value ||
        null,
      issue_date:
        data.fields?.find((f) => f.field_name === "invoice_date" || f.label === "invoice_date")?.value ||
        null,
      total: data.fields?.find((f) => f.field_name === "total" || f.label === "total_amount")?.value || null,
      num_fields: data.fields?.length || 0,
    };

    console.log("Extracted metadata:", metadata);

    // If this is a batch in progress, UPDATE existing document instead of creating new one
    if (data.batchInProgress) {
      console.log("[App] Batch in progress - updating existing document");

      setDocuments((prev) => {
        // Check if document already exists (from priority batch)
        const existingIndex = prev.findIndex(
          (doc) =>
            doc.base64 === data.base64 ||
            (doc.filename === data.filename &&
              Math.abs(new Date(doc.uploadedAt).getTime() - Date.now()) < 5000)
        );

        if (existingIndex !== -1) {
          // Update existing document
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            fields: data.fields,
            metadata: metadata,
          };
          return updated;
        } else {
          // First batch - create new document
          const newDocument = {
            id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            filename: data.filename,
            mimeType: data.mimeType,
            base64: data.base64,
            fields: data.fields,
            extracted_text: data.extracted_text,
            metadata: metadata,
            status: "to_review",
            uploadedAt: new Date().toISOString(),
            labels: [],
          };
          console.log("[App] Creating new document (batch in progress):", newDocument.id, newDocument.status);
          return [newDocument, ...prev];
        }
      });
    } else {
      // Final batch complete OR no batches - create or update document
      console.log("[App] All batches complete - final document update");

      setDocuments((prev) => {
        // Check if document already exists
        const existingIndex = prev.findIndex(
          (doc) =>
            doc.base64 === data.base64 ||
            (doc.filename === data.filename &&
              Math.abs(new Date(doc.uploadedAt).getTime() - Date.now()) < 10000)
        );

        if (existingIndex !== -1) {
          // Update existing document with final fields
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            fields: data.fields,
            metadata: metadata,
          };
          return updated;
        } else {
          // No batches were used - create new document
          const newDocument = {
            id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            filename: data.filename,
            mimeType: data.mimeType,
            base64: data.base64,
            fields: data.fields,
            extracted_text: data.extracted_text,
            metadata: metadata,
            status: "to_review",
            uploadedAt: new Date().toISOString(),
            labels: [],
          };
          console.log("[App] Creating new document (final):", newDocument.id, newDocument.status);
          console.log("[App] Document count will be:", prev.length + 1);
          return [newDocument, ...prev];
        }
      });
    }

    // Hide uploader and show document list (only on final update)
    if (!data.batchInProgress) {
      setShowUploader(false);
    }
  };

  // Handle opening document for review
  const handleReviewDocument = (doc) => {
    setSelectedDocument(doc);
    // Add body class to prevent scrolling
    window.document.body.classList.add("modal-open");
  };

  // Handle closing document viewer
  const handleCloseViewer = () => {
    setSelectedDocument(null);
    // Remove body class
    window.document.body.classList.remove("modal-open");
  };

  // Handle document status change
  const handleStatusChange = async (documentId, newStatus) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === documentId
          ? { ...doc, status: newStatus, updatedAt: new Date().toISOString() }
          : doc
      )
    );

    // Update selected document if it's the one being changed
    if (selectedDocument?.id === documentId) {
      setSelectedDocument((prev) => ({ ...prev, status: newStatus }));
    }
  };

  // Handle document deletion
  const handleDeleteDocument = (documentId) => {
    setDocuments((prev) => {
      const filtered = prev.filter((doc) => doc.id !== documentId);
      // Update localStorage
      if (filtered.length === 0) {
        localStorage.removeItem("schemaxtract_documents");
      } else {
        localStorage.setItem(
          "schemaxtract_documents",
          JSON.stringify(filtered)
        );
      }
      return filtered;
    });

    // Close viewer if deleted document is open
    if (selectedDocument?.id === documentId) {
      setSelectedDocument(null);
      document.body.classList.remove("modal-open");
    }
  };

  // Show/hide uploader
  const toggleUploader = () => {
    setShowUploader((prev) => !prev);
  };

  return (
    <div className="App">
      <div className="App-container">
        <header className="App-header">
          <div className="header-content">
            <div>
              <h1>MD-Copilot IDP System</h1>
              <p>Interactive Document Processing & Template Learning</p>
            </div>
            <div className="header-buttons">
              <button
                className={`btn-tab ${
                  currentView === "documents" ? "active" : ""
                }`}
                onClick={() => setCurrentView("documents")}
              >
                📄 Documents
              </button>
              <button
                className={`btn-tab ${
                  currentView === "fields" ? "active" : ""
                }`}
                onClick={() => setCurrentView("fields")}
              >
                📋 Fields
              </button>
              <button
                className={`btn-tab ${
                  currentView === "templates" ? "active" : ""
                }`}
                onClick={() => setCurrentView("templates")}
              >
                🔖 Templates
              </button>
              {currentView === "documents" && (
                <button className="btn-primary" onClick={toggleUploader}>
                  {showUploader ? "Hide Uploader" : "Upload Document"}
                </button>
              )}
              {currentView === "documents" && documents.length > 0 && (
                <button
                  className="btn-secondary-outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Clear all documents? This cannot be undone."
                      )
                    ) {
                      setDocuments([]);
                      localStorage.removeItem("schemaxtract_documents");
                    }
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Field Manager View */}
        {currentView === "fields" && <FieldManager />}

        {/* Template Manager View */}
        {currentView === "templates" && <TemplateManager />}

        {/* Documents View */}
        {currentView === "documents" && (
          <>
            {/* Document Upload Section */}
            {showUploader && (
              <div className="uploader-section">
                <DocumentUploader
                  onDocumentProcessed={handleDocumentProcessed}
                />
              </div>
            )}

            {/* Document List Section */}
            {documents.length > 0 && (
              <div className="documents-section">
                <DocumentList
                  documents={documents}
                  onReviewDocument={handleReviewDocument}
                  onStatusChange={handleStatusChange}
                  onDeleteDocument={handleDeleteDocument}
                />
              </div>
            )}

            {/* Empty State */}
            {documents.length === 0 && !showUploader && (
              <div className="empty-state-container glass-card">
                <div className="empty-state-content">
                  <svg
                    width="64"
                    height="64"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3>No Documents Yet</h3>
                  <p className="text-muted">
                    Upload a PDF or image to get started with automated field
                    extraction
                  </p>
                  <button
                    className="btn-primary"
                    onClick={() => setShowUploader(true)}
                  >
                    Upload First Document
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewerModal
          document={selectedDocument}
          onClose={handleCloseViewer}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

export default App;
