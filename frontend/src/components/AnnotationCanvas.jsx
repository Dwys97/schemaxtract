import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
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

// Memoized PDF Page component to prevent unnecessary re-renders
const MemoizedPDFPage = React.memo(
  ({ pageNumber, width, onRenderSuccess }) => {
    return (
      <Page
        key={`page-${pageNumber}`}
        pageNumber={pageNumber}
        onRenderSuccess={onRenderSuccess}
        renderTextLayer={true}
        renderAnnotationLayer={false}
        width={width}
      />
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if these specific props change
    return (
      prevProps.pageNumber === nextProps.pageNumber &&
      prevProps.width === nextProps.width
    );
  }
);

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
  const [reextractingField, setReextractingField] = useState(null); // Track which field is being re-extracted
  const [zoom, setZoom] = useState(1.0); // Zoom level (1.0 = 100%)
  const [pendingReextraction, setPendingReextraction] = useState(null); // Store bbox changes awaiting confirmation
  const scrollPositionRef = useRef({ top: 0, left: 0 }); // Track scroll position
  const containerRef = useRef(null); // Document viewer reference (scrollable container)
  const shapeRefs = useRef({}); // Refs for each shape for transformer
  const transformerRef = useRef(null);
  const fieldsPaneRef = useRef(null);

  // Extract fields from document data
  const fields = documentData?.fields || [];
  const extractedText = documentData?.extracted_text || "";
  const base64 = documentData?.base64 || "";
  const mimeType = documentData?.mimeType || "application/pdf";

  // Calculate document source for react-pdf
  const documentSource = useMemo(
    () => (base64 ? { data: atob(base64) } : null),
    [base64]
  );

  // Memoize page width to prevent unnecessary re-renders
  const [pageRenderWidth, setPageRenderWidth] = useState(600);

  useEffect(() => {
    if (containerRef.current) {
      const newWidth = containerRef.current.offsetWidth * 0.95;
      if (Math.abs(newWidth - pageRenderWidth) > 10) {
        // Only update if significant change
        setPageRenderWidth(newWidth);
      }
    }
  }, []); // Only run once on mount

  // Handle PDF load success
  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  }, []);

  // Handle page render success
  const onPageRenderSuccess = useCallback((page) => {
    setPageWidth(page.width);
    setPageHeight(page.height);
  }, []);

  // Convert normalized coordinates [0,0,1000,1000] to actual pixel coordinates
  const normalizedToPixels = useCallback(
    (bbox) => {
      if (!bbox || !pageWidth || !pageHeight) return null;

      const [x1, y1, x2, y2] = bbox;
      return {
        x: (x1 / 1000) * pageWidth,
        y: (y1 / 1000) * pageHeight,
        width: ((x2 - x1) / 1000) * pageWidth,
        height: ((y2 - y1) / 1000) * pageHeight,
      };
    },
    [pageWidth, pageHeight]
  );

  // Memoize inline styles to prevent re-renders
  const pdfScaleStyle = useMemo(
    () => ({
      transform: `scale(${zoom})`,
      transformOrigin: "top center",
      transition: "transform 0.3s ease-in-out",
      position: "relative",
    }),
    [zoom]
  );

  const overlayScaleStyle = useMemo(
    () => ({
      transform: `scale(${zoom})`,
      transformOrigin: "top center",
      transition: "transform 0.3s ease-in-out",
    }),
    [zoom]
  );

  // Re-extract text from a specific bbox using OCR
  const reextractTextFromBbox = async (field, newBbox) => {
    try {
      setReextractingField(field.id);
      console.log(
        `Re-extracting text for field ${field.label} from bbox:`,
        newBbox
      );

      // Call the donut service to re-extract text
      // In development, use relative URL or environment-specific URL
      const isCodespace = window.location.hostname.includes("github.dev");
      const donutServiceUrl = isCodespace
        ? window.location.origin.replace("-3000.", "-3002.") + "/reextract-bbox"
        : "http://localhost:3002/reextract-bbox";

      console.log(`Calling Donut service at: ${donutServiceUrl}`);

      const response = await fetch(donutServiceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64,
          format: mimeType === "application/pdf" ? "pdf" : "png",
          bbox: newBbox,
          page: field.page || currentPage,
        }),
      });

      if (!response.ok) {
        throw new Error(`Re-extraction failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.status === "success") {
        const extractedText = result.text;
        const confidence = result.confidence;

        console.log(
          `Re-extracted text: "${extractedText}" (confidence: ${confidence})`
        );

        // Update the field with new value and bbox
        setUpdatedFields((prev) => ({
          ...prev,
          [field.id]: {
            ...field,
            value: extractedText,
            bbox: newBbox,
            confidence: confidence,
          },
        }));

        return extractedText;
      } else {
        throw new Error(result.error || "Re-extraction failed");
      }
    } catch (error) {
      console.error("Error re-extracting text:", error);
      alert(`Failed to re-extract text: ${error.message}`);
      return null;
    } finally {
      setReextractingField(null);
    }
  };

  // Handle bbox change confirmation
  const handleConfirmReextraction = async () => {
    if (!pendingReextraction) return;

    const { field, bbox } = pendingReextraction;
    setPendingReextraction(null);

    // Perform re-extraction
    await reextractTextFromBbox(field, bbox);
  };

  const handleCancelReextraction = () => {
    if (!pendingReextraction) return;

    // Revert the bbox change in updatedFields
    const { field, originalBbox } = pendingReextraction;

    // Revert to original bbox in state
    setUpdatedFields((prev) => {
      const newFields = { ...prev };
      if (newFields[field.id]) {
        newFields[field.id] = {
          ...newFields[field.id],
          bbox: originalBbox,
        };
      }
      return newFields;
    });

    setPendingReextraction(null);

    // Reset the shape to original position/size visually
    if (shapeRefs.current[field.id]) {
      const pixels = normalizedToPixels(originalBbox);
      if (pixels) {
        const shape = shapeRefs.current[field.id];
        shape.x(pixels.x);
        shape.y(pixels.y);
        shape.width(pixels.width);
        shape.height(pixels.height);
        shape.getLayer().batchDraw();
      }
    }
  };

  // Effect to attach transformer when field selection changes
  useEffect(() => {
    if (
      selectedField &&
      transformerRef.current &&
      shapeRefs.current[selectedField.id]
    ) {
      transformerRef.current.nodes([shapeRefs.current[selectedField.id]]);
      transformerRef.current.getLayer()?.batchDraw();
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedField]);

  // Preserve scroll position on state updates (except when zooming/selecting)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Save scroll position before render
    const handleScroll = () => {
      scrollPositionRef.current = {
        top: container.scrollTop,
        left: container.scrollLeft,
      };
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle field selection
  const handleFieldClick = (field) => {
    const fieldKey = field.label || field.field_name || field.id;
    const isDeselecting = selectedField?.id === field.id;

    setSelectedField(isDeselecting ? null : field);

    // Navigate to the page containing the field if needed
    if (field.page && field.page !== currentPage) {
      setCurrentPage(field.page);
    }

    // Zoom in when selecting, zoom out when deselecting
    if (isDeselecting) {
      setZoom(1.0); // Reset to 100%
    } else {
      setZoom(1.3); // Zoom to 130%

      // Scroll the bbox into view after zoom and page navigation
      setTimeout(() => {
        if (field.bbox && containerRef.current) {
          const pixels = normalizedToPixels(field.bbox);
          if (pixels) {
            const viewer = containerRef.current;

            // Calculate bbox center position AFTER zoom is applied
            const bboxCenterX = (pixels.x + pixels.width / 2) * 1.3;
            const bboxCenterY = (pixels.y + pixels.height / 2) * 1.3;

            // Get viewport dimensions
            const viewerWidth = viewer.clientWidth;
            const viewerHeight = viewer.clientHeight;

            // Calculate scroll positions to center the bbox
            const targetScrollLeft = bboxCenterX - viewerWidth / 2;
            const targetScrollTop = bboxCenterY - viewerHeight / 2;

            // Scroll to center the bbox
            viewer.scrollTo({
              left: Math.max(0, targetScrollLeft),
              top: Math.max(0, targetScrollTop),
              behavior: "smooth",
            });
          }
        }
      }, 350); // Wait for zoom animation and page render
    }
  };

  // Render field list item
  const renderFieldItem = (field, index) => {
    const isSelected = selectedField?.id === field.id;
    const isReextracting = reextractingField === field.id;
    const updatedField = updatedFields[field.id];
    const confidence = updatedField?.confidence || field.confidence || 0;
    const confidenceColor =
      confidence > 0.8 ? "high" : confidence > 0.5 ? "medium" : "low";
    const fieldLabel = field.label || field.field_name || `Field ${index + 1}`;
    const fieldValue = updatedField?.value || field.value || "N/A";
    const hasBeenUpdated =
      updatedField &&
      (updatedField.value !== field.value ||
        JSON.stringify(updatedField.bbox) !== JSON.stringify(field.bbox));

    return (
      <div
        key={field.id || index}
        className={`field-item ${isSelected ? "selected" : ""} ${
          hasBeenUpdated ? "updated" : ""
        }`}
        onClick={() => handleFieldClick(field)}
      >
        <div className="field-header">
          <span className="field-name">
            {fieldLabel}
            {hasBeenUpdated && (
              <span
                className="update-indicator"
                title="Value updated from bbox"
              >
                🔄
              </span>
            )}
          </span>
          {confidence > 0 && (
            <span className={`confidence-badge badge-${confidenceColor}`}>
              {(confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="field-value text-muted">
          {isReextracting ? (
            <span className="reextracting-indicator">⏳ Re-extracting...</span>
          ) : (
            fieldValue
          )}
        </div>
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
    <div className="annotation-canvas">
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
                    <div className="page-wrapper">
                      <div style={pdfScaleStyle}>
                        <MemoizedPDFPage
                          pageNumber={currentPage}
                          width={pageRenderWidth}
                          onRenderSuccess={onPageRenderSuccess}
                        />
                      </div>

                      {/* Konva Overlay for Annotations - Positioned over the PDF */}
                      {pageWidth && pageHeight && (
                        <div
                          className="annotation-overlay"
                          style={overlayScaleStyle}
                        >
                          <Stage
                            width={pageWidth}
                            height={pageHeight}
                            onMouseDown={(e) => {
                              // Adjust for CSS transform scale
                              const stage = e.target.getStage();
                              const pointerPos = stage.getPointerPosition();
                              if (pointerPos) {
                                // Konva will handle the rest
                              }
                            }}
                          >
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
                                        ref={(el) => {
                                          shapeRefs.current[field.id] = el;
                                        }}
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
                                        name={`bbox-${field.id}`}
                                        onDragMove={(e) => {
                                          // Prevent drag from going outside bounds
                                          const shape = e.target;
                                          const x = shape.x();
                                          const y = shape.y();
                                          const width = shape.width();
                                          const height = shape.height();

                                          // Keep bbox within page bounds
                                          shape.x(
                                            Math.max(
                                              0,
                                              Math.min(pageWidth - width, x)
                                            )
                                          );
                                          shape.y(
                                            Math.max(
                                              0,
                                              Math.min(pageHeight - height, y)
                                            )
                                          );
                                        }}
                                        onClick={() => handleFieldClick(field)}
                                        onTap={() => handleFieldClick(field)}
                                        onDragEnd={(e) => {
                                          // Update bbox position immediately (visual update)
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

                                          // Update the bbox immediately in updatedFields
                                          setUpdatedFields((prev) => ({
                                            ...prev,
                                            [field.id]: {
                                              ...(prev[field.id] || field),
                                              bbox: newBbox,
                                            },
                                          }));

                                          console.log(
                                            `Bbox moved for ${field.label}:`,
                                            newBbox
                                          );

                                          // Get original bbox
                                          const currentBbox = field.bbox;

                                          // Show prompt to ask if user wants to re-extract
                                          setPendingReextraction({
                                            field,
                                            bbox: newBbox,
                                            originalBbox: currentBbox,
                                            action: "moved",
                                          });
                                        }}
                                        onTransformEnd={(e) => {
                                          // Update bbox size immediately (visual update)
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

                                          // Update the node dimensions
                                          node.width(newWidth);
                                          node.height(newHeight);

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

                                          // Update the bbox immediately in updatedFields
                                          setUpdatedFields((prev) => ({
                                            ...prev,
                                            [field.id]: {
                                              ...(prev[field.id] || field),
                                              bbox: newBbox,
                                            },
                                          }));

                                          console.log(
                                            `Bbox resized for ${field.label}:`,
                                            newBbox
                                          );

                                          // Get original bbox
                                          const currentBbox = field.bbox;

                                          // Show prompt to ask if user wants to re-extract
                                          setPendingReextraction({
                                            field,
                                            bbox: newBbox,
                                            originalBbox: currentBbox,
                                            action: "resized",
                                          });
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
                              {/* Transformer for resize handles - only show when field is selected */}
                              <Transformer
                                ref={transformerRef}
                                borderStroke="#1d72f3"
                                borderStrokeWidth={2}
                                anchorSize={12}
                                anchorStroke="#1d72f3"
                                anchorFill="#ffffff"
                                anchorStrokeWidth={2}
                                anchorCornerRadius={2}
                                enabledAnchors={[
                                  "top-left",
                                  "top-right",
                                  "bottom-left",
                                  "bottom-right",
                                  "middle-left",
                                  "middle-right",
                                  "top-center",
                                  "bottom-center",
                                ]}
                                boundBoxFunc={(oldBox, newBox) => {
                                  // Limit resize to stay within page bounds and minimum size
                                  if (newBox.width < 20 || newBox.height < 10) {
                                    return oldBox;
                                  }
                                  if (
                                    newBox.x < 0 ||
                                    newBox.y < 0 ||
                                    newBox.x + newBox.width > pageWidth ||
                                    newBox.y + newBox.height > pageHeight
                                  ) {
                                    return oldBox;
                                  }
                                  return newBox;
                                }}
                                rotateEnabled={false}
                                keepRatio={false}
                              />
                            </Layer>
                          </Stage>
                        </div>
                      )}

                      {/* Confirmation Popup - positioned next to bbox */}
                      {pendingReextraction && (
                        <div
                          className="bbox-popup glass-card-elevated"
                          style={{
                            position: "absolute",
                            left: (() => {
                              const pixels = normalizedToPixels(
                                pendingReextraction.bbox
                              );
                              if (!pixels) return "50%";
                              const popupX =
                                (pixels.x + pixels.width) * zoom + 10;
                              return `${popupX}px`;
                            })(),
                            top: (() => {
                              const pixels = normalizedToPixels(
                                pendingReextraction.bbox
                              );
                              if (!pixels) return "50%";
                              const popupY = pixels.y * zoom;
                              return `${popupY}px`;
                            })(),
                            zIndex: 1000,
                          }}
                        >
                          <div className="bbox-popup-content">
                            <p className="bbox-popup-message">
                              Re-extract text?
                            </p>
                            <div className="bbox-popup-actions">
                              <button
                                className="btn-popup btn-accept"
                                onClick={handleConfirmReextraction}
                              >
                                ✓
                              </button>
                              <button
                                className="btn-popup btn-cancel"
                                onClick={handleCancelReextraction}
                              >
                                ✗
                              </button>
                            </div>
                          </div>
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
