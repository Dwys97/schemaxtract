#!/usr/bin/env python3
"""
LayoutLM Document Question-Answering Service
Standalone service for commercial invoice field extraction using Impira's pre-trained model
Runs on port 3002, called by Lambda backend
"""

import os
import sys
import logging
import tempfile
import base64
import json
from typing import Dict, Any, List
from pathlib import Path
from difflib import SequenceMatcher

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from pdf2image import convert_from_path
from transformers import pipeline
import torch
import pytesseract

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"],
            "supports_credentials": True,
        }
    },
)

# Global model variables (lazy loaded)
_doc_qa_pipeline = None


def load_layoutlm_model():
    """Load Impira LayoutLM model on first request (lazy loading)."""
    global _doc_qa_pipeline

    if _doc_qa_pipeline is None:
        logger.info(
            "Loading Impira LayoutLM invoice model (this may take 30-60 seconds)..."
        )
        try:
            # Use Impira's pre-trained LayoutLM model for invoice Q&A
            # This model is specifically fine-tuned on invoices
            _doc_qa_pipeline = pipeline(
                "document-question-answering", model="impira/layoutlm-invoices"
            )
            logger.info("✓ Impira LayoutLM invoice model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load LayoutLM model: {e}")
            raise

    return _doc_qa_pipeline


def perform_ocr_get_words(image_path: str) -> list:
    """
    Run Tesseract OCR to extract words with bounding boxes and confidences.

    Returns:
        List of dicts: [{'text': 'word', 'bbox': [x,y,w,h], 'confidence': 0-100}, ...]
    """
    try:
        image = Image.open(image_path).convert("RGB")

        # Run Tesseract with detailed data
        ocr_data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)

        words = []
        n_boxes = len(ocr_data["text"])
        for i in range(n_boxes):
            text = ocr_data["text"][i].strip()
            conf = int(ocr_data["conf"][i])

            # Skip empty or low confidence
            if not text or conf < 0:
                continue

            x = ocr_data["left"][i]
            y = ocr_data["top"][i]
            w = ocr_data["width"][i]
            h = ocr_data["height"][i]

            words.append(
                {
                    "text": text,
                    "bbox": [x, y, x + w, y + h],  # [x1, y1, x2, y2]
                    "confidence": conf / 100.0,  # normalize to 0-1
                }
            )

        logger.info(f"OCR extracted {len(words)} words")
        if words:
            logger.info(f"Sample OCR word (first): {words[0]}")
            logger.info(f"Sample OCR word type: {type(words[0])}")
            if isinstance(words[0], dict):
                logger.info(f"Keys in first word: {list(words[0].keys())}")
        else:
            logger.warning("OCR returned empty word list!")
        return words
    except Exception as e:
        logger.error(f"OCR failed: {e}", exc_info=True)
        return []


def extract_invoice_fields_ocr_only(ocr_words: list) -> list:
    """
    Extract invoice fields using OCR pattern matching (fallback when DocVQA fails).

    Patterns:
    - Invoice number: INV-*, Invoice #*, etc.
    - Date: DD/MM/YYYY, MM-DD-YYYY
    - Total: after "Total:", "Amount Due:", "$"
    - Vendor: top 20% of document
    - Customer: after "Bill To:", "Customer:"

    Args:
        ocr_words: List of OCR words with bboxes

    Returns:
        List of extracted fields
    """
    fields = []
    field_id = 1

    if not ocr_words:
        logger.warning("OCR returned no words")
        return fields

    # Validate OCR word structure
    for word in ocr_words:
        if not isinstance(word, dict) or "text" not in word or "bbox" not in word:
            logger.error(f"Invalid OCR word format: {word}")
            return fields

    # Combine OCR words into full text for pattern matching
    full_text = " ".join([w["text"] for w in ocr_words])
    logger.info(f"Full OCR text sample (first 200 chars): {full_text[:200]}")

    # Pattern 1: Invoice number (more flexible)
    import re

    inv_patterns = [
        r"(?:Invoice\s*(?:No\.?|Number|#)?[:\s]*)?([A-Z]{2,4}[-\s]?\d{4,})",  # TLS-2024-001
        r"(?:INV[-\s]?)(\d{4,})",  # INV-12345
        r"#\s*([A-Z0-9-]{5,})",  # #ABC-123
    ]

    for pattern in inv_patterns:
        inv_match = re.search(pattern, full_text, re.IGNORECASE)
        if inv_match:
            inv_num = inv_match.group(1).strip()
            logger.info(f"Found invoice number: {inv_num}")
            # Find matching OCR word
            for word in ocr_words:
                if (
                    inv_num.lower() in word["text"].lower()
                    or word["text"].lower() in inv_num.lower()
                ):
                    fields.append(
                        {
                            "id": field_id,
                            "label": "invoice_number",
                            "value": inv_num,
                            "bbox": word["bbox"],
                            "confidence": word["confidence"],
                            "source": "ocr_pattern",
                        }
                    )
                    field_id += 1
                    break
            break  # Stop after first match

    # Pattern 2: Date (various formats) - improved
    date_patterns = [
        r"\b(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})\b",  # 01/15/2024, 15-01-24
        r"\b(\d{4}[-/\.]\d{1,2}[-/\.]\d{1,2})\b",  # 2024-01-15
        r"\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b",  # 15 January 2024
    ]

    for pattern in date_patterns:
        for match in re.finditer(pattern, full_text, re.IGNORECASE):
            date_val = match.group(1)
            logger.info(f"Found date: {date_val}")
            for word in ocr_words:
                # Match any part of the date
                if any(
                    part in word["text"]
                    for part in date_val.replace("-", " ").replace("/", " ").split()
                ):
                    fields.append(
                        {
                            "id": field_id,
                            "label": "invoice_date",
                            "value": date_val,
                            "bbox": word["bbox"],
                            "confidence": word["confidence"],
                            "source": "ocr_pattern",
                        }
                    )
                    field_id += 1
                    break
            break  # Only first date
        if any(f["label"] == "invoice_date" for f in fields):
            break

    # Pattern 3: Total amount - improved for commercial invoices
    total_patterns = [
        r"(?:Total|Amount\s+Due|Grand\s+Total|Invoice\s+Total)[:\s]*\$?\s*([\d,]+\.?\d{0,2})",
        r"\$\s*([\d,]+\.\d{2})\s*(?:USD|EUR|GBP)?",  # $1,234.56 USD
        r"(?:^|\s)(\d{1,3}(?:,\d{3})*\.\d{2})\s*(?:USD|EUR|GBP)",  # 1,234.56 USD
    ]

    for pattern in total_patterns:
        total_match = re.search(pattern, full_text, re.IGNORECASE | re.MULTILINE)
        if total_match:
            amount = total_match.group(1).replace(",", "")
            logger.info(f"Found total amount: ${amount}")
            for word in ocr_words:
                if (
                    amount in word["text"].replace(",", "")
                    or word["text"].replace(",", "") in amount
                ):
                    fields.append(
                        {
                            "id": field_id,
                            "label": "total_amount",
                            "value": "$" + total_match.group(1),
                            "bbox": word["bbox"],
                            "confidence": word["confidence"],
                            "source": "ocr_pattern",
                        }
                    )
                    field_id += 1
                    break
            break

    logger.info(f"OCR pattern extraction found {len(fields)} fields")
    return fields


def match_value_to_ocr_bbox(
    value: str, ocr_words: list, img_width: int, img_height: int
) -> dict:
    """
    Match extracted value to OCR words and return bbox + confidence.

    Uses fuzzy matching to find value in OCR text and return merged bbox.

    Returns:
        {'bbox': [x1, y1, x2, y2], 'confidence': float}
    """
    if not value or not ocr_words:
        return {"bbox": [0, 0, 100, 100], "confidence": 0.5}

    value_lower = str(value).lower().strip()

    # Try exact match first
    for word in ocr_words:
        if word["text"].lower() == value_lower:
            return {"bbox": word["bbox"], "confidence": word["confidence"]}

    # Try partial/substring match
    matching_words = []
    for word in ocr_words:
        if value_lower in word["text"].lower() or word["text"].lower() in value_lower:
            matching_words.append(word)

    if matching_words:
        # Merge bboxes of matching words
        x1 = min(w["bbox"][0] for w in matching_words)
        y1 = min(w["bbox"][1] for w in matching_words)
        x2 = max(w["bbox"][2] for w in matching_words)
        y2 = max(w["bbox"][3] for w in matching_words)
        avg_conf = sum(w["confidence"] for w in matching_words) / len(matching_words)

        return {"bbox": [x1, y1, x2, y2], "confidence": avg_conf}

    # Try multi-word match (value contains multiple words)
    words_in_value = value_lower.split()
    if len(words_in_value) > 1:
        # Find sequence of OCR words that matches
        ocr_texts = [w["text"].lower() for w in ocr_words]
        ocr_combined = " ".join(ocr_texts)

        if value_lower in ocr_combined:
            # Find word indices
            start_idx = None
            for i in range(len(ocr_words)):
                candidate = " ".join(ocr_texts[i : i + len(words_in_value)])
                if value_lower in candidate or candidate in value_lower:
                    start_idx = i
                    break

            if start_idx is not None:
                end_idx = min(start_idx + len(words_in_value), len(ocr_words))
                matched = ocr_words[start_idx:end_idx]

                x1 = min(w["bbox"][0] for w in matched)
                y1 = min(w["bbox"][1] for w in matched)
                x2 = max(w["bbox"][2] for w in matched)
                y2 = max(w["bbox"][3] for w in matched)
                avg_conf = sum(w["confidence"] for w in matched) / len(matched)

                return {"bbox": [x1, y1, x2, y2], "confidence": avg_conf}

    # No match found - return default
    return {"bbox": [0, 0, 100, 100], "confidence": 0.3}


def extract_invoice_fields_layoutlm(image_path: str, custom_fields: list = None) -> List[dict]:
    """
    Extract invoice fields using Impira's LayoutLM document Q&A model.

    This model is specifically fine-tuned on invoices and uses a question-answering
    approach to extract fields. Much better than generic LayoutLMv3!

    Args:
        image_path: Path to the invoice image
        custom_fields: Optional list of custom field definitions from user
                      Each field should have: key, question, type, required

    Returns:
        List of extracted fields with bboxes and confidence scores
    """
    try:
        # Load model (lazy loading)
        doc_qa = load_layoutlm_model()

        # Open image
        image = Image.open(image_path).convert("RGB")
        img_width, img_height = image.size

        # Get OCR words with bboxes for matching
        logger.info("Running OCR to get word bboxes...")
        ocr_words = perform_ocr_get_words(image_path)
        logger.info(f"OCR found {len(ocr_words)} words")

        # Define questions for invoice fields
        # Use custom fields if provided, otherwise use default questions
        if custom_fields:
            logger.info(f"Using {len(custom_fields)} custom field definitions")
            questions = {}
            for field in custom_fields:
                field_key = field.get('key') or field.get('field_key')
                question = field.get('question')
                if field_key and question:
                    questions[field_key] = question
        else:
            # Default questions (reduced set for performance)
            questions = {
                "invoice_number": "What is the invoice number?",
                "invoice_date": "What is the invoice date?",
                "total_amount": "What is the total amount?",
                "vendor_name": "What is the vendor name?",
                "po_number": "What is the PO number?",
            }

        fields = []
        field_id = 1

        logger.info(
            f"Extracting fields using LayoutLM Q&A for {len(questions)} questions..."
        )

        for field_label, question in questions.items():
            try:
                # Ask the question to the document
                result = doc_qa(image=image, question=question)

                # Result format: [{'score': 0.95, 'answer': 'INV-12345', 'start': 10, 'end': 10}]
                if result:
                    answer_data = result[0] if isinstance(result, list) else result

                    answer = answer_data.get("answer", "").strip()
                    confidence = answer_data.get("score", 0.0)

                    # Only include if confidence is reasonable and answer is not empty
                    if answer and confidence > 0.1:
                        # Match the answer text to OCR words to get bbox
                        bbox_match = match_value_to_ocr_bbox(
                            answer, ocr_words, img_width, img_height
                        )
                        bbox = bbox_match.get("bbox", [0, 0, img_width // 4, 30])

                        # Use OCR confidence if available, otherwise use model confidence
                        final_confidence = max(
                            confidence, bbox_match.get("confidence", 0.0)
                        )

                        fields.append(
                            {
                                "id": field_id,
                                "label": field_label,
                                "value": answer,
                                "bbox": bbox,
                                "confidence": float(final_confidence),
                                "source": "layoutlm_qa",
                            }
                        )
                        field_id += 1
                        logger.info(
                            f"✓ {field_label}: {answer} (confidence: {confidence:.2f}, bbox: {bbox})"
                        )
                    else:
                        logger.debug(f"✗ {field_label}: Low confidence or empty answer")

            except Exception as e:
                logger.warning(f"Failed to extract {field_label}: {e}")
                continue

        logger.info(f"LayoutLM Q&A extracted {len(fields)} fields")
        return fields

    except Exception as e:
        logger.error(f"LayoutLM extraction failed: {e}", exc_info=True)
        return []


def group_words_into_lines(ocr_words: list, image_height: int) -> list:
    """
    Group OCR words into lines based on vertical proximity.

    Words on the same line typically have similar Y coordinates.
    This groups words like addresses into single fields.

    Args:
        ocr_words: List of OCR words with bbox
        image_height: Image height for threshold calculation

    Returns:
        List of grouped lines with merged text and bbox
    """
    if not ocr_words:
        return []

    # Sort words by Y position (top to bottom), then X (left to right)
    sorted_words = sorted(ocr_words, key=lambda w: (w["bbox"][1], w["bbox"][0]))

    lines = []
    current_line = []
    line_threshold = max(10, image_height * 0.01)  # 1% of image height or 10px

    for word in sorted_words:
        if not current_line:
            current_line.append(word)
        else:
            # Check if word is on same line (similar Y coordinate)
            prev_y = current_line[-1]["bbox"][1]  # Y1 of previous word
            curr_y = word["bbox"][1]

            if abs(curr_y - prev_y) < line_threshold:
                # Same line
                current_line.append(word)
            else:
                # New line - save current and start new
                if current_line:
                    lines.append(merge_line_words(current_line))
                current_line = [word]

    # Add last line
    if current_line:
        lines.append(merge_line_words(current_line))

    return lines


def merge_line_words(words: list) -> dict:
    """Merge words in a line into single field with combined bbox."""
    if not words:
        return None

    # Combine text
    text = " ".join([w["text"] for w in words])

    # Merge bboxes
    x1 = min(w["bbox"][0] for w in words)
    y1 = min(w["bbox"][1] for w in words)
    x2 = max(w["bbox"][2] for w in words)
    y2 = max(w["bbox"][3] for w in words)

    # Average confidence
    avg_conf = sum(w["confidence"] for w in words) / len(words)

    return {
        "text": text,
        "bbox": [x1, y1, x2, y2],
        "confidence": avg_conf,
        "word_count": len(words),
    }


def extract_fields_with_donut(image_path: str, custom_fields: list = None) -> Dict[str, Any]:
    """
    Extract invoice fields using Impira LayoutLM Document Q&A model.

    New Strategy (LayoutLM Q&A):
    - Use pre-trained invoice model that handles OCR internally
    - Ask specific questions about invoice fields (from custom fields or defaults)
    - Get answers with bounding boxes automatically
    - Much simpler and more accurate than previous OCR+token-classification approach

    Args:
        image_path: Path to image file
        custom_fields: Optional list of custom field definitions from user

    Returns:
        Dictionary with extracted fields and bounding boxes
    """
    try:
        # Load image
        image = Image.open(image_path).convert("RGB")
        image_width, image_height = image.size

        logger.info(f"Image loaded: {image_width}x{image_height}")

        # Extract invoice fields using LayoutLM Q&A
        # Pass custom fields if provided
        layoutlm_fields = extract_invoice_fields_layoutlm(image_path, custom_fields)
        logger.info(f"LayoutLM Q&A extracted {len(layoutlm_fields)} invoice fields")

        # Normalize bboxes to 0-1000 scale (frontend expects this)
        for field in layoutlm_fields:
            if "bbox" in field and field["bbox"]:
                x1, y1, x2, y2 = field["bbox"]
                field["bbox"] = [
                    int(1000 * x1 / image_width),
                    int(1000 * y1 / image_height),
                    int(1000 * x2 / image_width),
                    int(1000 * y2 / image_height),
                ]

        return {
            "raw_output": {
                "mode": "layoutlm_qa",
                "model": "impira/layoutlm-invoices",
                "ai_fields": len(layoutlm_fields),
                "custom_fields_used": custom_fields is not None,
            },
            "fields": layoutlm_fields,
            "image_size": {"width": image_width, "height": image_height},
        }

    except Exception as e:
        logger.error(f"Field extraction failed: {e}")
        raise


def convert_donut_to_standard_format(
    donut_result: Dict, img_width: int, img_height: int
) -> list:
    """
    Convert Donut output to standardized field format.

    Since CORD model is trained on receipts, not invoices, we extract what we can
    and rely on OCR matching to provide accurate bboxes.

    Args:
        donut_result: Raw Donut output (may be receipt-like fields)
        img_width: Image width for bbox normalization
        img_height: Image height for bbox normalization

    Returns:
        List of field dictionaries with default bboxes (OCR will fix them)
    """
    fields = []
    field_id = 1

    # Improved mapping: CORD receipt fields → Invoice concepts
    field_mapping = {
        "nm": "description",  # "name" → description
        "price": "amount",  # price
        "discountprice": "unit_price",  # discount price
        "cnt": "quantity",  # count
        "menu": "line_items",  # menu items → line items
        "total": "total_amount",
        "subtotal": "subtotal",
        "tax": "tax_amount",
        "store_name": "vendor",
        "store_addr": "address",
        "date": "invoice_date",
    }

    def normalize_bbox(bbox, img_w, img_h):
        """Normalize bbox to [0-1000] scale."""
        if not bbox or len(bbox) != 4:
            return [0, 0, 100, 100]  # Default small box
        x1, y1, x2, y2 = bbox
        return [
            int((x1 / img_w) * 1000),
            int((y1 / img_h) * 1000),
            int((x2 / img_w) * 1000),
            int((y2 / img_h) * 1000),
        ]

    def extract_field(key, value, parent_key=""):
        """Recursively extract fields from nested structure."""
        nonlocal field_id

        full_key = f"{parent_key}.{key}" if parent_key else key
        mapped_name = field_mapping.get(full_key, full_key)

        if isinstance(value, dict):
            # Handle nested objects
            if "text" in value or "value" in value:
                # Leaf node with text
                text = value.get("text") or value.get("value", "")
                bbox = value.get("bounding_box", value.get("bbox", []))

                fields.append(
                    {
                        "id": field_id,
                        "label": mapped_name,
                        "value": str(text),
                        "bbox": normalize_bbox(bbox, img_width, img_height),
                        "confidence": value.get("confidence", 0.9),
                    }
                )
                field_id += 1
            else:
                # Recurse into nested dict
                for k, v in value.items():
                    extract_field(k, v, full_key)
        elif isinstance(value, list):
            # Handle arrays (like menu items)
            for idx, item in enumerate(value):
                if isinstance(item, dict):
                    item_key = f"{mapped_name}_item_{idx+1}"
                    for k, v in item.items():
                        extract_field(k, v, item_key)
                else:
                    fields.append(
                        {
                            "id": field_id,
                            "label": f"{mapped_name}_{idx+1}",
                            "value": str(item),
                            "bbox": [0, 0, 100, 100],
                            "confidence": 0.8,
                        }
                    )
                    field_id += 1
        else:
            # Simple value
            fields.append(
                {
                    "id": field_id,
                    "label": mapped_name,
                    "value": str(value),
                    "bbox": [0, 0, 100, 100],
                    "confidence": 0.85,
                }
            )
            field_id += 1

    # Process all top-level fields
    for key, value in donut_result.items():
        extract_field(key, value)

    return fields


def match_field_to_ocr(
    field: Dict[str, Any], ocr_entries: list, img_w: int, img_h: int
) -> Dict[str, Any]:
    """Match a Donut field value to the best OCR entry and return field enriched with bbox and confidence.

    If no good match is found, preserve existing bbox.
    """
    value = (field.get("value") or "").strip()
    if not value or not ocr_entries:
        return field

    # Lowercase for matching
    target = value.lower()

    best = None
    best_score = 0.0
    for e in ocr_entries:
        score = SequenceMatcher(None, target, e["text"].lower()).ratio()
        if score > best_score:
            best_score = score
            best = e

    # If best score is reasonable, use its bbox; otherwise keep existing
    if best and best_score > 0.45:
        x1 = best["left"]
        y1 = best["top"]
        x2 = x1 + best["width"]
        y2 = y1 + best["height"]

        # Normalize to [0,1000]
        nx1 = int((x1 / img_w) * 1000)
        ny1 = int((y1 / img_h) * 1000)
        nx2 = int((x2 / img_w) * 1000)
        ny2 = int((y2 / img_h) * 1000)

        # Confidence: combine Donut confidence (if present) and OCR conf
        donut_conf = field.get("confidence", 0.5)
        ocr_conf = (
            (best.get("conf", 0.0) / 100.0) if best.get("conf") is not None else 0.0
        )
        combined_conf = round(min(1.0, max(0.0, (donut_conf + ocr_conf) / 2.0)), 3)

        new_field = dict(field)
        new_field["bbox"] = [nx1, ny1, nx2, ny2]
        new_field["confidence"] = combined_conf
        new_field["matched_ocr"] = best["text"]
        new_field["match_score"] = round(best_score, 3)
        return new_field

    # No good match
    return field


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify(
        {
            "status": "healthy",
            "service": "layoutlm-invoice-qa",
            "model_loaded": _doc_qa_pipeline is not None,
        }
    )


@app.route("/extract", methods=["POST"])
def extract_document():
    """
    Extract fields from document (image or PDF).

    Request body:
        {
            "image": "base64-encoded-document-data",
            "format": "png|jpg|jpeg|pdf",
            "custom_fields": [  // Optional
                {
                    "key": "invoice_number",
                    "question": "What is the invoice number?",
                    "type": "text",
                    "required": true
                },
                ...
            ]
        }

    Returns:
        {
            "status": "success",
            "fields": [...],
            "raw_output": {...},
            "image_size": {...}
        }
    """
    try:
        data = request.get_json()

        if not data or "image" not in data:
            return jsonify({"error": "Missing image data"}), 400

        # Decode base64 document
        doc_data = base64.b64decode(data["image"])
        doc_format = data.get("format", "png").lower()
        custom_fields = data.get("custom_fields")  # Optional custom field definitions

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=f".{doc_format}", delete=False) as tmp:
            tmp.write(doc_data)
            tmp_path = tmp.name

        try:
            # Convert PDF to image if needed
            if doc_format == "pdf":
                logger.info(f"Converting PDF to image ({len(doc_data)} bytes)")
                images = convert_from_path(tmp_path, first_page=1, last_page=1, dpi=200)

                if not images:
                    return jsonify({"error": "PDF has no pages"}), 400

                # Save first page as PNG
                img_path = tmp_path.replace(".pdf", ".png")
                images[0].save(img_path, "PNG")

                # Delete PDF, use image
                os.unlink(tmp_path)
                tmp_path = img_path
                logger.info(
                    f"PDF converted to {images[0].width}x{images[0].height} PNG"
                )

            # Extract fields (with optional custom field definitions)
            result = extract_fields_with_donut(tmp_path, custom_fields)

            logger.info(f"Returning {len(result.get('fields', []))} fields to client")
            if result.get("fields"):
                logger.info(f"Sample field: {result['fields'][0]}")

            return jsonify({"status": "success", **result})
        finally:
            # Cleanup
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"Extraction error: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/reextract-bbox", methods=["POST"])
def reextract_bbox():
    """
    Re-extract text from a specific bbox region using OCR.

    Request:
        {
            "image": "base64_encoded_image",
            "format": "png|jpg|pdf",
            "bbox": [x1, y1, x2, y2],  # normalized coordinates [0-1000]
            "page": 1  # optional, for PDFs
        }

    Response:
        {
            "status": "success",
            "text": "extracted text from bbox",
            "confidence": 0.95
        }
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({"status": "error", "error": "No JSON data provided"}), 400

        image_b64 = data.get("image")
        file_format = data.get("format", "png")
        bbox = data.get("bbox")  # [x1, y1, x2, y2] normalized to 1000
        page_num = data.get("page", 1)

        if not image_b64:
            return jsonify({"status": "error", "error": "No image provided"}), 400

        if not bbox or len(bbox) != 4:
            return (
                jsonify(
                    {
                        "status": "error",
                        "error": "Invalid bbox format. Expected [x1, y1, x2, y2]",
                    }
                ),
                400,
            )

        logger.info(f"Re-extracting text from bbox: {bbox} on page {page_num}")

        # Decode base64 image
        image_data = base64.b64decode(image_b64)

        # Save to temp file
        with tempfile.NamedTemporaryFile(
            suffix=f".{file_format}", delete=False
        ) as tmp_file:
            tmp_file.write(image_data)
            tmp_path = tmp_file.name

        try:
            # Convert PDF to image if needed
            if file_format == "pdf":
                logger.info(f"Converting PDF page {page_num} to image...")
                images = convert_from_path(
                    tmp_path, first_page=page_num, last_page=page_num
                )
                if not images:
                    return (
                        jsonify({"status": "error", "error": "Failed to convert PDF"}),
                        500,
                    )

                # Save the page as image
                page_image_path = tmp_path.replace(".pdf", ".png")
                images[0].save(page_image_path, "PNG")
                image_path = page_image_path
            else:
                image_path = tmp_path

            # Open image to get dimensions
            image = Image.open(image_path).convert("RGB")
            img_width, img_height = image.size

            # Convert normalized bbox [0-1000] to pixel coordinates
            x1 = int((bbox[0] / 1000.0) * img_width)
            y1 = int((bbox[1] / 1000.0) * img_height)
            x2 = int((bbox[2] / 1000.0) * img_width)
            y2 = int((bbox[3] / 1000.0) * img_height)

            # Ensure coordinates are valid
            x1, x2 = max(0, min(x1, img_width)), max(0, min(x2, img_width))
            y1, y2 = max(0, min(y1, img_height)), max(0, min(y2, img_height))

            # Crop image to bbox
            cropped_image = image.crop((x1, y1, x2, y2))

            logger.info(
                f"Cropped region: ({x1}, {y1}) to ({x2}, {y2}), size: {cropped_image.size}"
            )

            # Preprocess image for better OCR accuracy
            # 1. Convert to grayscale
            cropped_gray = cropped_image.convert("L")

            # 2. Increase contrast and brightness
            from PIL import ImageEnhance

            enhancer = ImageEnhance.Contrast(cropped_gray)
            cropped_enhanced = enhancer.enhance(2.0)  # Increase contrast

            # 3. Upscale small images (Tesseract works better on larger images)
            min_height = 50
            if cropped_enhanced.size[1] < min_height:
                scale_factor = min_height / cropped_enhanced.size[1]
                new_size = (
                    int(cropped_enhanced.size[0] * scale_factor),
                    int(cropped_enhanced.size[1] * scale_factor),
                )
                cropped_enhanced = cropped_enhanced.resize(
                    new_size, Image.Resampling.LANCZOS
                )
                logger.info(f"Upscaled image to: {new_size}")

            # Run OCR on preprocessed image with optimized config
            # --psm 7: Treat image as a single text line
            # --oem 3: Use LSTM OCR Engine
            ocr_config = "--psm 7 --oem 3"
            ocr_result = pytesseract.image_to_string(
                cropped_enhanced, config=ocr_config
            )
            extracted_text = ocr_result.strip()

            # Get confidence from enhanced image
            ocr_data = pytesseract.image_to_data(
                cropped_enhanced, output_type=pytesseract.Output.DICT, config=ocr_config
            )
            confidences = [int(c) for c in ocr_data["conf"] if int(c) > 0]
            avg_confidence = (
                sum(confidences) / len(confidences) / 100.0 if confidences else 0.0
            )

            logger.info(
                f"Extracted text: '{extracted_text}' (confidence: {avg_confidence:.2f})"
            )

            return jsonify(
                {
                    "status": "success",
                    "text": extracted_text,
                    "confidence": round(avg_confidence, 3),
                    "bbox_pixels": [x1, y1, x2, y2],
                    "image_size": {"width": img_width, "height": img_height},
                }
            )

        finally:
            # Cleanup temp files
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            if file_format == "pdf" and os.path.exists(image_path):
                os.unlink(image_path)

    except Exception as e:
        logger.error(f"Error in reextract_bbox: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/", methods=["GET"])
def index():
    """Root endpoint."""
    return jsonify(
        {
            "service": "Donut Document Understanding Service",
            "version": "1.0.0",
            "endpoints": {
                "/health": "Health check",
                "/extract": "Extract fields from document (POST with base64 image)",
                "/reextract-bbox": "Re-extract text from specific bbox (POST with image + bbox)",
            },
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3002))
    logger.info(f"Starting Donut service on port {port}")
    logger.info("Note: Model will be loaded on first request (may take 30-60s)")

    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
