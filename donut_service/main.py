#!/usr/bin/env python3
"""
Donut Document Understanding Service
Standalone service for end-to-end document field extraction
Runs on port 3002, called by Lambda backend
"""

import os
import sys
import logging
import tempfile
import base64
import json
from typing import Dict, Any
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Global model variables (lazy loaded)
_donut_model = None
_donut_processor = None


def load_donut_model():
    """Load Donut model on first request (lazy loading)."""
    global _donut_model, _donut_processor
    
    if _donut_model is None:
        logger.info("Loading Donut model (this may take 30-60 seconds)...")
        try:
            model_name = "naver-clova-ix/donut-base-finetuned-cord-v2"
            _donut_processor = DonutProcessor.from_pretrained(model_name)
            _donut_model = VisionEncoderDecoderModel.from_pretrained(model_name)
            logger.info("✓ Donut model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Donut model: {e}")
            raise
    
    return _donut_model, _donut_processor


def extract_fields_with_donut(image_path: str) -> Dict[str, Any]:
    """
    Extract document fields using Donut model.
    
    Args:
        image_path: Path to image file
        
    Returns:
        Dictionary with extracted fields and bounding boxes
    """
    model, processor = load_donut_model()
    
    try:
        # Load and prepare image
        image = Image.open(image_path).convert("RGB")
        image_width, image_height = image.size
        
        # Prepare for Donut
        pixel_values = processor(image, return_tensors="pt").pixel_values
        
        # Task prompt for document understanding
        task_prompt = "<s_cord-v2>"
        decoder_input_ids = processor.tokenizer(
            task_prompt,
            add_special_tokens=False,
            return_tensors="pt"
        ).input_ids
        
        # Generate predictions
        logger.info("Running Donut inference...")
        outputs = model.generate(
            pixel_values,
            decoder_input_ids=decoder_input_ids,
            max_length=model.decoder.config.max_position_embeddings,
            early_stopping=True,
            pad_token_id=processor.tokenizer.pad_token_id,
            eos_token_id=processor.tokenizer.eos_token_id,
            use_cache=True,
            num_beams=1,
            bad_words_ids=[[processor.tokenizer.unk_token_id]],
            return_dict_in_generate=True,
        )
        
        # Decode predictions
        sequence = processor.batch_decode(outputs.sequences)[0]
        sequence = sequence.replace(processor.tokenizer.eos_token, "").replace(processor.tokenizer.pad_token, "")
        sequence = re.sub(r"<.*?>", "", sequence, count=1).strip()
        
        # Convert to JSON
        result = processor.token2json(sequence)
        
        logger.info(f"Extracted {len(result)} top-level fields")
        
        # Convert to standardized format with normalized bboxes
        standardized_fields = convert_donut_to_standard_format(
            result, 
            image_width, 
            image_height
        )
        
        return {
            'raw_output': result,
            'fields': standardized_fields,
            'image_size': {'width': image_width, 'height': image_height}
        }
        
    except Exception as e:
        logger.error(f"Donut extraction failed: {e}")
        raise


def convert_donut_to_standard_format(donut_result: Dict, img_width: int, img_height: int) -> list:
    """
    Convert Donut output to standardized field format.
    
    Args:
        donut_result: Raw Donut output
        img_width: Image width for bbox normalization
        img_height: Image height for bbox normalization
        
    Returns:
        List of field dictionaries with normalized bboxes [0-1000]
    """
    fields = []
    field_id = 1
    
    # Map CORD dataset fields to customs/invoice fields
    field_mapping = {
        'menu': 'line_items',
        'total': 'total_amount',
        'subtotal': 'subtotal',
        'tax': 'tax_amount',
        'store_name': 'vendor_name',
        'store_addr': 'vendor_address',
        'total.total_price': 'total_amount',
        'total.subtotal_price': 'subtotal',
        'total.tax_price': 'tax_amount',
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
            int((y2 / img_h) * 1000)
        ]
    
    def extract_field(key, value, parent_key=''):
        """Recursively extract fields from nested structure."""
        nonlocal field_id
        
        full_key = f"{parent_key}.{key}" if parent_key else key
        mapped_name = field_mapping.get(full_key, full_key)
        
        if isinstance(value, dict):
            # Handle nested objects
            if 'text' in value or 'value' in value:
                # Leaf node with text
                text = value.get('text') or value.get('value', '')
                bbox = value.get('bounding_box', value.get('bbox', []))
                
                fields.append({
                    'id': field_id,
                    'label': mapped_name,
                    'value': str(text),
                    'bbox': normalize_bbox(bbox, img_width, img_height),
                    'confidence': value.get('confidence', 0.9)
                })
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
                    fields.append({
                        'id': field_id,
                        'label': f"{mapped_name}_{idx+1}",
                        'value': str(item),
                        'bbox': [0, 0, 100, 100],
                        'confidence': 0.8
                    })
                    field_id += 1
        else:
            # Simple value
            fields.append({
                'id': field_id,
                'label': mapped_name,
                'value': str(value),
                'bbox': [0, 0, 100, 100],
                'confidence': 0.85
            })
            field_id += 1
    
    # Process all top-level fields
    for key, value in donut_result.items():
        extract_field(key, value)
    
    return fields


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'donut-extraction',
        'model_loaded': _donut_model is not None
    })


@app.route('/extract', methods=['POST'])
def extract_document():
    """
    Extract fields from document image.
    
    Request body:
        {
            "image": "base64-encoded-image-data",
            "format": "png|jpg|jpeg"
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
        
        if not data or 'image' not in data:
            return jsonify({'error': 'Missing image data'}), 400
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'])
        image_format = data.get('format', 'png')
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=f'.{image_format}', delete=False) as tmp:
            tmp.write(image_data)
            tmp_path = tmp.name
        
        try:
            # Extract fields
            result = extract_fields_with_donut(tmp_path)
            
            return jsonify({
                'status': 'success',
                **result
            })
        finally:
            # Cleanup
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    except Exception as e:
        logger.error(f"Extraction error: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/', methods=['GET'])
def index():
    """Root endpoint."""
    return jsonify({
        'service': 'Donut Document Understanding Service',
        'version': '1.0.0',
        'endpoints': {
            '/health': 'Health check',
            '/extract': 'Extract fields from document (POST with base64 image)'
        }
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3002))
    logger.info(f"Starting Donut service on port {port}")
    logger.info("Note: Model will be loaded on first request (may take 30-60s)")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,
        threaded=True
    )
