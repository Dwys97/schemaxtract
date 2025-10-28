import json
import base64
import os
import tempfile
import logging
from typing import Dict, Any
from pdf2image import convert_from_path
import requests

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Donut service configuration
DONUT_SERVICE_URL = os.environ.get("DONUT_SERVICE_URL", "http://localhost:3002")


def call_donut_service(
    document_data: bytes, file_format: str, custom_fields: list = None
) -> Dict[str, Any]:
    """
    Call external Donut service for field extraction.

    Args:
        document_data: Raw document bytes
        file_format: Document format (png, jpg, pdf)
        custom_fields: Optional list of custom field definitions from user

    Returns:
        Dictionary with extracted fields
    """
    try:
        # Encode document to base64
        doc_base64 = base64.b64encode(document_data).decode("utf-8")

        # Prepare request payload
        payload = {"image": doc_base64, "format": file_format}

        # Add custom fields if provided
        if custom_fields:
            payload["custom_fields"] = custom_fields
            logger.info(f"Using {len(custom_fields)} custom field definitions")
            logger.info(f"Payload custom_fields: {json.dumps(custom_fields, indent=2)}")
        else:
            logger.info("No custom_fields to add to payload")

        logger.info(f"Payload keys being sent to Donut: {list(payload.keys())}")

        # Call Donut service
        logger.info(f"Calling Donut service at {DONUT_SERVICE_URL}/extract")
        response = requests.post(
            f"{DONUT_SERVICE_URL}/extract",
            json=payload,
            timeout=180,  # DocVQA + OCR can take 60-90 seconds
        )

        if response.status_code != 200:
            raise Exception(
                f"Donut service returned {response.status_code}: {response.text}"
            )

        result = response.json()

        if result.get("status") != "success":
            raise Exception(
                f"Donut extraction failed: {result.get('error', 'Unknown error')}"
            )

        logger.info(f"Donut service extracted {len(result.get('fields', []))} fields")
        return result

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to connect to Donut service: {e}")
        raise Exception(f"Donut service unavailable: {e}")
    except Exception as e:
        logger.error(f"Donut service call failed: {e}")
        raise


def lambda_handler(event, context):
    """
    AWS Lambda handler for document processing with Donut.

    Processes documents (PDF, images) and extracts structured fields using Donut service.
    Supports custom field definitions from user.
    """
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        base64_document = body.get("document")
        filename = body.get("filename", "document")
        mime_type = body.get("mimeType", "application/pdf")
        custom_fields = body.get("customFields")  # Optional custom field definitions

        if not base64_document:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"error": "No document provided"}),
            }

        logger.info(f"Processing document: {filename} ({mime_type})")
        if custom_fields:
            logger.info(f"Using {len(custom_fields)} custom field definitions")
            logger.info(f"Custom fields: {json.dumps(custom_fields, indent=2)}")
        else:
            logger.info("No custom fields provided - using defaults")

        # Decode Base64 document
        document_binary = base64.b64decode(base64_document)

        # Determine file format
        file_format = "pdf"
        if "image/png" in mime_type:
            file_format = "png"
        elif "image/jpeg" in mime_type or "image/jpg" in mime_type:
            file_format = "jpg"

        logger.info(
            f"Document size: {len(document_binary)} bytes, format: {file_format}"
        )

        # Call Donut service for field extraction (handles PDF conversion internally)
        donut_result = call_donut_service(document_binary, file_format, custom_fields)

        # Extract fields and metadata from service response
        fields = donut_result.get("fields", [])
        raw_output = donut_result.get("raw_output", {})
        image_size = donut_result.get("image_size", {})

        # Extract text from raw output (for compatibility)
        extracted_text = json.dumps(raw_output, indent=2)

        logger.info(f"Extracted {len(fields)} fields using Donut service")

        # Build response
        response_data = {
            "status": "success",
            "message": "Document processed successfully with Donut",
            "extracted_text": extracted_text,
            "fields": fields,
            "metadata": {
                "filename": filename,
                "mime_type": mime_type,
                "file_size": len(document_binary),
                "num_fields": len(fields),
                "ocr_engine": "donut",
                "model": "naver-clova-ix/donut-base-finetuned-cord-v2",
            },
        }

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps(response_data),
        }

    except Exception as e:
        logger.error(f"Error processing document: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": "Internal server error", "message": str(e)}),
        }


def lambda_handler_batch_extract(event, context):
    """
    AWS Lambda handler for batch field extraction from a large bbox.
    Splits a single bbox into multiple field instances.
    """
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        base64_document = body.get("document")
        bbox = body.get("bbox")  # Normalized [0-1000] coordinates
        field_name = body.get("fieldName")
        mime_type = body.get("mimeType", "application/pdf")

        if not base64_document or not bbox or not field_name:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps(
                    {"error": "Missing required parameters: document, bbox, fieldName"}
                ),
            }

        logger.info(f"Batch extracting field: {field_name} from bbox: {bbox}")

        # Decode Base64 document
        document_binary = base64.b64decode(base64_document)

        # Determine file format
        file_format = "pdf"
        if "image/png" in mime_type:
            file_format = "png"
        elif "image/jpeg" in mime_type or "image/jpg" in mime_type:
            file_format = "jpg"

        # Call Donut service with batch extraction request
        doc_base64 = base64.b64encode(document_binary).decode("utf-8")

        logger.info(f"Calling Donut service for batch extraction")
        response = requests.post(
            f"{DONUT_SERVICE_URL}/extract-batch",
            json={
                "image": doc_base64,
                "format": file_format,
                "bbox": bbox,
                "field_name": field_name,
            },
            timeout=180,
        )

        if response.status_code != 200:
            raise Exception(
                f"Donut batch extraction returned {response.status_code}: {response.text}"
            )

        result = response.json()

        if result.get("status") != "success":
            raise Exception(
                f"Donut batch extraction failed: {result.get('error', 'Unknown error')}"
            )

        fields = result.get("fields", [])
        logger.info(f"Batch extraction found {len(fields)} instances")

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps(
                {
                    "status": "success",
                    "fields": fields,
                    "message": f"Extracted {len(fields)} instances of {field_name}",
                }
            ),
        }

    except Exception as e:
        logger.error(f"Error in batch extraction: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": "Internal server error", "message": str(e)}),
        }


# For local testing
if __name__ == "__main__":
    # Test event
    test_event = {
        "body": json.dumps(
            {
                "document": "base64_encoded_document_here",
                "filename": "test_invoice.pdf",
                "mimeType": "application/pdf",
            }
        )
    }

    result = lambda_handler(test_event, None)
    print(json.dumps(json.loads(result["body"]), indent=2))
