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
 * NewFieldPopup Component
 * Popup for creating or selecting a custom field for a manually drawn bbox
 */
const NewFieldPopup = ({
  bbox,
  pixelBbox,
  zoom,
  normalizedToPixels,
  onConfirm,
  onCancel,
  existingFields,
  batchMode,
  batchFieldName,
}) => {
  const [fieldName, setFieldName] = useState(batchFieldName || "");
  const [selectedExistingField, setSelectedExistingField] = useState(
    batchFieldName || ""
  );
  const [isNewField, setIsNewField] = useState(!batchFieldName);

  const pixels = normalizedToPixels(bbox);
  if (!pixels) return null;

  // Get unique field names from existing fields
  const existingFieldNames = [
    ...new Set(
      existingFields.map((f) => f.label || f.field_name).filter(Boolean)
    ),
  ];

  const handleSubmit = (continueDrawing = false, isBatchSplit = false) => {
    const finalFieldName = isNewField
      ? fieldName.trim()
      : selectedExistingField;
    if (!finalFieldName) {
      alert("Please enter a field name or select an existing field");
      return;
    }
    onConfirm(finalFieldName, isNewField, continueDrawing, isBatchSplit);
  };

  // In batch mode, show split option
  if (batchMode && batchFieldName) {
    return (
      <div
        className="bbox-popup"
        style={{
          position: "absolute",
          left: `${(pixels.x + pixels.width) * zoom + 1}px`,
          top: `${pixels.y * zoom}px`,
          zIndex: 1000,
          minWidth: "280px",
        }}
      >
        <div className="bbox-popup-content" style={{ padding: "1rem" }}>
          <p
            className="bbox-popup-message"
            style={{ marginBottom: "0.75rem", fontWeight: "bold" }}
          >
            Batch Split: {batchFieldName}
          </p>
          <p
            style={{
              fontSize: "0.875rem",
              marginBottom: "0.75rem",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Auto-detect and split into multiple instances?
          </p>
          <div
            className="bbox-popup-actions"
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
            }}
          >
            <button
              className="btn-popup btn-accept"
              onClick={() => handleSubmit(false, true)}
              title="Automatically split into multiple fields"
              style={{
                background: "#ff9800",
                color: "white",
                padding: "0.5rem 1rem",
              }}
            >
              ✂️ Split & Extract
            </button>
            <button className="btn-popup btn-cancel" onClick={onCancel}>
              ✗ Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bbox-popup"
      style={{
        position: "absolute",
        left: `${(pixels.x + pixels.width) * zoom + 1}px`,
        top: `${pixels.y * zoom}px`,
        zIndex: 1000,
        minWidth: "250px",
      }}
    >
      <div className="bbox-popup-content" style={{ padding: "1rem" }}>
        <p
          className="bbox-popup-message"
          style={{ marginBottom: "0.75rem", fontWeight: "bold" }}
        >
          Custom Field
        </p>

        <div style={{ marginBottom: "0.75rem" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <input
              type="radio"
              checked={isNewField}
              onChange={() => setIsNewField(true)}
            />
            <span>Create new field</span>
          </label>

          {isNewField && (
            <input
              type="text"
              placeholder="Field name (e.g., tax_id)"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "0.5rem",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.1)",
                color: "inherit",
                fontSize: "0.875rem",
              }}
              onKeyPress={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          )}
        </div>

        {existingFieldNames.length > 0 && (
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <input
                type="radio"
                checked={!isNewField}
                onChange={() => setIsNewField(false)}
              />
              <span>Use existing field</span>
            </label>

            {!isNewField && (
              <select
                value={selectedExistingField}
                onChange={(e) => setSelectedExistingField(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid rgba(255, 255, 255, 0.3)",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "inherit",
                  fontSize: "0.875rem",
                }}
              >
                <option value="">Select a field...</option>
                {existingFieldNames.map((name, idx) => (
                  <option key={idx} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div
          className="bbox-popup-actions"
          style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}
        >
          <button
            className="btn-popup btn-accept"
            onClick={handleSubmit}
            title="Extract text from bbox"
          >
            ✓ Extract
          </button>
          <button className="btn-popup btn-cancel" onClick={onCancel}>
            ✗ Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

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
  const [drawingMode, setDrawingMode] = useState(false); // Toggle for drawing new bboxes
  const [batchMode, setBatchMode] = useState(false); // Toggle for batch field creation
  const [batchFieldName, setBatchFieldName] = useState(""); // Field name for batch mode
  const [batchBboxes, setBatchBboxes] = useState([]); // Store multiple bboxes in batch mode
  const [newBbox, setNewBbox] = useState(null); // Store the new bbox being drawn
  const [isDrawing, setIsDrawing] = useState(false); // Track if user is currently drawing
  const [pendingNewField, setPendingNewField] = useState(null); // Store new bbox awaiting field assignment
  const [customFields, setCustomFields] = useState([]); // Store locally created custom fields
  const [extractingBatch, setExtractingBatch] = useState(false); // Track batch extraction progress
  const [extractingFields, setExtractingFields] = useState([]); // Track which fields are currently being extracted
  const [ocrBboxes, setOcrBboxes] = useState([]); // Store OCR-detected text bboxes
  const [selectedOcrBboxes, setSelectedOcrBboxes] = useState([]); // Store selected OCR bbox IDs for batch creation
  const [selectionMode, setSelectionMode] = useState(false); // Toggle for selecting OCR bboxes
  const [isSelectingArea, setIsSelectingArea] = useState(false); // Track if user is drawing selection rectangle
  const [selectionRect, setSelectionRect] = useState(null); // Selection rectangle for multi-select
  const scrollPositionRef = useRef({ top: 0, left: 0 }); // Track scroll position
  const containerRef = useRef(null); // Document viewer reference (scrollable container)
  const shapeRefs = useRef({}); // Refs for each shape for transformer
  const transformerRef = useRef(null);
  const fieldsPaneRef = useRef(null);
  const fieldItemRefs = useRef({}); // Refs for field items in the left pane

  // Extract fields from document data
  const fields = [...(documentData?.fields || []), ...customFields]; // Merge original and custom fields
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

  // Fetch OCR-detected text bboxes when entering selection mode
  useEffect(() => {
    if (!selectionMode || !documentData || !base64) {
      return;
    }

    // Only fetch if we don't already have bboxes for this page
    if (ocrBboxes.length > 0) {
      console.log(`Using cached OCR bboxes: ${ocrBboxes.length}`);
      return;
    }

    const fetchOcrBboxes = async () => {
      try {
        console.log("Fetching OCR bboxes for page", currentPage);

        // Use environment-aware URL (codespace or localhost)
        const isCodespace = window.location.hostname.includes("github.dev");
        const donutServiceUrl = isCodespace
          ? window.location.origin.replace("-3000.", "-3002.") +
            "/detect-text-bboxes"
          : "http://localhost:3002/detect-text-bboxes";

        console.log("Calling Donut OCR service at:", donutServiceUrl);

        // Get existing field bboxes to exclude from OCR detection
        const existingBboxes = fields
          .filter((f) => f.bbox && (!f.page || f.page === currentPage))
          .map((f) => f.bbox);

        console.log(
          `Excluding ${existingBboxes.length} existing field bboxes from OCR detection`
        );

        // Send JSON payload with base64 data (consistent with other endpoints)
        const response = await fetch(donutServiceUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image: base64,
            format: mimeType === "application/pdf" ? "pdf" : "png",
            page: currentPage,
            exclude_bboxes: existingBboxes,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to fetch OCR bboxes: ${response.status} - ${errorText}`
          );
        }

        const data = await response.json();
        console.log("OCR response data:", data);
        console.log(
          "OCR bboxes detected:",
          data.text_bboxes?.length || 0,
          "bboxes"
        );
        if (data.text_bboxes?.length > 0) {
          console.log("First bbox sample:", data.text_bboxes[0]);
        } else {
          console.warn("No OCR bboxes detected. Response status:", data.status);
        }
        setOcrBboxes(data.text_bboxes || []);
      } catch (error) {
        console.error("Error fetching OCR bboxes:", error);
        setOcrBboxes([]);
      }
    };

    console.log("Triggering OCR bbox detection...");
    fetchOcrBboxes();
  }, [
    selectionMode,
    documentData,
    base64,
    mimeType,
    currentPage,
    ocrBboxes.length,
  ]);

  // Clear OCR bboxes when document changes
  useEffect(() => {
    setOcrBboxes([]);
    setSelectedOcrBboxes([]);
  }, [documentData]);

  // Handle drawing new bbox OR selection rectangle
  const handleStageMouseDown = (e) => {
    // Don't interfere if clicking on an existing shape
    const clickedOnEmpty = e.target === e.target.getStage();
    if (!clickedOnEmpty) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    // Adjust for zoom
    const x = pos.x / zoom;
    const y = pos.y / zoom;

    if (drawingMode) {
      // Drawing new custom bbox
      setIsDrawing(true);
      setNewBbox({ x, y, width: 0, height: 0 });
    } else if (selectionMode) {
      // Drawing selection rectangle for multi-select
      setIsSelectingArea(true);
      setSelectionRect({ x, y, width: 0, height: 0 });
    }
  };

  const handleStageMouseMove = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    // Adjust for zoom
    const x = pos.x / zoom;
    const y = pos.y / zoom;

    if (drawingMode && isDrawing && newBbox) {
      setNewBbox({
        x: newBbox.x,
        y: newBbox.y,
        width: x - newBbox.x,
        height: y - newBbox.y,
      });
    } else if (selectionMode && isSelectingArea && selectionRect) {
      setSelectionRect({
        x: selectionRect.x,
        y: selectionRect.y,
        width: x - selectionRect.x,
        height: y - selectionRect.y,
      });
    }
  };

  const handleStageMouseUp = () => {
    if (drawingMode && isDrawing && newBbox) {
      setIsDrawing(false);

      // Only proceed if bbox has minimum size (at least 10x10 pixels)
      if (Math.abs(newBbox.width) < 10 || Math.abs(newBbox.height) < 10) {
        setNewBbox(null);
        return;
      }

      // Normalize bbox (handle negative dimensions from drawing right-to-left or bottom-to-top)
      const normalizedBbox = {
        x: newBbox.width < 0 ? newBbox.x + newBbox.width : newBbox.x,
        y: newBbox.height < 0 ? newBbox.y + newBbox.height : newBbox.y,
        width: Math.abs(newBbox.width),
        height: Math.abs(newBbox.height),
      };

      // Convert to normalized coordinates [0-1000]
      const normalizedCoords = [
        Math.round((normalizedBbox.x / pageWidth) * 1000),
        Math.round((normalizedBbox.y / pageHeight) * 1000),
        Math.round(
          ((normalizedBbox.x + normalizedBbox.width) / pageWidth) * 1000
        ),
        Math.round(
          ((normalizedBbox.y + normalizedBbox.height) / pageHeight) * 1000
        ),
      ];

      // Show field selection popup
      setPendingNewField({
        bbox: normalizedCoords,
        pixelBbox: normalizedBbox,
      });

      setNewBbox(null);
      setDrawingMode(false); // Exit drawing mode after creating bbox
    } else if (selectionMode && isSelectingArea && selectionRect) {
      setIsSelectingArea(false);

      // Only proceed if selection rect has minimum size
      if (
        Math.abs(selectionRect.width) < 10 ||
        Math.abs(selectionRect.height) < 10
      ) {
        setSelectionRect(null);
        return;
      }

      // Normalize selection rectangle
      const normalizedRect = {
        x:
          selectionRect.width < 0
            ? selectionRect.x + selectionRect.width
            : selectionRect.x,
        y:
          selectionRect.height < 0
            ? selectionRect.y + selectionRect.height
            : selectionRect.y,
        width: Math.abs(selectionRect.width),
        height: Math.abs(selectionRect.height),
      };

      // Find all OCR bboxes that intersect with selection rectangle
      const selectedIds = ocrBboxes
        .filter((ocrBbox) => {
          const pixels = normalizedToPixels(ocrBbox.bbox);
          if (!pixels) return false;

          // Check if bbox intersects with selection rectangle
          const intersects = !(
            pixels.x + pixels.width < normalizedRect.x ||
            pixels.x > normalizedRect.x + normalizedRect.width ||
            pixels.y + pixels.height < normalizedRect.y ||
            pixels.y > normalizedRect.y + normalizedRect.height
          );

          return intersects;
        })
        .map((bbox) => bbox.id);

      if (selectedIds.length > 0) {
        // Found OCR bboxes in selection - add them to selection
        setSelectedOcrBboxes((prev) => {
          const newSelection = [...prev];
          selectedIds.forEach((id) => {
            if (!newSelection.includes(id)) {
              newSelection.push(id);
            }
          });
          return newSelection;
        });
      } else {
        // No OCR bboxes found - user is manually drawing a missing bbox
        // Convert to normalized coordinates and add as a manual OCR bbox
        const normalizedCoords = [
          Math.round((normalizedRect.x / pageWidth) * 1000),
          Math.round((normalizedRect.y / pageHeight) * 1000),
          Math.round(
            ((normalizedRect.x + normalizedRect.width) / pageWidth) * 1000
          ),
          Math.round(
            ((normalizedRect.y + normalizedRect.height) / pageHeight) * 1000
          ),
        ];

        const manualBboxId = `manual_${Date.now()}`;
        const manualBbox = {
          id: manualBboxId,
          text: "[Manual selection]",
          bbox: normalizedCoords,
          confidence: 1.0,
          manual: true,
        };

        // Add to OCR bboxes list
        setOcrBboxes((prev) => [...prev, manualBbox]);

        // Auto-select the manual bbox
        setSelectedOcrBboxes((prev) => [...prev, manualBboxId]);

        console.log("Created manual bbox for missing text:", manualBbox);
      }

      setSelectionRect(null);
    }
  };

  // Handle new field confirmation
  const handleConfirmNewField = async (
    fieldName,
    isNewField,
    continueDrawing,
    isBatchSplit = false
  ) => {
    if (!pendingNewField) return;

    const { bbox, pixelBbox } = pendingNewField;

    // If batch split mode, extract multiple values from the large bbox
    if (isBatchSplit) {
      await handleBatchSplit(fieldName, bbox);
      setPendingNewField(null);
      setBatchMode(false);
      setBatchFieldName("");
      setDrawingMode(false);
      return;
    }

    const fieldId = `custom_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Extract text from the new bbox
    const extractedValue = await reextractTextFromBbox(
      { label: fieldName, id: fieldId },
      bbox
    );

    if (extractedValue !== null) {
      // Create new custom field
      const newField = {
        id: fieldId,
        field_name: fieldName,
        label: fieldName,
        value: extractedValue,
        bbox: bbox,
        confidence: 0.9, // Default confidence for custom fields
        page: currentPage,
        custom: true, // Mark as custom field
      };

      // Add to custom fields state
      setCustomFields((prev) => [...prev, newField]);

      console.log("Custom field created:", newField);
    }

    setPendingNewField(null);

    // If in batch mode and user wants to continue, keep drawing mode active
    if (batchMode && continueDrawing) {
      // Drawing mode stays active
      // Field name is already set in batchFieldName
    } else {
      // Exit batch mode and drawing mode
      setBatchMode(false);
      setBatchFieldName("");
      setDrawingMode(false);
    }
  };

  // Handle batch split - extract multiple values from a single large bbox
  const handleBatchSplit = async (fieldName, bbox) => {
    try {
      setExtractingBatch(true);

      // Call backend to get word-level OCR data
      const response = await fetch("/api/extract-batch-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: base64,
          mimeType: mimeType,
          bbox: bbox,
          fieldName: fieldName,
        }),
      });

      if (!response.ok) {
        throw new Error(`Batch extraction failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Add each extracted field to custom fields
      if (data.fields && data.fields.length > 0) {
        const newFields = data.fields.map((field, index) => ({
          id: `custom_${Date.now()}_${index}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          field_name: `${fieldName}_item_${index + 1}`,
          label: `${fieldName}_item_${index + 1}`,
          value: field.value,
          bbox: field.bbox,
          confidence: field.confidence || 0.9,
          page: currentPage,
          custom: true,
          batch: true,
          batchIndex: index + 1,
        }));

        setCustomFields((prev) => [...prev, ...newFields]);
        console.log(`Created ${newFields.length} batch fields:`, newFields);
        alert(
          `Successfully created ${newFields.length} instances of "${fieldName}"`
        );
      } else {
        alert("No values found in the selected area");
      }
    } catch (error) {
      console.error("Batch split error:", error);
      alert(`Failed to split bbox: ${error.message}`);
    } finally {
      setExtractingBatch(false);
    }
  };

  const handleCancelNewField = () => {
    setPendingNewField(null);
    // If canceling in batch mode, exit both modes
    if (batchMode) {
      setBatchMode(false);
      setBatchFieldName("");
      setDrawingMode(false);
    }
  };

  // Handle OCR bbox selection
  const handleOcrBboxClick = (ocrBbox) => {
    if (!selectionMode) return;

    setSelectedOcrBboxes((prev) => {
      const isSelected = prev.includes(ocrBbox.id);
      if (isSelected) {
        return prev.filter((id) => id !== ocrBbox.id);
      } else {
        return [...prev, ocrBbox.id];
      }
    });
  };

  // Create fields from selected OCR bboxes (non-blocking with progress indicator)
  const handleCreateFieldsFromSelection = async () => {
    if (selectedOcrBboxes.length === 0) {
      alert("Please select at least one text bbox");
      return;
    }

    const fieldName = prompt("Enter field name:");
    if (!fieldName) return;

    const selectedBboxes = ocrBboxes.filter((bbox) =>
      selectedOcrBboxes.includes(bbox.id)
    );

    // Clear selection and exit selection mode immediately (non-blocking)
    setSelectedOcrBboxes([]);
    setSelectionMode(false);

    // Show toast notification
    console.log(
      `Extracting ${selectedBboxes.length} field(s) in background...`
    );

    // Extract fields asynchronously without blocking UI
    selectedBboxes.forEach(async (ocrBbox, i) => {
      const fieldId = `custom_${Date.now()}_${i}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const finalFieldName =
        selectedBboxes.length > 1 ? `${fieldName}_item_${i + 1}` : fieldName;

      // Add to extracting list
      setExtractingFields((prev) => [...prev, fieldId]);

      try {
        // Extract text from bbox using Q&A model
        const extractedValue = await reextractTextFromBbox(
          { label: finalFieldName, id: fieldId },
          ocrBbox.bbox
        );

        if (extractedValue !== null) {
          const newField = {
            id: fieldId,
            field_name: finalFieldName,
            label: finalFieldName,
            value: extractedValue,
            bbox: ocrBbox.bbox,
            confidence: ocrBbox.confidence,
            page: currentPage,
            custom: true,
            fromOcr: true,
          };

          // Add field immediately when extraction completes
          setCustomFields((prev) => [...prev, newField]);
          console.log(`✓ Extracted: ${finalFieldName} = "${extractedValue}"`);
        }
      } catch (error) {
        console.error(`Error extracting field ${finalFieldName}:`, error);
      } finally {
        // Remove from extracting list
        setExtractingFields((prev) => prev.filter((id) => id !== fieldId));
      }
    });

    // Show confirmation that extraction started
    alert(
      `Started extracting ${selectedBboxes.length} field(s). You can continue working while extraction completes in the background.`
    );
  };

  const handleFieldClick = (field) => {
    const fieldKey = field.label || field.field_name || field.id;
    const isDeselecting = selectedField?.id === field.id;

    setSelectedField(isDeselecting ? null : field);

    // Scroll the field item into view in the left pane
    if (!isDeselecting && fieldItemRefs.current[field.id]) {
      fieldItemRefs.current[field.id].scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

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
        ref={(el) => (fieldItemRefs.current[field.id] = el)}
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
            <div
              style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
              <button
                className={`btn-page ${
                  drawingMode && !batchMode ? "active" : ""
                }`}
                onClick={() => {
                  setDrawingMode(!drawingMode);
                  setBatchMode(false);
                  setBatchFieldName("");
                }}
                title={
                  drawingMode ? "Cancel drawing" : "Draw single custom field"
                }
                style={{
                  backgroundColor:
                    drawingMode && !batchMode ? "#1976d2" : "transparent",
                  color: drawingMode && !batchMode ? "white" : "inherit",
                }}
              >
                {drawingMode && !batchMode ? "✗ Cancel" : "+ Single"}
              </button>
              <button
                className={`btn-page ${batchMode ? "active" : ""}`}
                onClick={() => {
                  if (!batchMode) {
                    // Entering batch mode
                    const fieldName = prompt(
                      "Enter field name for batch creation (e.g., 'hs_code'):"
                    );
                    if (fieldName && fieldName.trim()) {
                      setBatchFieldName(fieldName.trim());
                      setBatchMode(true);
                      setDrawingMode(true);
                    }
                  } else {
                    // Exiting batch mode
                    setBatchMode(false);
                    setBatchFieldName("");
                    setDrawingMode(false);
                  }
                }}
                title={
                  batchMode
                    ? `Exit batch mode (${batchFieldName})`
                    : "Draw multiple instances of same field"
                }
                style={{
                  backgroundColor: batchMode ? "#ff9800" : "transparent",
                  color: batchMode ? "white" : "inherit",
                }}
              >
                {batchMode ? `✗ Stop Batch (${batchFieldName})` : "+ Batch"}
              </button>
              <button
                className={`btn-page ${selectionMode ? "active" : ""}`}
                onClick={() => {
                  if (!selectionMode) {
                    setSelectionMode(true);
                    setDrawingMode(false);
                    setBatchMode(false);
                    setBatchFieldName("");
                    console.log(
                      `Selection mode activated. ${ocrBboxes.length} OCR bboxes available for selection`
                    );
                  } else {
                    setSelectionMode(false);
                    setSelectedOcrBboxes([]);
                  }
                }}
                title={
                  selectionMode
                    ? "Exit selection mode"
                    : `Select OCR-detected text bboxes (${ocrBboxes.length} available)`
                }
                style={{
                  backgroundColor: selectionMode ? "#34c759" : "transparent",
                  color: selectionMode ? "white" : "inherit",
                }}
              >
                {selectionMode
                  ? `✓ ${selectedOcrBboxes.length} Selected`
                  : `🔍 Select Text (${ocrBboxes.length})`}
              </button>
              {selectionMode && selectedOcrBboxes.length > 0 && (
                <button
                  className="btn-page"
                  onClick={handleCreateFieldsFromSelection}
                  style={{
                    backgroundColor: "#1976d2",
                    color: "white",
                  }}
                  title="Create fields from selected bboxes"
                >
                  ✓ Create {selectedOcrBboxes.length} Field
                  {selectedOcrBboxes.length > 1 ? "s" : ""}
                </button>
              )}
              {extractingFields.length > 0 && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    backgroundColor: "rgba(29, 114, 243, 0.1)",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                    color: "#1976d2",
                  }}
                >
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      border: "2px solid #1976d2",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  Extracting {extractingFields.length} field
                  {extractingFields.length > 1 ? "s" : ""}...
                </div>
              )}
            </div>
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
                            onMouseDown={handleStageMouseDown}
                            onMouseMove={handleStageMouseMove}
                            onMouseUp={handleStageMouseUp}
                            style={{
                              cursor: drawingMode ? "crosshair" : "default",
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

                              {/* Render OCR-detected text bboxes (selectable) */}
                              {selectionMode &&
                                ocrBboxes.map((ocrBbox) => {
                                  const pixels = normalizedToPixels(
                                    ocrBbox.bbox
                                  );
                                  if (!pixels) return null;

                                  const isSelected = selectedOcrBboxes.includes(
                                    ocrBbox.id
                                  );

                                  return (
                                    <Rect
                                      key={ocrBbox.id}
                                      x={pixels.x}
                                      y={pixels.y}
                                      width={pixels.width}
                                      height={pixels.height}
                                      stroke={
                                        isSelected ? "#34c759" : "#ff9800"
                                      }
                                      strokeWidth={isSelected ? 3 : 1.5}
                                      fill={
                                        isSelected
                                          ? "rgba(52, 199, 89, 0.25)"
                                          : "rgba(255, 152, 0, 0.1)"
                                      }
                                      cornerRadius={2}
                                      onClick={() =>
                                        handleOcrBboxClick(ocrBbox)
                                      }
                                      onTap={() => handleOcrBboxClick(ocrBbox)}
                                      onContextMenu={(e) => {
                                        e.evt.preventDefault();
                                        const shouldDelete = window.confirm(
                                          `Remove this ${
                                            ocrBbox.manual ? "manual" : "OCR"
                                          } bbox?\n\nText: "${ocrBbox.text}"`
                                        );
                                        if (shouldDelete) {
                                          // Remove from OCR bboxes list
                                          setOcrBboxes((prev) =>
                                            prev.filter(
                                              (b) => b.id !== ocrBbox.id
                                            )
                                          );
                                          // Remove from selection if selected
                                          setSelectedOcrBboxes((prev) =>
                                            prev.filter(
                                              (id) => id !== ocrBbox.id
                                            )
                                          );
                                          console.log(
                                            `Removed bbox: ${ocrBbox.id}`
                                          );
                                        }
                                      }}
                                      onMouseEnter={(e) => {
                                        const container = e.target
                                          .getStage()
                                          .container();
                                        container.style.cursor = "pointer";
                                      }}
                                      onMouseLeave={(e) => {
                                        const container = e.target
                                          .getStage()
                                          .container();
                                        container.style.cursor = "default";
                                      }}
                                    />
                                  );
                                })}

                              {/* Render bbox being drawn */}
                              {newBbox && (
                                <Rect
                                  x={
                                    newBbox.width < 0
                                      ? newBbox.x + newBbox.width
                                      : newBbox.x
                                  }
                                  y={
                                    newBbox.height < 0
                                      ? newBbox.y + newBbox.height
                                      : newBbox.y
                                  }
                                  width={Math.abs(newBbox.width)}
                                  height={Math.abs(newBbox.height)}
                                  stroke="#ff9800"
                                  strokeWidth={3}
                                  fill="rgba(255, 152, 0, 0.2)"
                                  dash={[10, 5]}
                                  listening={false}
                                />
                              )}

                              {/* Render selection rectangle for multi-select */}
                              {selectionRect && (
                                <Rect
                                  x={
                                    selectionRect.width < 0
                                      ? selectionRect.x + selectionRect.width
                                      : selectionRect.x
                                  }
                                  y={
                                    selectionRect.height < 0
                                      ? selectionRect.y + selectionRect.height
                                      : selectionRect.y
                                  }
                                  width={Math.abs(selectionRect.width)}
                                  height={Math.abs(selectionRect.height)}
                                  stroke="#1d72f3"
                                  strokeWidth={2}
                                  fill="rgba(29, 114, 243, 0.1)"
                                  dash={[5, 5]}
                                  listening={false}
                                />
                              )}

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
                          className="bbox-popup"
                          style={{
                            position: "absolute",
                            left: (() => {
                              const pixels = normalizedToPixels(
                                pendingReextraction.bbox
                              );
                              if (!pixels) return "50%";
                              const popupX =
                                (pixels.x + pixels.width) * zoom + 1;
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

                      {/* New Field Popup - for custom bbox creation */}
                      {pendingNewField && (
                        <NewFieldPopup
                          bbox={pendingNewField.bbox}
                          pixelBbox={pendingNewField.pixelBbox}
                          zoom={zoom}
                          normalizedToPixels={normalizedToPixels}
                          onConfirm={handleConfirmNewField}
                          onCancel={handleCancelNewField}
                          existingFields={fields}
                          batchMode={batchMode}
                          batchFieldName={batchFieldName}
                        />
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
                    <Stage
                      width={pageWidth}
                      height={pageHeight}
                      onMouseDown={handleStageMouseDown}
                      onMouseMove={handleStageMouseMove}
                      onMouseUp={handleStageMouseUp}
                      style={{ cursor: drawingMode ? "crosshair" : "default" }}
                    >
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

                        {/* Render bbox being drawn */}
                        {newBbox && (
                          <Rect
                            x={
                              newBbox.width < 0
                                ? newBbox.x + newBbox.width
                                : newBbox.x
                            }
                            y={
                              newBbox.height < 0
                                ? newBbox.y + newBbox.height
                                : newBbox.y
                            }
                            width={Math.abs(newBbox.width)}
                            height={Math.abs(newBbox.height)}
                            stroke="#ff9800"
                            strokeWidth={3}
                            fill="rgba(255, 152, 0, 0.2)"
                            dash={[10, 5]}
                            listening={false}
                          />
                        )}
                      </Layer>
                    </Stage>
                  </div>
                )}

                {/* New Field Popup - for custom bbox creation on images */}
                {pendingNewField && (
                  <NewFieldPopup
                    bbox={pendingNewField.bbox}
                    pixelBbox={pendingNewField.pixelBbox}
                    zoom={zoom}
                    normalizedToPixels={normalizedToPixels}
                    onConfirm={handleConfirmNewField}
                    onCancel={handleCancelNewField}
                    existingFields={fields}
                    batchMode={batchMode}
                    batchFieldName={batchFieldName}
                  />
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
