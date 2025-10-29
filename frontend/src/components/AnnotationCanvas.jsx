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
import templateService from "../services/templateService";

// Donut service URL - use Vite proxy to avoid CORS issues
const DONUT_SERVICE_URL = "/donut";

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
  const [selectedOcrBbox, setSelectedOcrBbox] = useState(null); // Track single OCR bbox for drag/resize (different from multi-select)
  const [selectionMode, setSelectionMode] = useState(false); // Toggle for selecting OCR bboxes
  const [isSelectingArea, setIsSelectingArea] = useState(false); // Track if user is drawing selection rectangle
  const [selectionRect, setSelectionRect] = useState(null); // Selection rectangle for multi-select
  const [vendorName, setVendorName] = useState(""); // Vendor name for template saving
  const [showTemplateSave, setShowTemplateSave] = useState(false); // Show template save dialog
  const [availableTemplates, setAvailableTemplates] = useState([]); // List of saved templates
  const [showTemplateLoad, setShowTemplateLoad] = useState(false); // Show template load dialog
  const scrollPositionRef = useRef({ top: 0, left: 0 }); // Track scroll position
  const containerRef = useRef(null); // Document viewer reference (scrollable container)
  const shapeRefs = useRef({}); // Refs for each shape for transformer
  const ocrShapeRefs = useRef({}); // Refs for OCR bbox shapes for transformer
  const transformerRef = useRef(null);
  const fieldsPaneRef = useRef(null);
  const fieldItemRefs = useRef({}); // Refs for field items in the left pane

  // Extract fields from document data
  // Deduplicate fields by field_name/label - keep custom fields over original if duplicates exist
  const originalFields = documentData?.fields || [];
  const allFields = [...originalFields, ...customFields];

  // Create map keyed by field name to remove duplicates (custom fields take precedence)
  const fieldMap = new Map();

  // First add original fields
  originalFields.forEach((field) => {
    const key = field.label || field.field_name || field.id;
    if (!fieldMap.has(key)) {
      fieldMap.set(key, field);
    }
  });

  // Then add custom fields (these override originals with same name)
  customFields.forEach((field) => {
    const key = field.label || field.field_name || field.id;
    fieldMap.set(key, field); // Override if exists
  });

  const fields = Array.from(fieldMap.values());

  if (allFields.length !== fields.length) {
    console.log(
      `[AnnotationCanvas] Deduplicated ${allFields.length} fields to ${
        fields.length
      } (removed ${allFields.length - fields.length} duplicates)`
    );
  }
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
  // CRITICAL: Use extraction image dimensions (from backend), not PDF render dimensions
  const normalizedToPixels = useCallback(
    (bbox) => {
      if (!bbox || !pageWidth || !pageHeight) return null;

      // Get extraction image dimensions from backend metadata
      const extractionWidth = documentData?.metadata?.image_size?.width;
      const extractionHeight = documentData?.metadata?.image_size?.height;

      if (!extractionWidth || !extractionHeight) {
        console.warn(
          "[normalizedToPixels] Missing extraction image dimensions, falling back to PDF render dimensions"
        );
        const [x1, y1, x2, y2] = bbox;
        return {
          x: (x1 / 1000) * pageWidth,
          y: (y1 / 1000) * pageHeight,
          width: ((x2 - x1) / 1000) * pageWidth,
          height: ((y2 - y1) / 1000) * pageHeight,
        };
      }

      // Step 1: Convert normalized coords (0-1000) to extraction image pixel coords
      const [x1, y1, x2, y2] = bbox;
      const extractionX1 = (x1 / 1000) * extractionWidth;
      const extractionY1 = (y1 / 1000) * extractionHeight;
      const extractionX2 = (x2 / 1000) * extractionWidth;
      const extractionY2 = (y2 / 1000) * extractionHeight;

      // Step 2: Scale from extraction dimensions to PDF render dimensions
      const scaleX = pageWidth / extractionWidth;
      const scaleY = pageHeight / extractionHeight;

      const scaledX = extractionX1 * scaleX;
      const scaledY = extractionY1 * scaleY;
      const scaledWidth = (extractionX2 - extractionX1) * scaleX;
      const scaledHeight = (extractionY2 - extractionY1) * scaleY;

      console.log(
        `[normalizedToPixels] bbox [${x1},${y1},${x2},${y2}] -> extraction [${extractionX1.toFixed(
          1
        )},${extractionY1.toFixed(1)},${extractionX2.toFixed(
          1
        )},${extractionY2.toFixed(1)}] -> scaled [${scaledX.toFixed(
          1
        )},${scaledY.toFixed(1)},${scaledWidth.toFixed(
          1
        )},${scaledHeight.toFixed(
          1
        )}] (extraction ${extractionWidth}x${extractionHeight}, render ${pageWidth.toFixed(
          1
        )}x${pageHeight.toFixed(1)})`
      );

      return {
        x: scaledX,
        y: scaledY,
        width: scaledWidth,
        height: scaledHeight,
      };
    },
    [pageWidth, pageHeight, documentData?.metadata?.image_size]
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
      // Use Vite proxy to avoid CORS issues in Codespaces
      const donutServiceUrl = `${DONUT_SERVICE_URL}/reextract-bbox`;

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

        // Deselect the field after re-extraction so bbox turns green
        setSelectedField(null);

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
    if (!transformerRef.current) return;

    // Priority: OCR bbox selection (for drag/resize) over field selection
    if (selectedOcrBbox && ocrShapeRefs.current[selectedOcrBbox.id]) {
      transformerRef.current.nodes([ocrShapeRefs.current[selectedOcrBbox.id]]);
      transformerRef.current.getLayer()?.batchDraw();
    } else if (selectedField && shapeRefs.current[selectedField.id]) {
      transformerRef.current.nodes([shapeRefs.current[selectedField.id]]);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedField, selectedOcrBbox]);

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

        const donutServiceUrl = `${DONUT_SERVICE_URL}/detect-text-bboxes`;
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
    } else {
      // Normal view mode: clicking empty space deselects any selected field
      if (selectedField) {
        setSelectedField(null);
      }
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

    // Sort bboxes by Y-position (top to bottom) for proper ordering
    const sortedBboxes = selectedBboxes.sort((a, b) => {
      const aY = a.bbox[1]; // y1 coordinate (top of bbox)
      const bY = b.bbox[1];
      return aY - bY; // Ascending order (top to bottom)
    });

    console.log(
      "Sorted bboxes by Y-position (top to bottom):",
      sortedBboxes.map((b) => ({
        id: b.id,
        y: b.bbox[1],
        text: b.text,
      }))
    );

    // Clear selection and exit selection mode immediately (non-blocking)
    setSelectedOcrBboxes([]);
    setSelectionMode(false);

    // Show toast notification
    console.log(`Extracting ${sortedBboxes.length} field(s) in background...`);

    // Extract fields asynchronously without blocking UI
    sortedBboxes.forEach(async (ocrBbox, i) => {
      const fieldId = `custom_${Date.now()}_${i}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const finalFieldName =
        sortedBboxes.length > 1 ? `${fieldName}_item_${i + 1}` : fieldName;

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
            sortOrder: i, // Add sort order for consistent display
          };

          // Add field immediately when extraction completes
          setCustomFields((prev) => [...prev, newField]);
          console.log(
            `✓ Extracted: ${finalFieldName} = "${extractedValue}" (Y-pos: ${ocrBbox.bbox[1]})`
          );
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
      `Started extracting ${sortedBboxes.length} field(s) in top-to-bottom order. You can continue working while extraction completes in the background.`
    );
  };

  // Suggest other columns on the same page based on selected fields (intelligent column detection)
  const handleSuggestColumns = async () => {
    const currentPageFields = customFields.filter(
      (f) => f.page === currentPage && f.bbox
    );

    if (currentPageFields.length === 0) {
      alert(
        `No custom fields found on this page.\n\nCreate at least one column of fields first using "Select Text" mode.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Suggest other columns based on ${currentPageFields.length} field(s)?\n\n` +
        `This will:\n` +
        `• Analyze table structure on this page\n` +
        `• Detect column headers if available\n` +
        `• Find parallel columns with matching rows\n` +
        `• Suggest field names from headers or positions`
    );

    if (!confirmed) return;

    console.log(
      `Suggesting columns on page ${currentPage} based on ${currentPageFields.length} template fields`
    );

    try {
      // Call the intelligent template endpoint
      const intelligentServiceUrl = `${DONUT_SERVICE_URL}/apply-template-intelligent`;
      console.log(`Calling intelligent service at: ${intelligentServiceUrl}`);

      // Prepare template fields for the API
      const templateFieldsData = currentPageFields.map((f) => ({
        field_name: f.label || f.field_name,
        value: f.value || "",
        bbox: f.bbox,
      }));

      const response = await fetch(intelligentServiceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64,
          format: mimeType === "application/pdf" ? "pdf" : "png",
          source_page: currentPage,
          target_page: currentPage, // Same page for column detection
          template_fields: templateFieldsData,
          suggest_columns: true, // Enable column suggestion mode
        }),
      });

      if (!response.ok) {
        throw new Error(`Column suggestion failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.status === "success") {
        const suggestedFields = result.fields || [];

        console.log(`✓ Received ${suggestedFields.length} suggested fields`);

        // Add suggested fields to custom fields
        let addedCount = 0;
        for (const suggestedField of suggestedFields) {
          const fieldId = `custom_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          const newField = {
            id: fieldId,
            field_name: suggestedField.field_name,
            label: suggestedField.field_name,
            value: suggestedField.value,
            bbox: suggestedField.bbox,
            confidence: suggestedField.confidence,
            page: currentPage,
            custom: true,
            fromColumnSuggestion: true,
            columnHeader: suggestedField.column_header,
          };

          setCustomFields((prev) => [...prev, newField]);
          addedCount++;

          console.log(
            `✓ Added suggested field: ${suggestedField.field_name} = "${
              suggestedField.value
            }" ${
              suggestedField.column_header
                ? `(header: ${suggestedField.column_header})`
                : ""
            }`
          );
        }

        alert(
          `Column suggestion complete!\n\n` +
            `✓ Added ${addedCount} field(s) from ${result.fields.length} suggested columns\n\n` +
            `${
              suggestedFields.some((f) => f.column_header)
                ? "Column headers detected and used for field names."
                : "Field names generated from column positions."
            }`
        );
      } else {
        throw new Error(result.error || "Column suggestion failed");
      }
    } catch (error) {
      console.error("Error in column suggestion:", error);
      alert(
        `Column suggestion failed: ${error.message}\n\nPlease try again or check the console for details.`
      );
    }
  };

  // Save current fields as a vendor template
  const handleSaveTemplate = async () => {
    if (customFields.length === 0) {
      alert(
        "No custom fields to save as template.\n\nCreate fields first using 'Select Text' mode."
      );
      return;
    }

    let vendor = vendorName.trim();
    if (!vendor) {
      vendor = prompt(
        "Enter vendor name for this template:\n\n(e.g., 'acme_corp', 'vendor_a')\n\n" +
          "This will save the current field layout for reuse on similar invoices."
      );

      if (!vendor) return; // User cancelled
      vendor = vendor
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");
      setVendorName(vendor);
    }

    try {
      await templateService.saveTemplate(
        vendor,
        customFields.map((f) => ({
          field_name: f.field_name || f.label,
          bbox: f.bbox,
          field_type: typeof f.value === "number" ? "number" : "text",
          required: false,
        })),
        {
          page_count: numPages,
          description: `Template for ${vendor} invoices`,
          field_count: customFields.length,
        }
      );

      alert(
        `✓ Template saved successfully!\n\nVendor: ${vendor}\nFields: ${customFields.length}\n\nYou can now load this template on similar invoices.`
      );

      // Refresh template list
      const templates = await templateService.listTemplates();
      setAvailableTemplates(templates);
    } catch (error) {
      console.error("Failed to save template:", error);
      alert(`Failed to save template: ${error.message}`);
    }
  };

  // Load a vendor template
  const handleLoadTemplate = async (vendorToLoad) => {
    let vendor = vendorToLoad;

    if (!vendor) {
      // Show list of available templates
      try {
        const templates = await templateService.listTemplates();
        setAvailableTemplates(templates);

        if (templates.length === 0) {
          alert(
            "No saved templates found.\n\nCreate and save templates first using 'Save Template' button."
          );
          return;
        }

        vendor = prompt(
          `Available templates:\n${templates
            .map((t, i) => `${i + 1}. ${t}`)
            .join("\n")}\n\n` + "Enter vendor name to load:"
        );

        if (!vendor) return; // User cancelled
      } catch (error) {
        console.error("Failed to list templates:", error);
        alert(`Failed to list templates: ${error.message}`);
        return;
      }
    }

    try {
      const template = await templateService.loadTemplate(vendor);

      if (!template) {
        alert(`Template not found: ${vendor}`);
        return;
      }

      const confirmed = window.confirm(
        `Load template "${vendor}"?\n\n` +
          `This will:\n` +
          `• Add ${template.fields.length} field(s) to current page\n` +
          `• Use saved field positions and names\n` +
          `• Auto-extract values from document\n\n` +
          `Current custom fields (${customFields.length}) will be preserved.`
      );

      if (!confirmed) return;

      // Add template fields to current page
      const newFields = template.fields.map((f) => ({
        id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        field_name: f.field_name,
        label: f.field_name,
        bbox: f.bbox,
        page: currentPage,
        custom: true,
        fromTemplate: true,
        templateVendor: vendor,
        value: "", // Will be extracted
      }));

      setCustomFields((prev) => [...prev, ...newFields]);
      setVendorName(vendor);

      // Auto-extract values for loaded fields
      for (const field of newFields) {
        await reextractTextFromBbox(field, field.bbox);
      }

      alert(
        `✓ Template loaded successfully!\n\nVendor: ${vendor}\nAdded ${newFields.length} fields\n\nValues extracted automatically.`
      );
    } catch (error) {
      console.error("Failed to load template:", error);
      alert(`Failed to load template: ${error.message}`);
    }
  };

  // Apply template from current page to next page (intelligent template + LLM + OCR alignment)
  const handleApplyTemplateToNextPage = async () => {
    const sourcePage = currentPage;
    const targetPage = currentPage + 1;

    if (!numPages || targetPage > numPages) {
      alert("No next page available");
      return;
    }

    // Get custom fields from current page only (template fields)
    const templateFields = customFields.filter(
      (f) => f.page === sourcePage && f.bbox
    );

    if (templateFields.length === 0) {
      alert(
        `No custom fields found on page ${sourcePage} to use as template.\n\nCreate fields on this page first using "Select Text" mode.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Apply ${templateFields.length} field template(s) from page ${sourcePage} to page ${targetPage}?\n\n` +
        `This will:\n` +
        `• Detect OCR text positions on page ${targetPage}\n` +
        `• Intelligently align template bboxes with actual text\n` +
        `• Handle layout shifts and varying item counts\n` +
        `• Extract values using LLM intelligence`
    );

    if (!confirmed) return;

    console.log(
      `Applying ${templateFields.length} templates from page ${sourcePage} to page ${targetPage} with OCR alignment`
    );

    // Navigate to target page first
    setCurrentPage(targetPage);

    // Wait for page to load, then fetch OCR bboxes for target page
    setTimeout(async () => {
      try {
        // Step 1: Fetch OCR bboxes for target page
        console.log(`Fetching OCR bboxes for page ${targetPage}...`);
        const isCodespace = window.location.hostname.includes("github.dev");
        const ocrServiceUrl = `${DONUT_SERVICE_URL}/detect-text-bboxes`;

        const ocrResponse = await fetch(ocrServiceUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image: base64,
            format: mimeType === "application/pdf" ? "pdf" : "png",
            page: targetPage,
            exclude_bboxes: [],
          }),
        });

        if (!ocrResponse.ok) {
          throw new Error(`OCR detection failed: ${ocrResponse.statusText}`);
        }

        const ocrData = await ocrResponse.json();
        const targetPageOcrBboxes = ocrData.text_bboxes || [];
        console.log(
          `Found ${targetPageOcrBboxes.length} OCR bboxes on page ${targetPage}`
        );

        // Step 2: For each template field, find best matching OCR bbox or use template position
        let successCount = 0;
        let skippedCount = 0;
        let alignedCount = 0;

        for (const templateField of templateFields) {
          const fieldId = `custom_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          // Template bbox from source page
          const templateBbox = templateField.bbox;

          // Extract field name without page-specific suffixes
          let baseFieldName = templateField.label || templateField.field_name;
          baseFieldName = baseFieldName.replace(/_item_\d+$/, "");

          // Calculate center Y position of template bbox (for vertical alignment)
          const templateCenterY = (templateBbox[1] + templateBbox[3]) / 2;
          const templateCenterX = (templateBbox[0] + templateBbox[2]) / 2;

          // Find OCR bboxes near the template position (within ±150 normalized units in Y)
          const nearbyOcrBboxes = targetPageOcrBboxes.filter((ocrBbox) => {
            const ocrCenterY = (ocrBbox.bbox[1] + ocrBbox.bbox[3]) / 2;
            const yDistance = Math.abs(ocrCenterY - templateCenterY);
            return yDistance < 150; // Allow 15% vertical shift
          });

          // Choose bbox: use closest OCR bbox if available, otherwise use template bbox
          let finalBbox = templateBbox;
          let alignmentUsed = false;

          if (nearbyOcrBboxes.length > 0) {
            // Find closest OCR bbox by distance (both X and Y)
            let closestBbox = nearbyOcrBboxes[0];
            let minDistance = Infinity;

            for (const ocrBbox of nearbyOcrBboxes) {
              const ocrCenterY = (ocrBbox.bbox[1] + ocrBbox.bbox[3]) / 2;
              const ocrCenterX = (ocrBbox.bbox[0] + ocrBbox.bbox[2]) / 2;
              const distance = Math.sqrt(
                Math.pow(ocrCenterX - templateCenterX, 2) +
                  Math.pow(ocrCenterY - templateCenterY, 2)
              );

              if (distance < minDistance) {
                minDistance = distance;
                closestBbox = ocrBbox;
              }
            }

            finalBbox = closestBbox.bbox;
            alignmentUsed = true;
            alignedCount++;
            console.log(
              `📍 Aligned ${baseFieldName}: template Y=${templateCenterY.toFixed(
                0
              )} → OCR Y=${(
                (closestBbox.bbox[1] + closestBbox.bbox[3]) /
                2
              ).toFixed(0)} (shift: ${Math.abs(
                templateCenterY -
                  (closestBbox.bbox[1] + closestBbox.bbox[3]) / 2
              ).toFixed(0)})`
            );
          } else {
            console.log(
              `⚠️  No nearby OCR bbox for ${baseFieldName}, using template position`
            );
          }

          // Add to extracting list
          setExtractingFields((prev) => [...prev, fieldId]);

          try {
            // Call donut service to extract from the final bbox
            const donutServiceUrl = `${DONUT_SERVICE_URL}/reextract-bbox`;

            console.log(
              `Extracting ${baseFieldName} from page ${targetPage}, ${
                alignmentUsed ? "OCR-aligned" : "template"
              } bbox:`,
              finalBbox
            );

            const response = await fetch(donutServiceUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                image: base64,
                format: mimeType === "application/pdf" ? "pdf" : "png",
                bbox: finalBbox,
                page: targetPage,
              }),
            });

            if (!response.ok) {
              throw new Error(`Extraction failed: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.status === "success") {
              const extractedValue = result.text;
              const confidence = result.confidence;

              // Intelligent filtering: Skip if extracted value is empty, whitespace, or very low confidence
              const isEmpty =
                !extractedValue ||
                extractedValue.trim() === "" ||
                extractedValue.trim() === "-";
              const isLowConfidence = confidence < 0.3;

              if (isEmpty || isLowConfidence) {
                console.log(
                  `⊘ Skipped empty/low-confidence field: ${baseFieldName} (value: "${extractedValue}", confidence: ${confidence})`
                );
                skippedCount++;
              } else {
                const newField = {
                  id: fieldId,
                  field_name: baseFieldName,
                  label: baseFieldName,
                  value: extractedValue,
                  bbox: finalBbox,
                  confidence: confidence,
                  page: targetPage,
                  custom: true,
                  fromTemplate: true,
                  templatePage: sourcePage,
                  ocrAligned: alignmentUsed, // Track if OCR alignment was used
                };

                setCustomFields((prev) => [...prev, newField]);
                console.log(
                  `✓ Template applied: ${baseFieldName} = "${extractedValue}" (page ${targetPage}, ${
                    alignmentUsed ? "OCR-aligned" : "template"
                  }, confidence: ${(confidence * 100).toFixed(0)}%)`
                );
                successCount++;
              }
            }
          } catch (error) {
            console.error(
              `Error applying template for ${baseFieldName}:`,
              error
            );
            skippedCount++;
          } finally {
            setExtractingFields((prev) => prev.filter((id) => id !== fieldId));
          }
        }

        // Show intelligent summary
        alert(
          `Template application complete!\n\n` +
            `✓ Successfully applied: ${successCount} field(s)\n` +
            `📍 OCR-aligned: ${alignedCount} field(s)\n` +
            `⊘ Skipped (empty/no data): ${skippedCount} field(s)\n\n` +
            `Extracted from page ${targetPage} with intelligent positioning.`
        );
      } catch (error) {
        console.error("Error in template application:", error);
        alert(
          `Template application failed: ${error.message}\n\nPlease try again or check the console for details.`
        );
      }
    }, 500); // Wait for page render
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
        key={
          field.id || `field-item-${field.field_name || field.label}-${index}`
        }
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
                {/* Removed page navigation - showing all pages */}
                <span className="page-info">
                  All Pages ({numPages} {numPages === 1 ? "page" : "pages"})
                </span>
                {/* Column Suggestion Button */}
                {customFields.filter((f) => f.bbox).length > 0 && (
                  <button
                    className="btn-page"
                    onClick={handleSuggestColumns}
                    style={{
                      backgroundColor: "#00bcd4",
                      color: "white",
                      marginLeft: "1rem",
                      fontWeight: "bold",
                    }}
                    title={`Suggest other columns based on ${
                      customFields.filter((f) => f.bbox).length
                    } selected field(s)`}
                  >
                    🔮 Suggest Columns
                  </button>
                )}
                {/* Save Template Button */}
                {customFields.length > 0 && (
                  <button
                    className="btn-page"
                    onClick={handleSaveTemplate}
                    style={{
                      backgroundColor: "#4caf50",
                      color: "white",
                      marginLeft: "0.5rem",
                      fontWeight: "bold",
                    }}
                    title="Save current field layout as reusable template"
                  >
                    💾 Save Template
                  </button>
                )}
                {/* Load Template Button */}
                <button
                  className="btn-page"
                  onClick={() => handleLoadTemplate()}
                  style={{
                    backgroundColor: "#ff9800",
                    color: "white",
                    marginLeft: "0.5rem",
                    fontWeight: "bold",
                  }}
                  title="Load a saved vendor template"
                >
                  📂 Load Template
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
              // PDF Viewer - All pages stacked vertically
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
                    {/* Render all pages vertically */}
                    {Array.from(new Array(numPages), (el, index) => (
                      <div
                        key={`page_${index + 1}`}
                        className="page-wrapper"
                        style={{ marginBottom: "20px" }}
                      >
                        <div style={pdfScaleStyle}>
                          <MemoizedPDFPage
                            pageNumber={index + 1}
                            width={pageRenderWidth}
                            onRenderSuccess={(page) => {
                              // Store dimensions for first page
                              if (index === 0) {
                                onPageRenderSuccess(page);
                              }
                            }}
                          />
                        </div>

                        {/* Konva Overlay for Annotations - Only on first page (where fields were extracted) */}
                        {pageWidth && pageHeight && index === 0 && (
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
                                {/* Debug: Log all fields and their bboxes */}
                                {fields.length > 0 &&
                                  console.log(
                                    "[AnnotationCanvas] Rendering fields:",
                                    fields.map((f) => ({
                                      label: f.label,
                                      value: f.value,
                                      bbox: f.bbox,
                                      page: f.page,
                                      hasValidBbox:
                                        f.bbox && f.bbox.length === 4,
                                    }))
                                  )}

                                {fields
                                  .filter((field) => {
                                    // Show field if: has bbox AND (no page specified OR matches this page)
                                    const hasPage = field.page !== undefined;
                                    const matchesPage =
                                      !hasPage || field.page === index + 1;
                                    const hasValidBbox =
                                      field.bbox && field.bbox.length === 4;

                                    if (!hasValidBbox) {
                                      console.warn(
                                        "[AnnotationCanvas] Field missing valid bbox:",
                                        field.label,
                                        field.bbox
                                      );
                                    }

                                    return hasValidBbox && matchesPage;
                                  })
                                  .map((field, fieldIndex) => {
                                    // Use updated bbox if available, otherwise original
                                    const currentBbox =
                                      updatedFields[field.id]?.bbox ||
                                      field.bbox;
                                    const pixels =
                                      normalizedToPixels(currentBbox);

                                    console.log(
                                      `[AnnotationCanvas] Field "${field.label}" (${field.value}):`,
                                      {
                                        bboxRaw: currentBbox,
                                        bboxValues: currentBbox
                                          ? `[${currentBbox[0]}, ${currentBbox[1]}, ${currentBbox[2]}, ${currentBbox[3]}]`
                                          : "null",
                                        pixels: pixels,
                                        pixelValues: pixels
                                          ? `x:${pixels.x.toFixed(
                                              1
                                            )}, y:${pixels.y.toFixed(
                                              1
                                            )}, w:${pixels.width.toFixed(
                                              1
                                            )}, h:${pixels.height.toFixed(1)}`
                                          : "null",
                                        pageWidth,
                                        pageHeight,
                                        isNormalized:
                                          currentBbox &&
                                          currentBbox.every((c) => c <= 1000),
                                        isOnScreen:
                                          pixels &&
                                          pixels.x >= 0 &&
                                          pixels.y >= 0 &&
                                          pixels.x < pageWidth &&
                                          pixels.y < pageHeight,
                                        rectWillRender: !!pixels,
                                      }
                                    );

                                    if (!pixels) {
                                      console.error(
                                        `[AnnotationCanvas] ❌ No pixels for field "${field.label}" - WILL NOT RENDER`
                                      );
                                      return null;
                                    }

                                    // Log the actual Rect being rendered
                                    console.log(
                                      `[AnnotationCanvas] ✅ Rendering Rect for "${
                                        field.label
                                      }" at x=${pixels.x.toFixed(
                                        1
                                      )}, y=${pixels.y.toFixed(
                                        1
                                      )}, w=${pixels.width.toFixed(
                                        1
                                      )}, h=${pixels.height.toFixed(1)}`
                                    );

                                    const isSelected =
                                      selectedField?.id === field.id;

                                    return (
                                      <React.Fragment
                                        key={
                                          field.id ||
                                          `field-${
                                            field.field_name || field.label
                                          }-${fieldIndex}`
                                        }
                                      >
                                        <Rect
                                          ref={(el) => {
                                            shapeRefs.current[field.id] = el;
                                            if (el) {
                                              console.log(
                                                `[AnnotationCanvas] Rect ref set for "${field.label}":`,
                                                {
                                                  x: el.x(),
                                                  y: el.y(),
                                                  width: el.width(),
                                                  height: el.height(),
                                                  visible: el.visible(),
                                                }
                                              );
                                            }
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
                                          onClick={() =>
                                            handleFieldClick(field)
                                          }
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
                                              ((newX + width) / pageWidth) *
                                                1000
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

                                {/* Render OCR-detected text bboxes (selectable, draggable, resizable) */}
                                {selectionMode &&
                                  ocrBboxes.map((ocrBbox) => {
                                    const pixels = normalizedToPixels(
                                      ocrBbox.bbox
                                    );
                                    if (!pixels) return null;

                                    const isMultiSelected =
                                      selectedOcrBboxes.includes(ocrBbox.id);
                                    const isTransformSelected =
                                      selectedOcrBbox?.id === ocrBbox.id;

                                    return (
                                      <Rect
                                        key={ocrBbox.id}
                                        ref={(el) => {
                                          ocrShapeRefs.current[ocrBbox.id] = el;
                                        }}
                                        x={pixels.x}
                                        y={pixels.y}
                                        width={pixels.width}
                                        height={pixels.height}
                                        stroke={
                                          isMultiSelected
                                            ? "#34c759"
                                            : "#ff9800"
                                        }
                                        strokeWidth={isMultiSelected ? 3 : 1.5}
                                        fill={
                                          isMultiSelected
                                            ? "rgba(52, 199, 89, 0.25)"
                                            : "rgba(255, 152, 0, 0.1)"
                                        }
                                        cornerRadius={2}
                                        draggable={true}
                                        name={`ocr-bbox-${ocrBbox.id}`}
                                        onClick={() =>
                                          handleOcrBboxClick(ocrBbox)
                                        }
                                        onTap={() =>
                                          handleOcrBboxClick(ocrBbox)
                                        }
                                        onDragStart={() => {
                                          // Set as selected for transformation
                                          setSelectedOcrBbox(ocrBbox);
                                        }}
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
                                        onDragEnd={(e) => {
                                          // Update bbox position
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

                                          // Update the OCR bbox in the list
                                          setOcrBboxes((prev) =>
                                            prev.map((b) =>
                                              b.id === ocrBbox.id
                                                ? { ...b, bbox: newBbox }
                                                : b
                                            )
                                          );

                                          console.log(
                                            `OCR bbox moved: ${ocrBbox.id}`,
                                            newBbox
                                          );
                                        }}
                                        onTransformEnd={(e) => {
                                          // Update bbox size after resize
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

                                          // Update the OCR bbox in the list
                                          setOcrBboxes((prev) =>
                                            prev.map((b) =>
                                              b.id === ocrBbox.id
                                                ? { ...b, bbox: newBbox }
                                                : b
                                            )
                                          );

                                          console.log(
                                            `OCR bbox resized: ${ocrBbox.id}`,
                                            newBbox
                                          );
                                        }}
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
                                            // Clear transform selection
                                            if (
                                              selectedOcrBbox?.id === ocrBbox.id
                                            ) {
                                              setSelectedOcrBbox(null);
                                            }
                                            console.log(
                                              `Removed bbox: ${ocrBbox.id}`
                                            );
                                          }
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
                                    if (
                                      newBox.width < 20 ||
                                      newBox.height < 10
                                    ) {
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
                    ))}
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
