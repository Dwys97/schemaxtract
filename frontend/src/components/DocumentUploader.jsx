import React, { useState, useRef } from 'react';
import axios from 'axios';
import './DocumentUploader.css';

/**
 * DocumentUploader Component (Task E)
 * 
 * Provides file upload interface with:
 * - File input with drag-and-drop support
 * - Base64 encoding via FileReader
 * - Axios POST to /api/process-document
 * - Loading states and error handling
 * - ROSSUMXML glassmorphic theme
 */
function DocumentUploader({ onDocumentProcessed }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Handle file selection
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  // Validate file type and size
  const validateAndSetFile = (file) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      setError('Only PDF, PNG, and JPEG files are supported');
      return;
    }

    if (file.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setError(null);
  };

  // Handle drag and drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  // Process document upload
  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert file to Base64
      const base64 = await fileToBase64(selectedFile);
      
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Data = base64.split(',')[1];

      // Send to backend
      const response = await axios.post('/api/process-document', {
        document: base64Data,
        filename: selectedFile.name,
        mimeType: selectedFile.type
      });

      // Call parent callback with response data
      if (onDocumentProcessed) {
        onDocumentProcessed({
          ...response.data,
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          base64: base64Data
        });
      }

      // Reset state
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (err) {
      console.error('Upload error:', err);
      setError(
        err.response?.data?.message || 
        err.message || 
        'Failed to process document. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Convert file to Base64 using FileReader
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  return (
    <div className="document-uploader glass-card">
      <h2 className="uploader-title">Upload Document</h2>
      <p className="uploader-subtitle text-muted">
        Upload a PDF or image for OCR processing and field extraction
      </p>

      {/* Drag and Drop Zone */}
      <div
        className={`upload-zone ${dragActive ? 'drag-active' : ''} ${selectedFile ? 'has-file' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <div className="upload-icon">
          {selectedFile ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          )}
        </div>

        <div className="upload-text">
          {selectedFile ? (
            <>
              <p className="filename">{selectedFile.name}</p>
              <p className="filesize text-muted">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
            </>
          ) : (
            <>
              <p className="upload-instruction">
                Drag and drop your file here, or click to browse
              </p>
              <p className="upload-hint text-muted">
                Supports PDF, PNG, JPEG (max 10MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Upload Button */}
      <button
        className="btn-primary upload-button"
        onClick={handleUpload}
        disabled={!selectedFile || loading}
      >
        {loading ? (
          <>
            <span className="spinner"></span>
            Processing...
          </>
        ) : (
          'Process Document'
        )}
      </button>
    </div>
  );
}

export default DocumentUploader;
