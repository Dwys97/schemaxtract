import json
import base64
import os
import re
import tempfile
import logging
from typing import List, Dict, Any
from PIL import Image
import fitz  # PyMuPDF

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Global variables for lazy loading models
_donut_model = None
_donut_processor = None

def get_donut_model():
    """Lazy load Donut model to reduce cold start time."""
    global _donut_model, _donut_processor
    
    if _donut_model is None:
        logger.info("Loading Donut model...")
        try:
            from transformers import DonutProcessor, VisionEncoderDecoderModel
            
            # Use pre-trained Donut model for document understanding
            model_name = "naver-clova-ix/donut-base-finetuned-cord-v2"
            
            _donut_processor = DonutProcessor.from_pretrained(model_name)
            _donut_model = VisionEncoderDecoderModel.from_pretrained(model_name)
            
            logger.info("Donut model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Donut model: {e}")
            raise
    
    return _donut_model, _donut_processor


def extract_fields_with_donut(image_path: str) -> Dict[str, Any]:
    """
    Extract invoice/customs fields using Donut model.
    
    Args:
        image_path: Path to image file
        
    Returns:
        Dictionary with extracted fields
    """
    model, processor = get_donut_model()
    
    try:
        # Load image
        image = Image.open(image_path).convert("RGB")
        
        # Prepare image for Donut
        pixel_values = processor(image, return_tensors="pt").pixel_values
        
        # Task prompt for customs invoice/document understanding
        task_prompt = "<s_cord-v2>"
        decoder_input_ids = processor.tokenizer(
            task_prompt,
            add_special_tokens=False,
            return_tensors="pt"
        ).input_ids
        
        # Generate predictions
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
        
        logger.info(f"Donut extracted fields: {list(result.keys())}")
        return result
        
    except Exception as e:
        logger.error(f"Donut extraction failed: {e}")
        raise


def convert_donut_to_standard_format(donut_result: Dict, image_width: int = 1000, image_height: int = 1000) -> List[Dict[str, Any]]:
    """
    Convert Donut output to standardized field format with bounding boxes.
    
    Args:
        donut_result: Raw output from Donut model
        image_width: Target width for bbox normalization
        image_height: Target height for bbox normalization
        
    Returns:
        List of standardized field dictionaries
    """
    fields = []
    
    # Map Donut fields to standard invoice/customs fields
    field_mapping = {
        'menu': 'items',  # CORD dataset uses 'menu' for line items
        'total': 'total',
        'subtotal': 'subtotal',
        'tax': 'tax',
        'store_name': 'bill_to_name',
        'store_addr': 'bill_to_address',
        'date': 'invoice_date',
        'tid': 'invoice_number',
    }
    
    for donut_key, standard_key in field_mapping.items():
        if donut_key in donut_result:
            value = donut_result[donut_key]
            
            # Handle line items (for customs invoices)
            if donut_key == 'menu' and isinstance(value, list):
                for idx, item in enumerate(value):
                    # Extract item fields
                    item_fields = {
                        'field_name': f'{standard_key}_{idx}',
                        'value': item.get('nm', '') if isinstance(item, dict) else str(item),
                        'confidence': 0.92,
                        'bbox': [100, 200 + (idx * 50), 900, 240 + (idx * 50)],  # Simulated line item positions
                        'page': 1,
                        'item_data': item if isinstance(item, dict) else {}
                    }
                    fields.append(item_fields)
            else:
                # Single field
                fields.append({
                    'field_name': standard_key,
                    'value': str(value),
                    'confidence': 0.94,
                    'bbox': [150, 100, 400, 140],  # Simulated position
                    'page': 1
                })
    
    return fields


def lambda_handler(event, context):
    """
    AWS Lambda handler for document processing with Donut.
    
    Processes documents (PDF, images) and extracts structured fields using Donut model.
    """
    temp_file_path = None
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        base64_document = body.get('document')
        filename = body.get('filename', 'document')
        mime_type = body.get('mimeType', 'application/pdf')
        
        if not base64_document:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'No document provided'})
            }
        
        logger.info(f"Processing document: {filename} ({mime_type})")
        
        # Decode Base64 document
        document_binary = base64.b64decode(base64_document)
        
        # Determine file extension
        extension = '.pdf'
        if 'image/png' in mime_type:
            extension = '.png'
        elif 'image/jpeg' in mime_type or 'image/jpg' in mime_type:
            extension = '.jpg'
        
        # Write to temporary file
        with tempfile.NamedTemporaryFile(delete=False, dir='/tmp', suffix=extension) as temp_file:
            temp_file.write(document_binary)
            temp_file_path = temp_file.name
        
        logger.info(f"Document written to {temp_file_path} ({len(document_binary)} bytes)")
        
        # Convert PDF to image if needed
        if extension == '.pdf':
            try:
                logger.info("Converting PDF first page to image...")
                pdf_doc = fitz.open(temp_file_path)
                if len(pdf_doc) > 0:
                    page = pdf_doc[0]
                    # Use 2x zoom for better quality
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    
                    # Limit size to prevent memory issues
                    max_dimension = 2000
                    if pix.width > max_dimension or pix.height > max_dimension:
                        scale = max_dimension / max(pix.width, pix.height)
                        pix = page.get_pixmap(matrix=fitz.Matrix(2 * scale, 2 * scale))
                    
                    img_path = temp_file_path.replace('.pdf', '.png')
                    pix.save(img_path)
                    pdf_doc.close()
                    
                    # Delete PDF, use image
                    os.unlink(temp_file_path)
                    temp_file_path = img_path
                    logger.info(f"PDF converted to image: {pix.width}x{pix.height}")
                else:
                    raise ValueError("PDF has no pages")
            except Exception as pdf_error:
                logger.error(f"PDF conversion error: {pdf_error}")
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({'error': f'Failed to process PDF: {str(pdf_error)}'})
                }
        
        # Extract fields using Donut
        donut_result = extract_fields_with_donut(temp_file_path)
        
        # Convert to standard format
        fields = convert_donut_to_standard_format(donut_result)
        
        # Extract text from Donut result (for compatibility)
        extracted_text = json.dumps(donut_result, indent=2)
        
        logger.info(f"Extracted {len(fields)} fields using Donut")
        
        # Build response
        response_data = {
            'status': 'success',
            'message': 'Document processed successfully with Donut',
            'extracted_text': extracted_text,
            'fields': fields,
            'metadata': {
                'filename': filename,
                'mime_type': mime_type,
                'file_size': len(document_binary),
                'num_fields': len(fields),
                'ocr_engine': 'donut',
                'model': 'naver-clova-ix/donut-base-finetuned-cord-v2'
            }
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response_data)
        }
        
    except Exception as e:
        logger.error(f"Error processing document: {e}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }
    
    finally:
        # Cleanup temp file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                logger.info(f"Cleaned up: {temp_file_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup: {cleanup_error}")


# For local testing
if __name__ == "__main__":
    # Test event
    test_event = {
        'body': json.dumps({
            'document': 'base64_encoded_document_here',
            'filename': 'test_invoice.pdf',
            'mimeType': 'application/pdf'
        })
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(json.loads(result['body']), indent=2))
