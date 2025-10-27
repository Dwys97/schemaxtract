import React, { useState } from "react";
import AnnotationCanvas from "./AnnotationCanvas";
import annotationService from "../services/annotationService";
import "./DocumentViewerModal.css";

/**
 * DocumentViewerModal Component
 *
 * Full-screen modal for reviewing documents:
 * - Contains AnnotationCanvas for document viewing
 * - Action buttons: Confirm, Reject, Postpone, Close
 * - Workflow status updates
 * - Saves annotations when user confirms review
 */
function DocumentViewerModal({ document, onClose, onStatusChange }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Handle status change actions
  const handleConfirm = async () => {
    setIsProcessing(true);

    try {
      // Save annotation to localStorage
      const savedAnnotation = annotationService.saveAnnotation({
        filename: document.filename,
        uploadDate: document.uploadedAt,
        fields: document.fields || [],
        metadata: document.metadata || {},
        base64Image: document.base64, // For preview in workflow page
      });

      console.log(
        "[DocumentViewerModal] Annotation saved:",
        savedAnnotation.id
      );

      // Show success feedback
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);

      // Update document status
      await onStatusChange(document.id, "confirmed");
    } catch (error) {
      console.error("[DocumentViewerModal] Failed to save annotation:", error);
      alert("Failed to save annotation. Please try again.");
      setIsProcessing(false);
      return;
    }

    setIsProcessing(false);

    // Close after brief delay to show success message
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await onStatusChange(document.id, "rejected");
    setIsProcessing(false);
    onClose();
  };

  const handlePostpone = async () => {
    setIsProcessing(true);
    await onStatusChange(document.id, "postponed");
    setIsProcessing(false);
    onClose();
  };

  // Set status to 'reviewing' when modal opens
  React.useEffect(() => {
    if (document.status === "to_review") {
      onStatusChange(document.id, "reviewing");
    }
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="header-left">
            <h2>{document.filename}</h2>
            <span className="document-id text-muted">ID: {document.id}</span>
          </div>
          <div className="header-actions">
            <button
              className="btn-postpone"
              onClick={handlePostpone}
              disabled={isProcessing}
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Postpone
            </button>
            <button
              className="btn-reject"
              onClick={handleReject}
              disabled={isProcessing}
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Reject
            </button>
            <button
              className="btn-confirm"
              onClick={handleConfirm}
              disabled={isProcessing}
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Confirm
            </button>
            <button className="btn-close" onClick={onClose}>
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
        </div>

        {/* Modal Body - Annotation Canvas */}
        <div className="modal-body">
          <AnnotationCanvas documentData={document} />
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <div className="footer-info">
            <span className="text-muted">
              Uploaded: {new Date(document.uploadedAt).toLocaleString()}
            </span>
            {document.metadata?.num_fields && (
              <span className="text-muted">
                • {document.metadata.num_fields} fields extracted
              </span>
            )}
            {saveSuccess && (
              <span className="save-success">
                ✓ Annotation saved successfully!
              </span>
            )}
          </div>
          <div className="footer-actions">
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              className="btn-primary"
              onClick={handleConfirm}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <span className="spinner-small"></span>
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Saved!
                </>
              ) : (
                "Confirm & Save"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentViewerModal;
