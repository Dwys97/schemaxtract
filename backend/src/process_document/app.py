import json
import base64
import os
import tempfile
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """
    Lambda handler for processing documents with OCR.
    Implements strict GDPR compliance by deleting all files from /tmp/ after processing.
    
    Args:
        event: API Gateway event containing Base64-encoded document
        context: Lambda context object
        
    Returns:
        API Gateway response with status and message
    """
    temp_file_path = None
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        base64_document = body.get('document')
        
        if not base64_document:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'No document provided'})
            }
        
        logger.info("Received document for processing")
        
        # Decode Base64 document
        document_binary = base64.b64decode(base64_document)
        
        # Write to temporary file in /tmp/ (ephemeral storage)
        with tempfile.NamedTemporaryFile(delete=False, dir='/tmp', suffix='.pdf') as temp_file:
            temp_file.write(document_binary)
            temp_file_path = temp_file.name
        
        logger.info(f"Document written to {temp_file_path} ({len(document_binary)} bytes)")
        
        # TODO: Future implementation will include:
        # - Preprocessing (OpenCV/Pillow)
        # - PebbleOCR extraction
        # - LayoutML inference
        
        # GDPR Compliance: Explicitly delete the temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            logger.info(f"GDPR: Deleted temporary file {temp_file_path}")
            temp_file_path = None
        
        # Return success response
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'message': 'Document processed successfully',
                'status': 'success'
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing document: {str(e)}")
        
        # GDPR Compliance: Ensure cleanup even on error
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logger.info(f"GDPR: Deleted temporary file {temp_file_path} after error")
            except Exception as cleanup_error:
                logger.error(f"Failed to delete temporary file: {str(cleanup_error)}")
        
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }
