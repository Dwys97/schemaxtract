import json
import base64
import os
import tempfile
import logging
from typing import List, Dict, Any
from PIL import Image
from pdf2image import convert_from_path
import requests

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Donut service configuration
DONUT_SERVICE_URL = os.environ.get('DONUT_SERVICE_URL', 'http://localhost:3002')


def call_donut_service(image_path: str) -> Dict[str, Any]:
    """
    Call external Donut service for field extraction.
    
    Args:
        image_path: Path to image file
        
    Returns:
        Dictionary with extracted fields
    """
    try:
        # Read image and encode to base64
        with open(image_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        
        # Determine format
        ext = os.path.splitext(image_path)[1].lower().lstrip('.')
        if ext not in ['png', 'jpg', 'jpeg']:
            ext = 'png'
        
        # Call Donut service
        logger.info(f"Calling Donut service at {DONUT_SERVICE_URL}/extract")
        response = requests.post(
            f"{DONUT_SERVICE_URL}/extract",
            json={
                'image': image_data,
                'format': ext
            },
            timeout=60  # Donut inference can take time
        )
        
        if response.status_code != 200:
            raise Exception(f"Donut service returned {response.status_code}: {response.text}")
        
        result = response.json()
        
        if result.get('status') != 'success':
            raise Exception(f"Donut extraction failed: {result.get('error', 'Unknown error')}")
        
        logger.info(f"Donut service extracted {len(result.get('fields', []))} fields")
        return result
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to connect to Donut service: {e}")
        raise Exception(f"Donut service unavailable: {e}")
    except Exception as e:
        logger.error(f"Donut service call failed: {e}")
        raise
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
                # Convert PDF to images using pdf2image (poppler-utils)
                images = convert_from_path(temp_file_path, first_page=1, last_page=1, dpi=200)
                
                if images:
                    # Save first page as PNG
                    img_path = temp_file_path.replace('.pdf', '.png')
                    images[0].save(img_path, 'PNG')
                    
                    # Delete PDF, use image
                    os.unlink(temp_file_path)
                    temp_file_path = img_path
                    logger.info(f"PDF converted to image: {images[0].width}x{images[0].height}")
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
        
        # Call Donut service for field extraction
        donut_result = call_donut_service(temp_file_path)
        
        # Extract fields and metadata from service response
        fields = donut_result.get('fields', [])
        raw_output = donut_result.get('raw_output', {})
        image_size = donut_result.get('image_size', {})
        
        # Extract text from raw output (for compatibility)
        extracted_text = json.dumps(raw_output, indent=2)
        
        logger.info(f"Extracted {len(fields)} fields using Donut service")
        
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
