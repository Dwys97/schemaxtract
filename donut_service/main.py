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
from datetime import datetime

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

# Template storage directory
TEMPLATE_DIR = Path("/tmp/invoice_templates")
TEMPLATE_DIR.mkdir(exist_ok=True)


def save_template(vendor_name: str, template_data: Dict[str, Any]) -> bool:
    """Save a learned template for reuse."""
    try:
        template_file = TEMPLATE_DIR / f"{vendor_name}.json"
        template_data["last_updated"] = datetime.now().isoformat()
        template_data["version"] = template_data.get("version", 1) + 1

        with open(template_file, "w") as f:
            json.dump(template_data, f, indent=2)

        logger.info(f"[Template] Saved template for vendor: {vendor_name}")
        return True
    except Exception as e:
        logger.error(f"[Template] Failed to save template: {e}")
        return False


def load_template(vendor_name: str) -> Dict[str, Any]:
    """Load a saved template."""
    try:
        template_file = TEMPLATE_DIR / f"{vendor_name}.json"
        if template_file.exists():
            with open(template_file, "r") as f:
                template = json.load(f)
            logger.info(
                f"[Template] Loaded template for vendor: {vendor_name} (v{template.get('version', 1)})"
            )
            return template
        return None
    except Exception as e:
        logger.error(f"[Template] Failed to load template: {e}")
        return None


def list_templates() -> List[str]:
    """List all saved vendor templates."""
    try:
        return [f.stem for f in TEMPLATE_DIR.glob("*.json")]
    except Exception as e:
        logger.error(f"[Template] Failed to list templates: {e}")
        return []


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


def extract_invoice_fields_layoutlm(
    image_path: str, custom_fields: list = None, start_field_id: int = 1
) -> List[dict]:
    """
    Extract invoice fields using Impira's LayoutLM document Q&A model.

    This model is specifically fine-tuned on invoices and uses a question-answering
    approach to extract fields. Much better than generic LayoutLMv3!

    Args:
        image_path: Path to the invoice image
        custom_fields: Optional list of custom field definitions from user
                      Each field should have: key, question, type, required
        start_field_id: Starting ID for field numbering (for batch processing)

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
        # Start with default fields, then add/override with custom fields
        logger.info("Initializing with default invoice fields")
        questions = {
            "invoice_number": {
                "question": "What is the invoice number?",
                "category": "invoice",
                "type": "text",
            },
            "invoice_date": {
                "question": "What is the invoice date?",
                "category": "invoice",
                "type": "date",
            },
            "total_amount": {
                "question": "What is the total amount?",
                "category": "amounts",
                "type": "currency",
            },
            "vendor_name": {
                "question": "What is the vendor name?",
                "category": "vendor",
                "type": "text",
            },
            "po_number": {
                "question": "What is the PO number?",
                "category": "invoice",
                "type": "text",
            },
        }
        line_item_fields = []

        # Add or override with custom fields if provided
        if custom_fields:
            logger.info(
                f"Adding {len(custom_fields)} custom field definitions to defaults"
            )
            logger.info(f"Custom fields received: {custom_fields}")

            for field in custom_fields:
                field_key = field.get("key") or field.get("field_key")
                question = field.get("question")
                category = field.get("category", "")

                if field_key and question:
                    questions[field_key] = {
                        "question": question,
                        "category": category,
                        "type": field.get("type", "text"),
                    }

                    # Track if this is a line item field
                    if category == "line_items":
                        line_item_fields.append(field_key)

                    logger.info(f"Added/updated question for {field_key}: {question}")
                else:
                    logger.warning(f"Skipping invalid field: {field}")
        else:
            logger.info("No custom fields provided - using only default questions")

        fields = []
        field_id = start_field_id

        logger.info(
            f"Extracting fields using LayoutLM Q&A for {len(questions)} questions..."
        )
        logger.info(f"Line item fields detected: {line_item_fields}")

        for field_label, field_config in questions.items():
            try:
                question = (
                    field_config["question"]
                    if isinstance(field_config, dict)
                    else field_config
                )
                category = (
                    field_config.get("category", "")
                    if isinstance(field_config, dict)
                    else ""
                )
                is_line_item = category == "line_items"

                # For line items, modify question to get multiple instances
                if is_line_item:
                    # Try to extract from table rows - ask LayoutLM for top 5 matches
                    logger.info(
                        f"[LINE ITEM] Extracting {field_label} from table rows..."
                    )
                    result = doc_qa(image=image, question=question, top_k=5)
                else:
                    # Regular field - single answer
                    result = doc_qa(image=image, question=question)

                # Result format: [{'score': 0.95, 'answer': 'INV-12345', 'start': 10, 'end': 10}]
                if result:
                    # Handle multiple results for line items
                    results_to_process = (
                        result if isinstance(result, list) else [result]
                    )

                    # For line items, process up to 5 results; for others, just the first
                    max_results = 5 if is_line_item else 1

                    for idx, answer_data in enumerate(results_to_process[:max_results]):
                        answer = answer_data.get("answer", "").strip()
                        confidence = answer_data.get("score", 0.0)

                        # Only include if confidence is reasonable and answer is not empty
                        if answer and confidence > 0.1:
                            # Skip if this is a duplicate answer (common in line items)
                            if is_line_item and idx > 0:
                                # Check if this answer is similar to previous ones
                                existing_values = [
                                    f["value"]
                                    for f in fields
                                    if f["label"] == field_label
                                ]
                                if answer in existing_values:
                                    logger.debug(f"Skipping duplicate answer: {answer}")
                                    continue

                            # Match the answer text to OCR words to get bbox
                            bbox_match = match_value_to_ocr_bbox(
                                answer, ocr_words, img_width, img_height
                            )
                            bbox = bbox_match.get("bbox", [0, 0, img_width // 4, 30])

                            # Use OCR confidence if available, otherwise use model confidence
                            final_confidence = max(
                                confidence, bbox_match.get("confidence", 0.0)
                            )

                            # For line items, add row index to label
                            label = (
                                f"{field_label}_row_{idx + 1}"
                                if is_line_item and max_results > 1
                                else field_label
                            )

                            fields.append(
                                {
                                    "id": field_id,
                                    "label": label,
                                    "value": answer,
                                    "bbox": bbox,
                                    "confidence": float(final_confidence),
                                    "source": "layoutlm_qa",
                                    "is_line_item": is_line_item,
                                    "row_index": idx + 1 if is_line_item else None,
                                }
                            )
                            field_id += 1

                            if is_line_item:
                                logger.info(
                                    f"✓ {field_label} [row {idx + 1}]: {answer} (confidence: {confidence:.2f})"
                                )
                            else:
                                logger.info(
                                    f"✓ {field_label}: {answer} (confidence: {confidence:.2f}, bbox: {bbox})"
                                )
                        else:
                            logger.debug(
                                f"✗ {field_label}: Low confidence or empty answer"
                            )

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


def extract_fields_with_donut(
    image_path: str, custom_fields: list = None, start_field_id: int = 1
) -> Dict[str, Any]:
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
        start_field_id: Starting ID for field numbering (for batch processing)

    Returns:
        Dictionary with extracted fields and bounding boxes
    """
    try:
        # Load image
        image = Image.open(image_path).convert("RGB")
        image_width, image_height = image.size

        logger.info(f"Image loaded: {image_width}x{image_height}")

        # Extract invoice fields using LayoutLM Q&A
        # Pass custom fields if provided and starting field ID
        layoutlm_fields = extract_invoice_fields_layoutlm(
            image_path, custom_fields, start_field_id
        )
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

        logger.info(
            f"[/extract] Received request with keys: {list(data.keys()) if data else 'None'}"
        )

        if not data or "image" not in data:
            return jsonify({"error": "Missing image data"}), 400

        # Decode base64 document
        doc_data = base64.b64decode(data["image"])
        doc_format = data.get("format", "png").lower()
        custom_fields = data.get("custom_fields")  # Optional custom field definitions

        logger.info(f"[/extract] custom_fields parameter: {custom_fields}")
        if custom_fields:
            logger.info(f"[/extract] Number of custom fields: {len(custom_fields)}")
            logger.info(
                f"[/extract] Custom fields detail: {json.dumps(custom_fields, indent=2)}"
            )
        else:
            logger.info("[/extract] No custom_fields in request")

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


@app.route("/extract-batch", methods=["POST"])
def extract_document_batch():
    """
    Extract fields from document in batches to avoid CPU overload.
    Processes questions in groups of 5 (configurable), with priority given to required fields.

    Request body:
        {
            "image": "base64-encoded-document-data",
            "format": "png|jpg|jpeg|pdf",
            "custom_fields": [
                {
                    "key": "invoice_number",
                    "question": "What is the invoice number?",
                    "type": "text",
                    "required": true  // Priority fields
                },
                ...
            ],
            "batch_size": 5,  // Optional, default 5
            "batch_index": 0,  // Which batch to process (0 = first 5, 1 = next 5, etc.)
        }

    Returns:
        {
            "status": "success",
            "fields": [...],  // Fields from this batch
            "batch_info": {
                "batch_index": 0,
                "batch_size": 5,
                "total_fields": 20,
                "total_batches": 4,
                "has_more": true,
                "processed_count": 5
            }
        }
    """
    try:
        data = request.get_json()

        if not data or "image" not in data:
            return jsonify({"error": "Missing image data"}), 400

        # Extract parameters
        doc_data = base64.b64decode(data["image"])
        doc_format = data.get("format", "png").lower()
        custom_fields = data.get("custom_fields", [])
        batch_size = data.get("batch_size", 5)
        batch_index = data.get("batch_index", 0)

        logger.info(
            f"[/extract-batch] Processing batch {batch_index} with {len(custom_fields)} total fields"
        )

        # Sort fields by priority: required fields first
        priority_fields = [f for f in custom_fields if f.get("required", False)]
        optional_fields = [f for f in custom_fields if not f.get("required", False)]
        sorted_fields = priority_fields + optional_fields

        logger.info(
            f"[/extract-batch] Priority: {len(priority_fields)} required, {len(optional_fields)} optional"
        )

        # Calculate batch range
        start_idx = batch_index * batch_size
        end_idx = min(start_idx + batch_size, len(sorted_fields))
        batch_fields = sorted_fields[start_idx:end_idx]

        total_batches = (len(sorted_fields) + batch_size - 1) // batch_size
        has_more = batch_index < (total_batches - 1)

        logger.info(
            f"[/extract-batch] Processing fields {start_idx} to {end_idx-1} (batch {batch_index+1}/{total_batches})"
        )

        if not batch_fields:
            return jsonify(
                {
                    "status": "success",
                    "fields": [],
                    "batch_info": {
                        "batch_index": batch_index,
                        "batch_size": batch_size,
                        "total_fields": len(sorted_fields),
                        "total_batches": total_batches,
                        "has_more": False,
                        "processed_count": 0,
                    },
                }
            )

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=f".{doc_format}", delete=False) as tmp:
            tmp.write(doc_data)
            tmp_path = tmp.name

        try:
            # Convert PDF to image if needed
            if doc_format == "pdf":
                images = convert_from_path(tmp_path, first_page=1, last_page=1, dpi=200)
                if not images:
                    return jsonify({"error": "PDF has no pages"}), 400

                img_path = tmp_path.replace(".pdf", ".png")
                images[0].save(img_path, "PNG")
                os.unlink(tmp_path)
                tmp_path = img_path

            # Extract ONLY the batch fields
            # Calculate starting field ID based on batch index
            start_field_id = (batch_index * batch_size) + 1

            logger.info(f"[/extract-batch] Starting field IDs from {start_field_id}")

            result = extract_fields_with_donut(tmp_path, batch_fields, start_field_id)

            logger.info(
                f"[/extract-batch] Extracted {len(result.get('fields', []))} fields from batch {batch_index}"
            )

            return jsonify(
                {
                    "status": "success",
                    "fields": result.get("fields", []),
                    "batch_info": {
                        "batch_index": batch_index,
                        "batch_size": batch_size,
                        "total_fields": len(sorted_fields),
                        "total_batches": total_batches,
                        "has_more": has_more,
                        "processed_count": len(result.get("fields", [])),
                        "next_batch_index": batch_index + 1 if has_more else None,
                    },
                    "image_size": result.get("image_size", {}),
                }
            )

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"Batch extraction error: {e}", exc_info=True)
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


@app.route("/extract-batch", methods=["POST"])
def extract_batch():
    """
    Extract multiple field instances from a single large bbox using word-level OCR.
    Automatically splits the bbox into individual values (e.g., multiple HS codes in a column).

    Request body:
        {
            "image": "base64-encoded-document-data",
            "format": "png|jpg|jpeg|pdf",
            "bbox": [x1, y1, x2, y2],  # Normalized [0-1000] coordinates
            "field_name": "field_name_base"
        }

    Returns:
        {
            "status": "success",
            "fields": [
                {"value": "...", "bbox": [...], "confidence": 0.95},
                ...
            ]
        }
    """
    try:
        data = request.get_json()

        if (
            not data
            or "image" not in data
            or "bbox" not in data
            or "field_name" not in data
        ):
            return jsonify({"error": "Missing required parameters"}), 400

        # Decode base64 document
        doc_data = base64.b64decode(data["image"])
        doc_format = data.get("format", "png").lower()
        bbox = data["bbox"]  # [x1, y1, x2, y2] in normalized [0-1000] coordinates
        field_name = data["field_name"]

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=f".{doc_format}", delete=False) as tmp:
            tmp.write(doc_data)
            tmp_path = tmp.name

        try:
            # Convert PDF to image if needed
            image_path = tmp_path
            if doc_format == "pdf":
                logger.info(f"Converting PDF to image for batch extraction")
                images = convert_from_path(tmp_path, first_page=1, last_page=1, dpi=200)

                if not images:
                    return jsonify({"error": "PDF has no pages"}), 400

                page_image_path = tmp_path.replace(".pdf", ".png")
                images[0].save(page_image_path, "PNG")
                image_path = page_image_path

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
                f"Batch extracting from region: ({x1}, {y1}) to ({x2}, {y2}), size: {cropped_image.size}"
            )

            # Preprocess image
            cropped_gray = cropped_image.convert("L")
            from PIL import ImageEnhance

            enhancer = ImageEnhance.Contrast(cropped_gray)
            cropped_enhanced = enhancer.enhance(2.0)

            # Upscale if needed
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

            # Get word-level OCR data using Tesseract
            ocr_data = pytesseract.image_to_data(
                cropped_enhanced,
                output_type=pytesseract.Output.DICT,
                config="--psm 6 --oem 3",  # psm 6: Assume uniform block of text
            )

            # Extract individual words/values with their bounding boxes
            fields = []
            for i in range(len(ocr_data["text"])):
                text = ocr_data["text"][i].strip()
                conf = int(ocr_data["conf"][i])

                # Only keep text with good confidence and non-empty
                if text and conf > 30:  # Lower threshold for batch extraction
                    # Get word bounding box in cropped image
                    word_x = ocr_data["left"][i]
                    word_y = ocr_data["top"][i]
                    word_w = ocr_data["width"][i]
                    word_h = ocr_data["height"][i]

                    # Convert back to full image coordinates
                    abs_x1 = x1 + word_x
                    abs_y1 = y1 + word_y
                    abs_x2 = abs_x1 + word_w
                    abs_y2 = abs_y1 + word_h

                    # Convert to normalized coordinates [0-1000]
                    norm_bbox = [
                        int((abs_x1 / img_width) * 1000),
                        int((abs_y1 / img_height) * 1000),
                        int((abs_x2 / img_width) * 1000),
                        int((abs_y2 / img_height) * 1000),
                    ]

                    fields.append(
                        {"value": text, "bbox": norm_bbox, "confidence": conf / 100.0}
                    )

            logger.info(f"Batch extraction found {len(fields)} values")

            return jsonify(
                {
                    "status": "success",
                    "fields": fields,
                    "message": f"Extracted {len(fields)} instances",
                }
            )

        finally:
            # Cleanup temp files
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            if doc_format == "pdf" and os.path.exists(image_path):
                os.unlink(image_path)

    except Exception as e:
        logger.error(f"Error in batch extraction: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/detect-text-bboxes", methods=["POST"])
def detect_text_bboxes():
    """
    Detect all text bounding boxes in a document using OCR.
    Returns all text elements with their bboxes for user selection.

    Request body:
        {
            "image": "base64-encoded-document-data",
            "format": "png|jpg|jpeg|pdf",
            "page": 1,  # optional, for PDFs
            "exclude_bboxes": [[x1,y1,x2,y2], ...]  # optional, already extracted field bboxes to exclude
        }

    Returns:
        {
            "status": "success",
            "text_bboxes": [
                {
                    "id": "ocr_0",
                    "text": "detected text",
                    "bbox": [x1, y1, x2, y2],  # normalized [0-1000]
                    "confidence": 0.95
                },
                ...
            ],
            "image_size": {"width": 1200, "height": 1600}
        }
    """
    try:
        data = request.get_json()

        if not data or "image" not in data:
            return jsonify({"error": "Missing image data"}), 400

        # Decode base64 document
        doc_data = base64.b64decode(data["image"])
        doc_format = data.get("format", "png").lower()
        page_num = data.get("page", 1)
        exclude_bboxes = data.get(
            "exclude_bboxes", []
        )  # Already extracted fields to exclude

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=f".{doc_format}", delete=False) as tmp:
            tmp.write(doc_data)
            tmp_path = tmp.name

        try:
            # Convert PDF to image if needed
            image_path = tmp_path
            if doc_format == "pdf":
                logger.info(
                    f"Converting PDF page {page_num} to image for text detection"
                )
                images = convert_from_path(
                    tmp_path, first_page=page_num, last_page=page_num, dpi=200
                )

                if not images:
                    return jsonify({"error": "PDF has no pages"}), 400

                page_image_path = tmp_path.replace(".pdf", ".png")
                images[0].save(page_image_path, "PNG")
                image_path = page_image_path

            # Open image to get dimensions
            image = Image.open(image_path).convert("RGB")
            img_width, img_height = image.size

            logger.info(f"Detecting text bboxes in {img_width}x{img_height} image")

            # Don't resize - work with original image for accurate bboxes
            # Use faster OCR settings instead
            image_gray = image.convert("L")
            from PIL import ImageEnhance

            enhancer = ImageEnhance.Contrast(image_gray)
            image_enhanced = enhancer.enhance(1.3)

            # Get word-level OCR data using Tesseract
            # PSM 6 = Uniform block of text
            # OEM 1 = LSTM only (best accuracy)
            logger.info("Running Tesseract OCR for text detection...")
            ocr_data = pytesseract.image_to_data(
                image_enhanced,
                output_type=pytesseract.Output.DICT,
                config="--psm 3 --oem 1",  # PSM 3 for better accuracy on complex layouts
            )

            # Helper function to check if bbox overlaps with existing fields
            def overlaps_with_existing(bbox, existing_bboxes, threshold=0.5):
                """Check if bbox significantly overlaps with any existing bbox"""
                x1, y1, x2, y2 = bbox
                area = (x2 - x1) * (y2 - y1)
                if area == 0:
                    return False

                for ex_bbox in existing_bboxes:
                    ex_x1, ex_y1, ex_x2, ex_y2 = ex_bbox
                    # Calculate intersection
                    int_x1 = max(x1, ex_x1)
                    int_y1 = max(y1, ex_y1)
                    int_x2 = min(x2, ex_x2)
                    int_y2 = min(y2, ex_y2)

                    if int_x1 < int_x2 and int_y1 < int_y2:
                        intersection = (int_x2 - int_x1) * (int_y2 - int_y1)
                        overlap_ratio = intersection / area
                        if overlap_ratio > threshold:
                            return True
                return False

            # Extract individual text elements with their bounding boxes
            text_bboxes = []
            bbox_id = 0
            excluded_count = 0

            for i in range(len(ocr_data["text"])):
                text = ocr_data["text"][i].strip()
                conf = int(ocr_data["conf"][i])

                # Only keep text with reasonable confidence and non-empty
                if text and conf > 30:  # Lower threshold for more detection
                    # Get word bounding box in original image coordinates
                    x = ocr_data["left"][i]
                    y = ocr_data["top"][i]
                    w = ocr_data["width"][i]
                    h = ocr_data["height"][i]

                    # Add padding around bbox to prevent text cutoff (6px on each side for better accuracy)
                    padding_px = 6
                    x = max(0, x - padding_px)
                    y = max(0, y - padding_px)
                    w = min(img_width - x, w + (padding_px * 2))
                    h = min(img_height - y, h + (padding_px * 2))

                    # Convert to normalized coordinates [0-1000]
                    norm_bbox = [
                        int((x / img_width) * 1000),
                        int((y / img_height) * 1000),
                        int(((x + w) / img_width) * 1000),
                        int(((y + h) / img_height) * 1000),
                    ]

                    # Skip if overlaps with existing extracted fields
                    if overlaps_with_existing(norm_bbox, exclude_bboxes):
                        excluded_count += 1
                        continue

                    text_bboxes.append(
                        {
                            "id": f"ocr_{bbox_id}",
                            "text": text,
                            "bbox": norm_bbox,
                            "confidence": conf / 100.0,
                        }
                    )
                    bbox_id += 1

            logger.info(
                f"Detected {len(text_bboxes)} text bboxes (excluded {excluded_count} overlapping with existing fields)"
            )

            return jsonify(
                {
                    "status": "success",
                    "text_bboxes": text_bboxes,
                    "image_size": {"width": img_width, "height": img_height},
                }
            )

        finally:
            # Cleanup temp files
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            if doc_format == "pdf" and os.path.exists(image_path):
                os.unlink(image_path)

    except Exception as e:
        logger.error(f"Error in text bbox detection: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/apply-template-intelligent", methods=["POST"])
def apply_template_intelligent():
    """
    Apply template fields intelligently using LayoutLM + enhanced OCR.
    Detects table structure, reads headers, and uses semantic understanding.

    Request body:
        {
            "image": "base64-encoded-document-data",
            "format": "png|jpg|jpeg|pdf",
            "source_page": 1,
            "target_page": 1,  // Can be same page for column detection
            "template_fields": [
                {
                    "field_name": "gross_weight",
                    "value": "127.700",
                    "bbox": [x1, y1, x2, y2]
                }
            ],
            "suggest_columns": true
        }
    """
    try:
        data = request.get_json()

        if not data or "image" not in data:
            return jsonify({"error": "Missing image data"}), 400

        # Load LayoutLM model
        global _doc_qa_pipeline
        if _doc_qa_pipeline is None:
            load_layoutlm_model()

        doc_data = base64.b64decode(data["image"])
        doc_format = data.get("format", "pdf").lower()
        source_page = data.get("source_page", 1)
        target_page = data.get("target_page", 1)
        template_fields = data.get("template_fields", [])
        suggest_columns = data.get("suggest_columns", False)

        same_page = source_page == target_page

        logger.info(
            f"[/apply-template-intelligent] Mode: {'Column detection' if same_page else 'Cross-page'}, Page: {target_page}, Templates: {len(template_fields)}"
        )

        tmp_path = None
        image_path = None

        try:
            # Process image
            if doc_format == "pdf":
                tmp_path = "/tmp/temp_doc_template.pdf"
                with open(tmp_path, "wb") as f:
                    f.write(doc_data)

                images = convert_from_path(
                    tmp_path, first_page=target_page, last_page=target_page, dpi=200
                )
                if not images:
                    return (
                        jsonify({"error": f"Failed to convert page {target_page}"}),
                        500,
                    )

                image = images[0]

                # Save image for OCR
                image_path = "/tmp/temp_page.png"
                image.save(image_path)
            else:
                import io

                image = Image.open(io.BytesIO(doc_data)).convert("RGB")
                image_path = "/tmp/temp_page.png"
                image.save(image_path)

            img_width, img_height = image.size
            logger.info(
                f"[/apply-template-intelligent] Image size: {img_width}x{img_height}"
            )

            # IMPROVED OCR: Use PSM 6 for table/block text instead of PSM 3
            # PSM 6 assumes uniform block of text (better for tables)
            ocr_result = pytesseract.image_to_data(
                image, output_type=pytesseract.Output.DICT, config="--psm 6"
            )

            # Build enhanced text blocks with better filtering
            text_blocks = []
            for i in range(len(ocr_result["text"])):
                text = ocr_result["text"][i].strip()
                conf = int(ocr_result["conf"][i])

                # Lower confidence threshold and accept more text
                if text and conf > 20:  # Reduced from 30 to 20
                    x, y = ocr_result["left"][i], ocr_result["top"][i]
                    w, h = ocr_result["width"][i], ocr_result["height"][i]

                    norm_bbox = [
                        int((x / img_width) * 1000),
                        int((y / img_height) * 1000),
                        int(((x + w) / img_width) * 1000),
                        int(((y + h) / img_height) * 1000),
                    ]

                    text_blocks.append(
                        {
                            "text": text,
                            "bbox": norm_bbox,
                            "pixel_bbox": [x, y, x + w, y + h],
                            "conf": conf,
                        }
                    )

            logger.info(
                f"[/apply-template-intelligent] OCR found {len(text_blocks)} text blocks"
            )

            # Log sample for debugging
            if text_blocks:
                sample_texts = [b["text"] for b in text_blocks[:20]]
                logger.info(
                    f"[/apply-template-intelligent] Sample OCR text: {sample_texts}"
                )

            if not template_fields:
                return jsonify({"error": "No template fields provided"}), 400

            # Analyze template pattern
            template_x_positions = []
            template_y_positions = []
            template_values = []

            for t in template_fields:
                bbox = t.get("bbox", [0, 0, 1000, 1000])
                center_x = (bbox[0] + bbox[2]) / 2
                center_y = (bbox[1] + bbox[3]) / 2
                template_x_positions.append(center_x)
                template_y_positions.append(center_y)
                template_values.append(t.get("value", ""))

            x_variance = (
                max(template_x_positions) - min(template_x_positions)
                if template_x_positions
                else 0
            )
            y_variance = (
                max(template_y_positions) - min(template_y_positions)
                if template_y_positions
                else 0
            )

            is_column_pattern = x_variance < 100
            avg_template_x = sum(template_x_positions) / len(template_x_positions)
            min_template_y = min(template_y_positions)
            max_template_y = max(template_y_positions)

            logger.info(
                f"[/apply-template-intelligent] Pattern: {'COLUMN' if is_column_pattern else 'SCATTERED'}, "
                f"X_var={x_variance:.1f}, Y_var={y_variance:.1f}, Avg_X={avg_template_x:.1f}"
            )

            extracted_fields = []

            if same_page and suggest_columns and is_column_pattern:
                # COLUMN DETECTION MODE with SEMANTIC UNDERSTANDING
                logger.info(
                    "[/apply-template-intelligent] Column detection mode activated"
                )

                # Step 1: Find potential headers ABOVE the template region
                header_y_max = (
                    min_template_y - 20
                )  # Headers should be at least 2% above data
                potential_headers_raw = []

                for block in text_blocks:
                    block_center_y = (block["bbox"][1] + block["bbox"][3]) / 2

                    # Must be above template rows
                    if block_center_y < header_y_max:
                        potential_headers_raw.append(block)

                logger.info(
                    f"[/apply-template-intelligent] Found {len(potential_headers_raw)} raw header blocks"
                )

                # Step 1.5: MERGE ADJACENT HEADER BLOCKS (e.g., "Material" + "No." → "Material No.")
                # Sort by Y then X to process left-to-right, top-to-bottom
                potential_headers_raw.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))

                merged_headers = []
                i = 0
                while i < len(potential_headers_raw):
                    current = potential_headers_raw[i]
                    merged_text = current["text"]
                    merged_bbox = current["bbox"].copy()
                    merged_conf = current["conf"]

                    # Look ahead for adjacent blocks (same row, close X position)
                    j = i + 1
                    while j < len(potential_headers_raw):
                        next_block = potential_headers_raw[j]

                        # Check if on same row (Y within 10 units = 1%)
                        y_diff = abs(current["bbox"][1] - next_block["bbox"][1])
                        # Check if horizontally adjacent (X gap < 30 units = 3%)
                        x_gap = next_block["bbox"][0] - merged_bbox[2]

                        if y_diff < 10 and 0 <= x_gap < 30:
                            # Merge this block
                            merged_text += " " + next_block["text"]
                            merged_bbox[2] = next_block["bbox"][2]  # Extend right edge
                            merged_bbox[3] = max(
                                merged_bbox[3], next_block["bbox"][3]
                            )  # Max bottom
                            merged_conf = max(merged_conf, next_block["conf"])
                            j += 1
                        else:
                            break

                    merged_headers.append(
                        {
                            "text": merged_text,
                            "bbox": merged_bbox,
                            "conf": merged_conf,
                        }
                    )

                    i = j if j > i + 1 else i + 1

                potential_headers = merged_headers
                logger.info(
                    f"[/apply-template-intelligent] Merged into {len(potential_headers)} complete headers: "
                    f"{[h['text'] for h in potential_headers[:10]]}"
                )

                # Step 2: Group all text blocks into columns by X position
                columns = {}
                x_tolerance = 60  # 6% tolerance

                for block in text_blocks:
                    block_center_x = (block["bbox"][0] + block["bbox"][2]) / 2
                    block_center_y = (block["bbox"][1] + block["bbox"][3]) / 2

                    # Skip template column
                    if abs(block_center_x - avg_template_x) < x_tolerance:
                        continue

                    # Skip if not in data region (below headers)
                    if block_center_y < min_template_y - 50:
                        continue

                    # Find or create column
                    found = False
                    for col_x in list(columns.keys()):
                        if abs(block_center_x - col_x) < x_tolerance:
                            columns[col_x].append(block)
                            found = True
                            break

                    if not found:
                        columns[block_center_x] = [block]

                logger.info(
                    f"[/apply-template-intelligent] Grouped into {len(columns)} columns"
                )

                # Step 2.5: CONSERVATIVE LayoutLM usage - only for truly missing headers
                # Reduce AI reliance, prioritize template-based matching
                layoutlm_headers = []
                use_layoutlm = data.get("use_ai_fallback", False)  # User must opt-in

                if (
                    use_layoutlm
                    and len(potential_headers) < (len(columns) * 0.5)
                    and _doc_qa_pipeline
                ):
                    # Only use if more than 50% of headers are missing
                    try:
                        logger.info(
                            "[/apply-template-intelligent] LayoutLM fallback activated (>50% headers missing)..."
                        )
                        result = _doc_qa_pipeline(
                            image=image,
                            question="What are all the column headers in the table?",
                        )

                        if result and isinstance(result, dict):
                            answer = result.get("answer", "")
                            if answer and answer != "None":
                                # Parse comma-separated or space-separated headers
                                llm_headers = [
                                    h.strip()
                                    for h in answer.replace(",", " ").split()
                                    if h.strip()
                                ]
                                layoutlm_headers = llm_headers
                                logger.info(
                                    f"[/apply-template-intelligent] LayoutLM found headers: {llm_headers}"
                                )
                    except Exception as e:
                        logger.warning(
                            f"[/apply-template-intelligent] LayoutLM Q&A failed: {e}"
                        )
                else:
                    logger.info(
                        f"[/apply-template-intelligent] Skipping LayoutLM (template-based mode, {len(potential_headers)} headers found)"
                    )

                # Combine OCR and LayoutLM headers
                all_header_texts = [
                    h["text"] for h in potential_headers
                ] + layoutlm_headers
                logger.info(
                    f"[/apply-template-intelligent] Total headers available: {all_header_texts}"
                )

                # Step 3: For each column, find its header and match rows
                # Build a map of template field names for semantic matching
                from difflib import SequenceMatcher

                def fuzzy_match_score(a, b):
                    """Calculate similarity between two strings (0-1)"""
                    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

                template_field_names = [
                    t.get("field_name", "").lower().replace("_", " ")
                    for t in template_fields
                ]

                for col_x, col_blocks in columns.items():
                    if len(col_blocks) < 1:
                        continue

                    # Find header for this column using HYBRID approach:
                    # 1. Spatial proximity (closest by X position)
                    # 2. Semantic similarity (fuzzy match with template field names)
                    column_header = None
                    min_x_dist = float("inf")
                    best_semantic_score = 0

                    # First pass: spatial proximity
                    for header in potential_headers:
                        header_center_x = (header["bbox"][0] + header["bbox"][2]) / 2
                        x_dist = abs(header_center_x - col_x)

                        if x_dist < 80:  # Within 8%
                            # Calculate semantic similarity with template fields
                            max_similarity = 0
                            for template_name in template_field_names:
                                similarity = fuzzy_match_score(
                                    header["text"], template_name
                                )
                                max_similarity = max(max_similarity, similarity)

                            # Weighted score: 60% spatial + 40% semantic
                            spatial_score = 1.0 - (x_dist / 80.0)  # Normalize to 0-1
                            combined_score = 0.6 * spatial_score + 0.4 * max_similarity

                            if combined_score > best_semantic_score:
                                best_semantic_score = combined_score
                                column_header = header
                                min_x_dist = x_dist

                    # Generate field name from header or position
                    if column_header:
                        # Clean up header text for field name
                        header_text = column_header["text"]
                        suggested_field_name = (
                            header_text.lower()
                            .replace(" ", "_")
                            .replace("/", "_")
                            .replace(".", "")
                            .replace("-", "_")
                            .strip("_")
                        )
                        logger.info(
                            f"[/apply-template-intelligent] Column at X={col_x:.0f} has header: '{header_text}' → {suggested_field_name} (score={best_semantic_score:.2f})"
                        )
                    else:
                        suggested_field_name = f"column_{int(col_x)}"
                        logger.info(
                            f"[/apply-template-intelligent] Column at X={col_x:.0f} has NO header, using: {suggested_field_name}"
                        )

                    # Sort column blocks by Y position
                    col_blocks_sorted = sorted(
                        col_blocks, key=lambda b: (b["bbox"][1] + b["bbox"][3]) / 2
                    )

                    # Match each template Y position to closest block in this column
                    for template_idx, template_y in enumerate(template_y_positions):
                        closest_block = None
                        min_y_diff = float("inf")

                        for block in col_blocks_sorted:
                            block_center_y = (block["bbox"][1] + block["bbox"][3]) / 2
                            y_diff = abs(block_center_y - template_y)

                            if (
                                y_diff < min_y_diff and y_diff < 60
                            ):  # Within 6% tolerance
                                min_y_diff = y_diff
                                closest_block = block

                        if closest_block:
                            field_name = (
                                f"{suggested_field_name}_item_{template_idx + 1}"
                                if len(template_y_positions) > 1
                                else suggested_field_name
                            )

                            extracted_fields.append(
                                {
                                    "field_name": field_name,
                                    "value": closest_block["text"],
                                    "bbox": closest_block["bbox"],
                                    "confidence": closest_block["conf"] / 100.0,
                                    "source": "column_suggestion",
                                    "column_header": (
                                        column_header["text"] if column_header else None
                                    ),
                                }
                            )

                            logger.info(
                                f"[/apply-template-intelligent] Matched {field_name} = '{closest_block['text']}' "
                                f"(Y_diff={min_y_diff:.1f})"
                            )

                logger.info(
                    f"[/apply-template-intelligent] Extracted {len(extracted_fields)} fields from {len(columns)} columns"
                )

            else:
                # CROSS-PAGE TEMPLATE MODE OR NON-TABULAR DOCUMENTS
                logger.info(
                    "[/apply-template-intelligent] Cross-page/non-tabular template mode"
                )

                for template in template_fields:
                    field_name = template.get("field_name", "unknown")
                    example_value = template.get("value", "")
                    template_bbox = template.get("bbox", [0, 0, 1000, 1000])

                    template_center_y = (template_bbox[1] + template_bbox[3]) / 2
                    template_center_x = (template_bbox[0] + template_bbox[2]) / 2

                    # Strategy 1: Find blocks in similar region (spatial matching)
                    y_tolerance = 200
                    x_tolerance = 200

                    candidates = []
                    for block in text_blocks:
                        block_center_y = (block["bbox"][1] + block["bbox"][3]) / 2
                        block_center_x = (block["bbox"][0] + block["bbox"][2]) / 2

                        y_diff = abs(block_center_y - template_center_y)
                        x_diff = abs(block_center_x - template_center_x)

                        if y_diff < y_tolerance and x_diff < x_tolerance:
                            # Accept both numeric and text, but prefer same type
                            is_numeric = any(c.isdigit() for c in block["text"])
                            example_is_numeric = any(c.isdigit() for c in example_value)

                            type_match_bonus = (
                                0.5 if (is_numeric == example_is_numeric) else 0.0
                            )
                            distance = (y_diff**2 + x_diff**2) ** 0.5 - (
                                type_match_bonus * 50
                            )
                            candidates.append({"block": block, "distance": distance})

                    # Strategy 2: If no spatial match and LayoutLM available, ask the model
                    if not candidates and _doc_qa_pipeline and not same_page:
                        try:
                            # Convert field_name to human-readable question
                            question = field_name.replace("_", " ").title()
                            logger.info(
                                f"[/apply-template-intelligent] Asking LayoutLM: 'What is the {question}?'"
                            )

                            result = _doc_qa_pipeline(
                                image=image, question=f"What is the {question}?"
                            )

                            if result and isinstance(result, dict):
                                answer = result.get("answer", "")
                                answer_score = result.get("score", 0.0)

                                if answer and answer != "None" and answer_score > 0.3:
                                    # Find the bbox for this answer in OCR results
                                    for block in text_blocks:
                                        if (
                                            answer.lower() in block["text"].lower()
                                            or block["text"].lower() in answer.lower()
                                        ):
                                            extracted_fields.append(
                                                {
                                                    "field_name": field_name,
                                                    "value": answer,
                                                    "bbox": block["bbox"],
                                                    "confidence": answer_score,
                                                    "source": "layoutlm_qa",
                                                }
                                            )
                                            logger.info(
                                                f"[/apply-template-intelligent] LayoutLM found {field_name} = '{answer}' (score={answer_score:.2f})"
                                            )
                                            break
                        except Exception as e:
                            logger.warning(
                                f"[/apply-template-intelligent] LayoutLM Q&A for '{field_name}' failed: {e}"
                            )

                    # Use best spatial match if found
                    if candidates:
                        candidates.sort(key=lambda c: c["distance"])
                        best = candidates[0]["block"]

                        extracted_fields.append(
                            {
                                "field_name": field_name,
                                "value": best["text"],
                                "bbox": best["bbox"],
                                "confidence": best["conf"] / 100.0,
                                "source": "template_match",
                            }
                        )

            return jsonify(
                {
                    "status": "success",
                    "fields": extracted_fields,
                    "page": target_page,
                    "mode": (
                        "column_detection"
                        if (same_page and suggest_columns)
                        else "template_application"
                    ),
                    "debug": {
                        "total_ocr_blocks": len(text_blocks),
                        "columns_detected": (
                            len(columns) if same_page and suggest_columns else 0
                        ),
                    },
                }
            )

        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
            if image_path and os.path.exists(image_path):
                os.unlink(image_path)

    except Exception as e:
        logger.error(f"Error in intelligent template application: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/templates/save", methods=["POST"])
def save_vendor_template():
    """
    Save a learned template for vendor reuse.

    Request body:
        {
            "vendor_name": "acme_corp",
            "fields": [
                {
                    "field_name": "invoice_number",
                    "bbox": [x1, y1, x2, y2],
                    "field_type": "text",
                    "required": true
                }
            ],
            "metadata": {
                "page_count": 2,
                "has_table": true,
                "description": "Standard ACME invoice format"
            }
        }
    """
    try:
        data = request.get_json()
        vendor_name = data.get("vendor_name", "").strip()

        if not vendor_name:
            return jsonify({"error": "vendor_name is required"}), 400

        # Sanitize vendor name for filename
        vendor_name = "".join(
            c if c.isalnum() or c in "_-" else "_" for c in vendor_name.lower()
        )

        template_data = {
            "vendor_name": vendor_name,
            "fields": data.get("fields", []),
            "metadata": data.get("metadata", {}),
            "created": datetime.now().isoformat(),
        }

        success = save_template(vendor_name, template_data)

        if success:
            return jsonify(
                {
                    "status": "success",
                    "vendor_name": vendor_name,
                    "template_saved": True,
                }
            )
        else:
            return jsonify({"error": "Failed to save template"}), 500

    except Exception as e:
        logger.error(f"Error saving template: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/templates/load/<vendor_name>", methods=["GET"])
def load_vendor_template(vendor_name):
    """Load a saved template by vendor name."""
    try:
        template = load_template(vendor_name)

        if template:
            return jsonify({"status": "success", "template": template})
        else:
            return jsonify({"error": "Template not found"}), 404

    except Exception as e:
        logger.error(f"Error loading template: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/templates/list", methods=["GET"])
def list_vendor_templates():
    """List all saved vendor templates."""
    try:
        templates = list_templates()
        return jsonify(
            {"status": "success", "templates": templates, "count": len(templates)}
        )
    except Exception as e:
        logger.error(f"Error listing templates: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/templates/delete/<vendor_name>", methods=["DELETE"])
def delete_vendor_template(vendor_name):
    """Delete a saved template."""
    try:
        template_file = TEMPLATE_DIR / f"{vendor_name}.json"

        if template_file.exists():
            template_file.unlink()
            logger.info(f"[Template] Deleted template for vendor: {vendor_name}")
            return jsonify({"status": "success", "deleted": True})
        else:
            return jsonify({"error": "Template not found"}), 404

    except Exception as e:
        logger.error(f"Error deleting template: {e}", exc_info=True)
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
                "/extract-batch": "Extract fields in batches to avoid CPU overload (POST with batch_index)",
                "/reextract-bbox": "Re-extract text from specific bbox (POST with image + bbox)",
                "/extract-batch": "Extract multiple values from large bbox (POST with image + bbox + field_name)",
                "/detect-text-bboxes": "Detect all OCR text bboxes for selection (POST with base64 image)",
                "/apply-template-intelligent": "Apply template fields intelligently using model context (POST)",
                "/templates/save": "Save vendor template for reuse (POST)",
                "/templates/load/<vendor>": "Load saved vendor template (GET)",
                "/templates/list": "List all saved templates (GET)",
                "/templates/delete/<vendor>": "Delete vendor template (DELETE)",
            },
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3002))
    logger.info(f"Starting Donut service on port {port}")
    logger.info("Note: Model will be loaded on first request (may take 30-60s)")

    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
