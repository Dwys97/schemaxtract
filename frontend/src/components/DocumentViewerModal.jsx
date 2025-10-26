import React, { useState } from 'react';
import AnnotationCanvas from './AnnotationCanvas';
import './DocumentViewerModal.css';

/**
 * DocumentViewerModal Component
 * 
 * Full-screen modal for reviewing documents:
 * - Contains AnnotationCanvas for document viewing
 * - Action buttons: Confirm, Reject, Postpone, Close
 * - Workflow status updates
 */
function DocumentViewerModal({ document, onClose, onStatusChange }) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle status change actions
  const handleConfirm = async () => {
    setIsProcessing(true);
    await onStatusChange(document.id, 'confirmed');
    setIsProcessing(false);
    onClose();
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await onStatusChange(document.id, 'rejected');
    setIsProcessing(false);
    onClose();
  };

  const handlePostpone = async () => {
    setIsProcessing(true);
    await onStatusChange(document.id, 'postponed');
    setIsProcessing(false);
    onClose();
  };

  // Set status to 'reviewing' when modal opens
  React.useEffect(() => {
    if (document.status === 'to_review') {
      onStatusChange(document.id, 'reviewing');
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Postpone
            </button>
            <button 
              className="btn-reject" 
              onClick={handleReject}
              disabled={isProcessing}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject
            </button>
            <button 
              className="btn-confirm" 
              onClick={handleConfirm}
              disabled={isProcessing}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Confirm
            </button>
            <button className="btn-close" onClick={onClose}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
              {isProcessing ? 'Processing...' : 'Confirm & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentViewerModal;
