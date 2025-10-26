from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR
import tempfile
import os
import re
import logging
from typing import List, Dict, Any
import base64
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="PaddleOCR Service")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy initialization of PaddleOCR to reduce memory footprint
_ocr_instance = None

def get_ocr():
    """Get or initialize PaddleOCR instance with lazy loading."""
    global _ocr_instance
    if _ocr_instance is None:
        logger.info("Initializing PaddleOCR with memory-optimized settings...")
        _ocr_instance = PaddleOCR(
            use_angle_cls=False,  # Disable angle classification to save memory
            lang='en', 
            show_log=False,
            use_gpu=False,
            enable_mkldnn=False,
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            rec_batch_num=1,  # Process one text region at a time
            use_space_char=True
        )
        logger.info("PaddleOCR initialized")
    return _ocr_instance


def extract_invoice_fields(text: str, ocr_data: List[Dict]) -> List[Dict[str, Any]]:
    """Extract invoice fields from OCR text using regex patterns."""
    logger.info("Extracting invoice fields from OCR text")
    
    fields = []
    
    # Regex patterns for common invoice fields
    patterns = {
        'invoice_number': r'(?:invoice\s*(?:number|#|no\.?)\s*[:#]?\s*)([A-Z0-9-]+)',
        'invoice_date': r'(?:date|invoice\s*date)\s*[:.]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        'due_date': r'(?:due\s*date|payment\s*due)\s*[:.]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        'total': r'(?:total|amount\s*due)\s*[:.]?\s*\$?\s*([\d,]+\.?\d{0,2})',
        'subtotal': r'(?:subtotal|sub\s*total)\s*[:.]?\s*\$?\s*([\d,]+\.?\d{0,2})',
        'tax': r'(?:tax|vat)\s*(?:\([\d.]+%\))?\s*[:.]?\s*\$?\s*([\d,]+\.?\d{0,2})',
        'bill_to_name': r'(?:bill\s*to|customer)[:\s]*([A-Za-z\s]+?)(?:\n|\r|$)',
        'bill_to_address': r'(?:bill\s*to.*?\n)([A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd)[^\n]+)',
    }
    
    # Get image dimensions from OCR data (assume first bbox defines scale)
    img_width = 595  # Default A4 width in points
    img_height = 842  # Default A4 height in points
    
    if ocr_data and len(ocr_data) > 0:
        # Try to estimate image dimensions from bboxes
        all_x = []
        all_y = []
        for item in ocr_data:
            bbox = item.get('bbox', [])
            if len(bbox) == 4:
                for pt in bbox:
                    all_x.append(pt[0])
                    all_y.append(pt[1])
        
        if all_x and all_y:
            img_width = max(all_x)
            img_height = max(all_y)
    
    logger.info(f"Estimated image dimensions: {img_width}x{img_height}")
    
    # Extract using regex
    for field_name, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            value = match.group(1).strip()
            
            # Find corresponding bbox from OCR data
            bbox = [100, 100, 300, 140]  # Default bbox (normalized)
            confidence = 0.85
            
            # Try to find matching text in OCR data
            for ocr_item in ocr_data:
                ocr_text = ocr_item.get('text', '').lower()
                if value.lower() in ocr_text or ocr_text in value.lower():
                    # Convert PaddleOCR bbox to normalized coordinates [0-1000]
                    paddle_bbox = ocr_item['bbox']
                    if len(paddle_bbox) == 4:
                        x_coords = [pt[0] for pt in paddle_bbox]
                        y_coords = [pt[1] for pt in paddle_bbox]
                        x1, y1 = min(x_coords), min(y_coords)
                        x2, y2 = max(x_coords), max(y_coords)
                        
                        # Normalize to [0-1000] range
                        bbox = [
                            int(x1 * 1000 / img_width),
                            int(y1 * 1000 / img_height),
                            int(x2 * 1000 / img_width),
                            int(y2 * 1000 / img_height)
                        ]
                    confidence = ocr_item.get('confidence', 0.85)
                    break
            
            fields.append({
                'field_name': field_name,
                'value': value,
                'confidence': confidence,
                'bbox': bbox,
                'page': 1
            })
    
    logger.info(f"Extracted {len(fields)} fields")
    return fields


class ProcessDocumentRequest(BaseModel):
    document: str
    filename: str = "document.pdf"


@app.post("/process-document")
async def process_document(request: ProcessDocumentRequest):
    """
    Process document with PaddleOCR.
    Expects JSON: {"document": "base64_string", "filename": "invoice.pdf"}
    """
    temp_file_path = None
    
    try:
        if not request.document:
            raise HTTPException(status_code=400, detail="No document provided")
        
        logger.info(f"Received document for processing: {request.filename}")
        
        # Decode Base64 document
        document_binary = base64.b64decode(request.document)
        
        # Determine file extension
        extension = '.png'
        if request.filename.lower().endswith('.pdf'):
            extension = '.pdf'
        elif request.filename.lower().endswith(('.jpg', '.jpeg')):
            extension = '.jpg'
        
        # Write to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temp_file:
            temp_file.write(document_binary)
            temp_file_path = temp_file.name
        
        logger.info(f"Document written to {temp_file_path} ({len(document_binary)} bytes)")
        
        # For PDF files, convert first page to image to reduce memory usage
        if extension == '.pdf':
            try:
                import fitz  # PyMuPDF
                logger.info("Converting PDF first page to image...")
                pdf_doc = fitz.open(temp_file_path)
                if len(pdf_doc) > 0:
                    page = pdf_doc[0]
                    # Use lower zoom to reduce memory usage (1.5x instead of 2x)
                    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
                    
                    # Check image size and reduce if too large
                    max_dimension = 2000  # Max width or height
                    if pix.width > max_dimension or pix.height > max_dimension:
                        scale = max_dimension / max(pix.width, pix.height)
                        pix = page.get_pixmap(matrix=fitz.Matrix(1.5 * scale, 1.5 * scale))
                        logger.info(f"Reduced image size: {pix.width}x{pix.height}")
                    
                    img_path = temp_file_path.replace('.pdf', '.png')
                    pix.save(img_path)
                    pdf_doc.close()
                    
                    # Delete PDF, use image instead
                    os.unlink(temp_file_path)
                    temp_file_path = img_path
                    logger.info(f"PDF converted to image: {img_path} ({pix.width}x{pix.height})")
                else:
                    raise ValueError("PDF has no pages")
            except Exception as pdf_error:
                logger.error(f"PDF conversion error: {pdf_error}")
                raise HTTPException(status_code=400, detail=f"Failed to process PDF: {str(pdf_error)}")
        
        # Get OCR instance (lazy initialization)
        ocr = get_ocr()
        
        # Run PaddleOCR
        logger.info("Running PaddleOCR...")
        result = ocr.ocr(temp_file_path, cls=False)  # cls=False to save memory
        
        # Extract text and bounding boxes
        extracted_lines = []
        ocr_data = []
        
        if result and result[0]:
            for line in result[0]:
                if len(line) >= 2:
                    bbox = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                    text_info = line[1]  # (text, confidence)
                    
                    text = text_info[0] if isinstance(text_info, tuple) else text_info
                    confidence = text_info[1] if isinstance(text_info, tuple) and len(text_info) > 1 else 0.0
                    
                    extracted_lines.append(text)
                    
                    ocr_data.append({
                        'text': text,
                        'bbox': bbox,
                        'confidence': confidence
                    })
        
        full_text = '\n'.join(extracted_lines)
        logger.info(f"PaddleOCR extracted {len(extracted_lines)} lines, {len(full_text)} characters")
        
        # Extract invoice fields
        fields = extract_invoice_fields(full_text, ocr_data)
        
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
            logger.info(f"Cleaned up temporary file: {temp_file_path}")
        
        return {
            'status': 'success',
            'message': 'Document processed successfully',
            'extracted_text': full_text,
            'fields': fields,
            'metadata': {
                'filename': request.filename,
                'file_size': len(document_binary),
                'num_fields': len(fields),
                'num_lines': len(extracted_lines)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing document: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")
    finally:
        # Ensure cleanup
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup temp file: {cleanup_error}")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "PaddleOCR"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3002)
