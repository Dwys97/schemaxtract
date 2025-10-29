import React, { useState, useRef } from "react";
import axios from "axios";
import fieldService from "../services/fieldService";
import batchAnnotationService from "../services/batchAnnotationService";
import templateService from "../services/templateService";
import "./DocumentUploader.css";

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

  // Batch processing state
  const [batchProgress, setBatchProgress] = useState({
    isProcessing: false,
    currentBatch: 0,
    totalBatches: 0,
    percentComplete: 0,
    processedFields: 0,
    totalFields: 0,
    isPriorityBatch: false,
  });

  // Handle file selection
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  // Validate file type and size
  const validateAndSetFile = (file) => {
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
    ];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      setError("Only PDF, PNG, and JPEG files are supported");
      return;
    }

    if (file.size > maxSize) {
      setError("File size must be less than 10MB");
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

  // Process document upload with optional batch field extraction
  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a file first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert file to Base64
      const base64 = await fileToBase64(selectedFile);

      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Data = base64.split(",")[1];

      // Get custom field definitions from field manager
      const customFields = fieldService.getFieldsAsQuestions();

      console.log("Custom fields being sent:", customFields);
      console.log("Number of custom fields:", customFields.length);

      // If no custom fields defined, use the original single-call approach
      if (!customFields || customFields.length === 0) {
        console.log(
          "[Upload] No custom fields - using default backend extraction (5 priority questions)"
        );

        // Original approach: backend extracts default 5 priority fields
        const response = await axios.post("/api/process-document", {
          document: base64Data,
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          // No customFields - backend will use defaults
        });

        // Call parent callback with response data
        if (onDocumentProcessed) {
          onDocumentProcessed({
            ...response.data,
            filename: selectedFile.name,
            mimeType: selectedFile.type,
            base64: base64Data,
          });
        }

        // Reset state
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setLoading(false);
        return;
      }

      // BATCH EXTRACTION PATH: Custom fields are defined
      console.log(
        `[Upload] ${customFields.length} custom fields defined - using batch extraction`
      );

      // STEP 1: Get OCR + default field extraction first
      // This runs OCR and extracts priority fields (vendor, invoice_number, etc.)
      console.log(
        "[Upload] Step 1: Running OCR and extracting priority fields..."
      );
      const ocrResponse = await axios.post("/api/process-document", {
        document: base64Data,
        filename: selectedFile.name,
        mimeType: selectedFile.type,
        // Don't send customFields yet - we want default fields for template matching
      });

      console.log("[Upload] OCR Response:", ocrResponse.data);

      // STEP 1.5: Find matching templates using extracted fields
      console.log("[Upload] Step 1.5: Looking for matching templates...");

      const extractedFields = ocrResponse.data?.fields || [];
      console.log(
        `[Upload] Extracted ${extractedFields.length} priority fields from OCR`
      );

      if (extractedFields.length > 0) {
        console.log(
          "[Upload] Fields available for template matching:",
          extractedFields.map((f) => `${f.label}="${f.value}"`).join(", ")
        );
      }

      // Use the actual extracted fields (with values!) for template matching
      const matchingTemplates = templateService.findMatchingTemplates(
        extractedFields,
        1 // Get top 1 match
      );

      let templateHints = null;
      if (matchingTemplates.length > 0) {
        const bestTemplate = matchingTemplates[0].template;
        console.log(
          `[Upload] ✅ Found matching template: "${
            bestTemplate.name
          }" (score: ${matchingTemplates[0].score.toFixed(2)})`
        );
        console.log(
          `[Upload] Matched on ${matchingTemplates[0].matchedFields} common fields`
        );
        console.log(
          `[Upload] Template has ${bestTemplate.fields.length} fields with bbox hints`
        );

        // Convert template to hints format for backend
        templateHints = {
          template_id: bestTemplate.id,
          template_name: bestTemplate.name,
          field_hints: bestTemplate.fields.map((f) => ({
            field_key: f.label,
            bbox: f.bbox,
            typical_value: f.value,
            confidence: f.confidence,
          })),
        };
        console.log(
          `[Upload] Template hints prepared with ${templateHints.field_hints.length} bbox hints`
        );
      } else {
        console.log("[Upload] ❌ No matching templates found");
        console.log(
          "[Upload] 💡 Tip: After confirming this extraction, save it as a template for future use!"
        );
      }

      // Prepare document data with base64
      const documentData = {
        ...ocrResponse.data,
        filename: selectedFile.name,
        mimeType: selectedFile.type,
        base64: base64Data,
        fields: extractedFields, // Start with the priority fields from Step 1
      };

      // STEP 2: Start batch field extraction with template hints
      setBatchProgress({
        isProcessing: true,
        currentBatch: 0,
        totalBatches: Math.ceil(customFields.length / 5),
        percentComplete: 0,
        processedFields: 0,
        totalFields: customFields.length,
        isPriorityBatch: true,
      });

      // Setup batch callbacks
      let allExtractedFields = [];
      let isPriorityBatchComplete = false;

      batchAnnotationService.onBatchComplete = (batchFields, batchInfo) => {
        console.log(
          `[Upload] Batch ${batchInfo.batchIndex || 0} complete:`,
          batchFields
        );

        // Add fields to accumulated results
        allExtractedFields = [...allExtractedFields, ...batchFields];

        // Update progress
        const batchNum =
          batchInfo.batchIndex !== undefined ? batchInfo.batchIndex : 0;
        const totalBatches = batchInfo.totalBatches || 1;

        setBatchProgress({
          isProcessing: true,
          currentBatch: batchNum,
          totalBatches: totalBatches,
          percentComplete: Math.round((batchNum / totalBatches) * 100),
          processedFields: allExtractedFields.length,
          totalFields: batchInfo.totalFields,
          isPriorityBatch: batchInfo.isPriorityBatch,
        });

        // After FIRST batch (priority fields), show document immediately
        if (batchInfo.isPriorityBatch && !isPriorityBatchComplete) {
          isPriorityBatchComplete = true;
          console.log(
            "[Upload] Priority batch complete! Showing document with first fields..."
          );

          // Send partial results to parent so user can view PDF NOW
          if (onDocumentProcessed) {
            onDocumentProcessed({
              ...documentData,
              fields: allExtractedFields, // First priority fields
              batchInProgress: true, // Flag to indicate more coming
            });
          }
        }
      };

      batchAnnotationService.onProgress = (progressInfo) => {
        console.log(
          `[Upload] Progress: ${progressInfo.percentComplete}% (${progressInfo.processedFields}/${progressInfo.totalFields})`
        );
      };

      batchAnnotationService.onAllComplete = (allFields) => {
        console.log("[Upload] All batches complete!", allFields);

        // Final update with all fields - ONLY call this once
        if (onDocumentProcessed) {
          onDocumentProcessed({
            ...documentData,
            fields: allFields,
          });
        }

        // Reset state
        setBatchProgress({
          isProcessing: false,
          currentBatch: 0,
          totalBatches: 0,
          percentComplete: 100,
          processedFields: allFields.length,
          totalFields: allFields.length,
          isPriorityBatch: false,
        });

        setLoading(false);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      };

      batchAnnotationService.onError = (errorInfo) => {
        console.error("[Upload] Batch extraction failed:", errorInfo);

        // If we have partial results, still show them
        if (errorInfo.partialResults && errorInfo.partialResults.length > 0) {
          if (onDocumentProcessed) {
            onDocumentProcessed({
              ...documentData,
              fields: errorInfo.partialResults,
              batchInProgress: false,
            });
          }

          setError(
            `Partial extraction: ${
              errorInfo.partialResults.length
            } fields extracted before error at batch ${
              errorInfo.batchIndex + 1
            }`
          );
        } else {
          setError(
            `Field extraction failed: ${errorInfo.message || "Unknown error"}`
          );
        }

        setBatchProgress({
          isProcessing: false,
          currentBatch: 0,
          totalBatches: 0,
          percentComplete: 0,
          processedFields: 0,
          totalFields: 0,
          isPriorityBatch: false,
        });

        setLoading(false);
      };

      // Start batch extraction (5 at a time, 500ms delays)
      await batchAnnotationService.extractInBatches(
        base64Data,
        selectedFile.type.includes("pdf") ? "pdf" : "png",
        customFields,
        {
          batchSize: 5,
          delayMs: 500,
          templateHints: templateHints, // Pass template hints to backend
        }
      );
    } catch (err) {
      console.error("Upload error:", err);
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to process document. Please try again."
      );
      setLoading(false);
      setBatchProgress({
        isProcessing: false,
        currentBatch: 0,
        totalBatches: 0,
        percentComplete: 0,
        processedFields: 0,
        totalFields: 0,
        isPriorityBatch: false,
      });
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
        className={`upload-zone ${dragActive ? "drag-active" : ""} ${
          selectedFile ? "has-file" : ""
        }`}
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
          style={{ display: "none" }}
        />

        <div className="upload-icon">
          {selectedFile ? (
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          ) : (
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
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
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
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
            Processing with DocVQA (30-60s)...
          </>
        ) : (
          "Process Document"
        )}
      </button>

      {/* Loading Details - показывается во время обработки */}
      {loading && (
        <div className="loading-details">
          {!batchProgress.isProcessing ? (
            // Phase 1: Initial OCR processing
            <>
              <div className="loading-steps">
                <div className="loading-step active">
                  <span className="step-icon">📄</span>
                  <span>Converting PDF to image...</span>
                </div>
                <div className="loading-step active">
                  <span className="step-icon">🔍</span>
                  <span>Running OCR (Tesseract)...</span>
                </div>
                <div className="loading-step">
                  <span className="step-icon">🤖</span>
                  <span>Preparing field extraction...</span>
                </div>
              </div>
              <p className="loading-note">
                ⏱️ Processing document structure...
              </p>
            </>
          ) : (
            // Phase 2: Batch field extraction
            <>
              <div className="loading-steps">
                <div className="loading-step completed">
                  <span className="step-icon">✅</span>
                  <span>OCR complete</span>
                </div>
                <div className="loading-step active">
                  <span className="step-icon">🤖</span>
                  <span>
                    Extracting fields (Batch {batchProgress.currentBatch}/
                    {batchProgress.totalBatches})
                  </span>
                </div>
                {batchProgress.isPriorityBatch && (
                  <div className="loading-step">
                    <span className="step-icon">⭐</span>
                    <span>Processing priority fields first...</span>
                  </div>
                )}
              </div>
              <div className="batch-progress-bar">
                <div
                  className="batch-progress-fill"
                  style={{ width: `${batchProgress.percentComplete}%` }}
                ></div>
              </div>
              <p className="loading-note">
                {batchProgress.isPriorityBatch ? (
                  <>
                    ⭐ Extracting priority fields (
                    {batchProgress.processedFields}/{batchProgress.totalFields}
                    )
                    <br />
                    📄 Document will be viewable after first 5 fields...
                  </>
                ) : (
                  <>
                    🔄 Processing batch {batchProgress.currentBatch} of{" "}
                    {batchProgress.totalBatches} (
                    {batchProgress.percentComplete}
                    % complete)
                    <br />
                    📊 {batchProgress.processedFields}/
                    {batchProgress.totalFields} fields extracted
                  </>
                )}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentUploader;
