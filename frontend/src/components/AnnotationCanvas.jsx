import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Stage, Layer, Rect, Text as KonvaText } from 'react-konva';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './AnnotationCanvas.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

/**
 * AnnotationCanvas Component (Tasks F & G)
 * 
 * Dual-pane layout for document annotation:
 * - Left Pane: Field list with interactive linking (click to highlight)
 * - Right Pane: Document viewer with annotation overlay
 * - react-pdf for PDF rendering
 * - react-konva for interactive bounding boxes
 * - Normalized coordinates [0,0,1000,1000] to actual pixels
 * - ROSSUMXML glassmorphic theme
 */
function AnnotationCanvas({ documentData }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedField, setSelectedField] = useState(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const containerRef = useRef(null);

  // Extract fields from document data
  const fields = documentData?.fields || [];
  const extractedText = documentData?.extracted_text || '';
  const base64 = documentData?.base64 || '';
  const mimeType = documentData?.mimeType || 'application/pdf';

  // Calculate document source for react-pdf
  const documentSource = base64 ? { data: atob(base64) } : null;

  // Handle PDF load success
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  // Handle page render success
  const onPageRenderSuccess = (page) => {
    setPageWidth(page.width);
    setPageHeight(page.height);
  };

  // Convert normalized coordinates [0,0,1000,1000] to actual pixel coordinates
  const normalizedToPixels = (bbox) => {
    if (!bbox || !pageWidth || !pageHeight) return null;

    const [x1, y1, x2, y2] = bbox;
    return {
      x: (x1 / 1000) * pageWidth,
      y: (y1 / 1000) * pageHeight,
      width: ((x2 - x1) / 1000) * pageWidth,
      height: ((y2 - y1) / 1000) * pageHeight,
    };
  };

  // Handle field selection
  const handleFieldClick = (field) => {
    setSelectedField(field.field_name === selectedField?.field_name ? null : field);
    
    // Navigate to the page containing the field if needed
    if (field.page && field.page !== currentPage) {
      setCurrentPage(field.page);
    }
  };

  // Render field list item
  const renderFieldItem = (field, index) => {
    const isSelected = selectedField?.field_name === field.field_name;
    const confidence = field.confidence || 0;
    const confidenceColor = confidence > 0.8 ? 'high' : confidence > 0.5 ? 'medium' : 'low';

    return (
      <div
        key={index}
        className={`field-item ${isSelected ? 'selected' : ''}`}
        onClick={() => handleFieldClick(field)}
      >
        <div className="field-header">
          <span className="field-name">{field.field_name}</span>
          <span className={`confidence-badge badge-${confidenceColor}`}>
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="field-value text-muted">{field.value || 'N/A'}</div>
        {field.page && (
          <div className="field-meta text-muted">
            Page {field.page}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="annotation-canvas">
      <div className="canvas-layout">
        {/* Left Pane: Field List */}
        <div className="fields-pane glass-card-elevated">
          <div className="pane-header">
            <h3>Extracted Fields</h3>
            <span className="field-count badge-blue">
              {fields.length} {fields.length === 1 ? 'field' : 'fields'}
            </span>
          </div>

          {fields.length > 0 ? (
            <div className="fields-list">
              {fields.map((field, index) => renderFieldItem(field, index))}
            </div>
          ) : (
            <div className="empty-state">
              <p className="text-muted">No fields extracted yet</p>
            </div>
          )}

          {extractedText && (
            <div className="extracted-text-section">
              <h4>Raw Text</h4>
              <div className="extracted-text">{extractedText}</div>
            </div>
          )}
        </div>

        {/* Right Pane: Document Viewer */}
        <div className="document-pane glass-card-elevated">
          <div className="pane-header">
            <h3>Document Preview</h3>
            {numPages && (
              <div className="page-controls">
                <button
                  className="btn-page"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  ← Prev
                </button>
                <span className="page-info">
                  Page {currentPage} of {numPages}
                </span>
                <button
                  className="btn-page"
                  onClick={() => setCurrentPage(prev => Math.min(numPages, prev + 1))}
                  disabled={currentPage === numPages}
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          <div className="document-viewer" ref={containerRef}>
            {mimeType === 'application/pdf' ? (
              // PDF Viewer
              <div className="pdf-container">
                {documentSource && (
                  <Document
                    file={documentSource}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={<div className="loading-message">Loading PDF...</div>}
                    error={<div className="error-message">Failed to load PDF</div>}
                  >
                    <div className="page-wrapper">
                      <Page
                        pageNumber={currentPage}
                        onRenderSuccess={onPageRenderSuccess}
                        renderTextLayer={true}
                        renderAnnotationLayer={false}
                        width={containerRef.current?.offsetWidth * 0.95 || 600}
                      />

                      {/* Konva Overlay for Annotations */}
                      {pageWidth && pageHeight && (
                        <div className="annotation-overlay">
                          <Stage width={pageWidth} height={pageHeight}>
                            <Layer>
                              {fields
                                .filter(field => field.page === currentPage && field.bbox)
                                .map((field, index) => {
                                  const pixels = normalizedToPixels(field.bbox);
                                  if (!pixels) return null;

                                  const isSelected = selectedField?.field_name === field.field_name;

                                  return (
                                    <React.Fragment key={index}>
                                      <Rect
                                        x={pixels.x}
                                        y={pixels.y}
                                        width={pixels.width}
                                        height={pixels.height}
                                        stroke={isSelected ? '#1d72f3' : '#34c759'}
                                        strokeWidth={isSelected ? 3 : 2}
                                        fill={isSelected ? 'rgba(29, 114, 243, 0.15)' : 'rgba(52, 199, 89, 0.1)'}
                                        cornerRadius={4}
                                        onClick={() => handleFieldClick(field)}
                                        onTap={() => handleFieldClick(field)}
                                        onMouseEnter={(e) => {
                                          const container = e.target.getStage().container();
                                          container.style.cursor = 'pointer';
                                        }}
                                        onMouseLeave={(e) => {
                                          const container = e.target.getStage().container();
                                          container.style.cursor = 'default';
                                        }}
                                      />
                                      {isSelected && (
                                        <KonvaText
                                          x={pixels.x}
                                          y={pixels.y - 20}
                                          text={field.field_name}
                                          fontSize={12}
                                          fontFamily="Inter"
                                          fill="#1d72f3"
                                          padding={4}
                                          background="#ffffff"
                                        />
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                            </Layer>
                          </Stage>
                        </div>
                      )}
                    </div>
                  </Document>
                )}
              </div>
            ) : (
              // Image Viewer
              <div className="image-container">
                {base64 && (
                  <img
                    src={`data:${mimeType};base64,${base64}`}
                    alt="Document"
                    onLoad={(e) => {
                      setPageWidth(e.target.width);
                      setPageHeight(e.target.height);
                    }}
                  />
                )}

                {/* Konva Overlay for Images */}
                {pageWidth && pageHeight && (
                  <div className="annotation-overlay">
                    <Stage width={pageWidth} height={pageHeight}>
                      <Layer>
                        {fields
                          .filter(field => field.bbox)
                          .map((field, index) => {
                            const pixels = normalizedToPixels(field.bbox);
                            if (!pixels) return null;

                            const isSelected = selectedField?.field_name === field.field_name;

                            return (
                              <Rect
                                key={index}
                                x={pixels.x}
                                y={pixels.y}
                                width={pixels.width}
                                height={pixels.height}
                                stroke={isSelected ? '#1d72f3' : '#34c759'}
                                strokeWidth={isSelected ? 3 : 2}
                                fill={isSelected ? 'rgba(29, 114, 243, 0.15)' : 'rgba(52, 199, 89, 0.1)'}
                                cornerRadius={4}
                                onClick={() => handleFieldClick(field)}
                                onTap={() => handleFieldClick(field)}
                              />
                            );
                          })}
                      </Layer>
                    </Stage>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnnotationCanvas;
