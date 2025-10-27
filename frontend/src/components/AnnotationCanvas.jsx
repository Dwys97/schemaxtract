import React, { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Stage,
  Layer,
  Rect,
  Text as KonvaText,
  Line,
  Transformer,
} from "react-konva";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./AnnotationCanvas.css";

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
  const [editingBbox, setEditingBbox] = useState(null);
  const [updatedFields, setUpdatedFields] = useState({}); // Track bbox updates
  const [zoom, setZoom] = useState(1.0); // Zoom level (1.0 = 100%)
  const containerRef = useRef(null); // Document viewer scroll container
  const modalRef = useRef(null); // Modal scroll container
  const transformerRef = useRef(null);
  const fieldsPaneRef = useRef(null);

  // Extract fields from document data
  const fields = documentData?.fields || [];
  const extractedText = documentData?.extracted_text || "";
  const base64 = documentData?.base64 || "";
  const mimeType = documentData?.mimeType || "application/pdf";

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
    const fieldKey = field.label || field.field_name || field.id;
    const isDeselecting = selectedField?.id === field.id;

    setSelectedField(isDeselecting ? null : field);

    // Zoom in when selecting, zoom out when deselecting
    if (isDeselecting) {
      setZoom(1.0); // Reset to 100%
    } else {
      setZoom(1.3); // Zoom to 130%
    }

    // Navigate to the page containing the field if needed
    if (field.page && field.page !== currentPage) {
      setCurrentPage(field.page);
    }

    // Scroll the bbox into view after a short delay to allow rendering
    setTimeout(() => {
      if (!isDeselecting && field.bbox) {
        const pixels = normalizedToPixels(field.bbox);
        if (pixels) {
          // Calculate the vertical center of the bbox (accounting for zoom)
          const bboxCenterY = (pixels.y + pixels.height / 2) * zoom;

          // Scroll the document viewer container (inner scroll)
          if (containerRef.current) {
            const viewer = containerRef.current;
            const viewerHeight = viewer.clientHeight;
            const targetScrollTop = bboxCenterY - viewerHeight / 2;

            viewer.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: "smooth",
            });
          }

          // Also scroll the modal container if it exists (outer scroll)
          if (modalRef.current) {
            const modal = modalRef.current;
            const modalHeight = modal.clientHeight;

            // Get the position of the document viewer within the modal
            const viewerRect = containerRef.current?.getBoundingClientRect();
            const modalRect = modal.getBoundingClientRect();

            if (viewerRect && modalRect) {
              // Calculate how far down the modal we need to scroll
              // to bring the viewer (and the bbox) into view
              const viewerTopRelativeToModal =
                viewerRect.top - modalRect.top + modal.scrollTop;
              const targetModalScroll =
                viewerTopRelativeToModal - modalHeight / 4; // Scroll to upper quarter

              modal.scrollTo({
                top: Math.max(0, targetModalScroll),
                behavior: "smooth",
              });
            }
          }
        }
      }
    }, 150); // Slightly longer delay to account for zoom animation
  };

  // Render field list item
  const renderFieldItem = (field, index) => {
    const isSelected = selectedField?.id === field.id;
    const confidence = field.confidence || 0;
    const confidenceColor =
      confidence > 0.8 ? "high" : confidence > 0.5 ? "medium" : "low";
    const fieldLabel = field.label || field.field_name || `Field ${index + 1}`;
    const fieldValue = field.value || "N/A";

    return (
      <div
        key={field.id || index}
        className={`field-item ${isSelected ? "selected" : ""}`}
        onClick={() => handleFieldClick(field)}
      >
        <div className="field-header">
          <span className="field-name">{fieldLabel}</span>
          {confidence > 0 && (
            <span className={`confidence-badge badge-${confidenceColor}`}>
              {(confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="field-value text-muted">{fieldValue}</div>
        {field.page && (
          <div className="field-meta text-muted">Page {field.page}</div>
        )}
        {field.bbox && field.bbox.some((v) => v > 0) && (
          <div className="field-meta text-muted">📍 Has location</div>
        )}
        {isSelected && (
          <div className="field-actions">
            <button
              className="btn-action btn-accept"
              onClick={(e) => {
                e.stopPropagation();
                const finalField = updatedFields[field.id] || field;
                console.log(`Accepted field: ${field.label}`, finalField);
                alert(
                  `✓ Field "${field.label}" accepted\nValue: ${
                    finalField.value
                  }\nBbox: ${JSON.stringify(finalField.bbox)}`
                );
              }}
            >
              ✓ Accept
            </button>
            <button
              className="btn-action btn-edit"
              onClick={(e) => {
                e.stopPropagation();
                const newValue = prompt(
                  `Edit value for "${field.label}":`,
                  field.value
                );
                if (newValue !== null) {
                  field.value = newValue;
                  setUpdatedFields((prev) => ({
                    ...prev,
                    [field.id]: {
                      ...(prev[field.id] || field),
                      value: newValue,
                    },
                  }));
                  console.log(`Updated field: ${field.label} = ${newValue}`);
                }
              }}
            >
              ✏ Edit
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="annotation-canvas" ref={modalRef}>
      <div className="canvas-layout">
        {/* Left Pane: Field List */}
        <div className="fields-pane glass-card-elevated">
          <div className="pane-header">
            <h3>Extracted Fields</h3>
            <span className="field-count badge-blue">
              {fields.length} {fields.length === 1 ? "field" : "fields"}
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
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={currentPage === 1}
                >
                  ← Prev
                </button>
                <span className="page-info">
                  Page {currentPage} of {numPages}
                </span>
                <button
                  className="btn-page"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(numPages, prev + 1))
                  }
                  disabled={currentPage === numPages}
                >
                  Next →
                </button>
                <div
                  style={{
                    marginLeft: "1rem",
                    display: "inline-flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <button
                    className="btn-page"
                    onClick={() => setZoom((prev) => Math.max(0.5, prev - 0.1))}
                    disabled={zoom <= 0.5}
                    title="Zoom Out"
                  >
                    −
                  </button>
                  <span className="page-info" style={{ minWidth: "4rem" }}>
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    className="btn-page"
                    onClick={() => setZoom((prev) => Math.min(2.0, prev + 0.1))}
                    disabled={zoom >= 2.0}
                    title="Zoom In"
                  >
                    +
                  </button>
                  <button
                    className="btn-page"
                    onClick={() => setZoom(1.0)}
                    title="Reset Zoom"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="document-viewer" ref={containerRef}>
            {mimeType === "application/pdf" ? (
              // PDF Viewer
              <div className="pdf-container">
                {documentSource && (
                  <Document
                    file={documentSource}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                      <div className="loading-message">Loading PDF...</div>
                    }
                    error={
                      <div className="error-message">Failed to load PDF</div>
                    }
                  >
                    <div
                      className="page-wrapper"
                      style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: "top center",
                        transition: "transform 0.3s ease-in-out",
                      }}
                    >
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
                                .filter((field) => {
                                  // Show field if: has bbox AND (no page specified OR matches current page)
                                  const hasPage = field.page !== undefined;
                                  const matchesPage =
                                    !hasPage || field.page === currentPage;
                                  return field.bbox && matchesPage;
                                })
                                .map((field, index) => {
                                  // Use updated bbox if available, otherwise original
                                  const currentBbox =
                                    updatedFields[field.id]?.bbox || field.bbox;
                                  const pixels =
                                    normalizedToPixels(currentBbox);
                                  if (!pixels) return null;

                                  const isSelected =
                                    selectedField?.id === field.id;

                                  return (
                                    <React.Fragment key={field.id || index}>
                                      <Rect
                                        x={pixels.x}
                                        y={pixels.y}
                                        width={pixels.width}
                                        height={pixels.height}
                                        stroke={
                                          isSelected ? "#1d72f3" : "#34c759"
                                        }
                                        strokeWidth={isSelected ? 3 : 2}
                                        fill={
                                          isSelected
                                            ? "rgba(29, 114, 243, 0.15)"
                                            : "rgba(52, 199, 89, 0.1)"
                                        }
                                        cornerRadius={4}
                                        draggable={true}
                                        onClick={() => handleFieldClick(field)}
                                        onTap={() => handleFieldClick(field)}
                                        onDragEnd={(e) => {
                                          // Update bbox on drag
                                          const newX = e.target.x();
                                          const newY = e.target.y();
                                          const width = e.target.width();
                                          const height = e.target.height();

                                          // Convert back to normalized coordinates
                                          const normalizedX1 = Math.round(
                                            (newX / pageWidth) * 1000
                                          );
                                          const normalizedY1 = Math.round(
                                            (newY / pageHeight) * 1000
                                          );
                                          const normalizedX2 = Math.round(
                                            ((newX + width) / pageWidth) * 1000
                                          );
                                          const normalizedY2 = Math.round(
                                            ((newY + height) / pageHeight) *
                                              1000
                                          );

                                          const newBbox = [
                                            normalizedX1,
                                            normalizedY1,
                                            normalizedX2,
                                            normalizedY2,
                                          ];

                                          // Update state with new bbox
                                          setUpdatedFields((prev) => ({
                                            ...prev,
                                            [field.id]: {
                                              ...field,
                                              bbox: newBbox,
                                            },
                                          }));

                                          console.log(
                                            `Updated bbox for ${field.label}:`,
                                            newBbox
                                          );
                                        }}
                                        onTransformEnd={(e) => {
                                          // Handle resize
                                          const node = e.target;
                                          const scaleX = node.scaleX();
                                          const scaleY = node.scaleY();

                                          // Reset scale
                                          node.scaleX(1);
                                          node.scaleY(1);

                                          const newWidth =
                                            node.width() * scaleX;
                                          const newHeight =
                                            node.height() * scaleY;

                                          const normalizedX1 = Math.round(
                                            (node.x() / pageWidth) * 1000
                                          );
                                          const normalizedY1 = Math.round(
                                            (node.y() / pageHeight) * 1000
                                          );
                                          const normalizedX2 = Math.round(
                                            ((node.x() + newWidth) /
                                              pageWidth) *
                                              1000
                                          );
                                          const normalizedY2 = Math.round(
                                            ((node.y() + newHeight) /
                                              pageHeight) *
                                              1000
                                          );

                                          const newBbox = [
                                            normalizedX1,
                                            normalizedY1,
                                            normalizedX2,
                                            normalizedY2,
                                          ];

                                          setUpdatedFields((prev) => ({
                                            ...prev,
                                            [field.id]: {
                                              ...field,
                                              bbox: newBbox,
                                            },
                                          }));
                                        }}
                                        onMouseEnter={(e) => {
                                          const container = e.target
                                            .getStage()
                                            .container();
                                          container.style.cursor = "move";
                                        }}
                                        onMouseLeave={(e) => {
                                          const container = e.target
                                            .getStage()
                                            .container();
                                          container.style.cursor = "default";
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
                          .filter((field) => field.bbox)
                          .map((field, index) => {
                            const pixels = normalizedToPixels(field.bbox);
                            if (!pixels) return null;

                            const isSelected =
                              selectedField?.field_name === field.field_name;

                            return (
                              <Rect
                                key={index}
                                x={pixels.x}
                                y={pixels.y}
                                width={pixels.width}
                                height={pixels.height}
                                stroke={isSelected ? "#1d72f3" : "#34c759"}
                                strokeWidth={isSelected ? 3 : 2}
                                fill={
                                  isSelected
                                    ? "rgba(29, 114, 243, 0.15)"
                                    : "rgba(52, 199, 89, 0.1)"
                                }
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
