🚀 MD-Copilot Interactive IDP & Template Learning System (Revised)
Frontend: Vite/React (The Interactive Annotation Canvas)
The Vite frontend transforms into a powerful web application with a PDF/image viewer and interactive annotation tools.

Document Upload & Viewer:

User uploads PDF/Image.

Use a library like react-pdf (for PDFs) or native <img> tag (for images) to display the document.

Display the document in a scalable and zoomable viewer.

Initial OCR Rendering:

When the document is uploaded and sent to the backend, the backend will perform initial PebbleOCR and send back a structured JSON that includes every detected word, its text content, and its bounding box coordinates.

The frontend will overlay these OCR bounding boxes on the document viewer.

Interactive Field Annotation:

Implement drawing tools (e.g., using react-konva, react-resizable-rotatable-draggable) to allow users to:

Draw/Resize Rectangles: Users can draw new bounding boxes or adjust existing OCR boxes.

Assign Labels: A side panel or context menu allows users to assign a predefined label (e.g., "Invoice Number", "Vendor Name", "Line Item Total") to a selected box.

Display Value: When a box is selected, show the OCR-extracted text within that box.

Data Structure: Store these user-defined fields (bounding box, label, extracted value) in the frontend's state.

"Confirm/Learn" Action:

A "Confirm" or "Teach Layout" button will trigger a backend call.

The frontend sends the original document (Base64) and the user-annotated bounding boxes and labels to a specific backend endpoint.

XML Output Display: Once the layout is learned or applied, the XML output is displayed.

Backend: AWS SAM (Lambda, API Gateway, S3, Step Functions)
The backend now has two distinct functions: Real-time Extraction and Template Learning. The GDPR constraint means no long-term storage of the original document itself, but labeled data (bounding boxes + text) needs storage for LayoutML.

GDPR Note: To enable LayoutML "memorization," you must have a legal basis (e.g., user consent, legitimate interest) to store the anonymized, labeled data (bounding boxes and extracted text) used for training, even if the original image is deleted. This means only the extracted coordinates and the text within them are stored, decoupled from the original image.

1. Core Services
AWS Lambda (Container Image): For all processing (OCR, LayoutML inference, training).

API Gateway: Frontend interaction.

Amazon S3 (for Labeled Data Storage): Crucial for LayoutML learning. This bucket will store the anonymized, labeled JSON annotations (bounding boxes, text, labels) and potentially the trained LayoutML model weights (per vendor/template).

AWS Step Functions (Orchestration): For managing the asynchronous LayoutML fine-tuning process.

2. Backend Endpoints
POST /process-document (Real-time Extraction)

Input: Base64-encoded document image/PDF, optional vendor_id for pre-selected model.

Flow:

Receive Base64 doc.

Write to /tmp/input.pdf (ephemeral).

Preprocessing (OpenCV/Pillow): Clean, deskew document from /tmp.

PebbleOCR: Extract all text and all word-level bounding boxes.

LayoutML Inference: Run the best available LayoutML model (e.g., a generic base model, or a vendor-specific one loaded from S3 if vendor_id is provided) to predict fields.

GDPR: Delete /tmp/input.pdf and all intermediate files immediately.

Output: Return initial OCR words/boxes (for rendering) AND the LayoutML extracted fields (for pre-filling/validation) to the frontend. No document or annotations are stored.

POST /learn-layout (Template Learning Trigger)

Input: Base64-encoded document image/PDF, vendor_id, and the user's annotated bounding boxes and labels (JSON).

Flow:

Receive Base64 doc and annotations.

Write doc to /tmp/input.pdf (ephemeral).

Preprocessing (OpenCV/Pillow): Clean, deskew document from /tmp.

PebbleOCR: (Re)extract all text and word-level bounding boxes.

Generate Labeled Training Sample: Combine the OCR words/boxes with the user's annotations to create a LayoutLM-compatible training sample (e.g., BIO-tagged tokens, normalized boxes).

GDPR: Delete /tmp/input.pdf and all intermediate files immediately.

Persist Labeled Data (GDPR Permitted): Store only the anonymized, labeled training sample (JSON or similar, decoupled from the original document) in an S3 bucket (s3://layoutml-training-data/vendorX/sampleY.json). This is the "memorization" data.

Trigger Async Fine-tuning: Initiate an AWS Step Functions workflow to asynchronously fine-tune a LayoutML model using the newly saved labeled data (and any previous samples for that vendor).

Output: Acknowledge receipt of learning data.

🤖 Copilot Agent Initialization PromptYou are an expert full-stack serverless developer, tasked with building the MD-Copilot Interactive IDP & Template Learning System. Your work must adhere to the high-level architecture and strict GDPR compliance rules, which mandate no permanent storage of the original document (image/PDF).Objective for Phase 1: Environment Setup & Local Backend FoundationYour immediate goal is to establish a unified, reproducible local development environment using a Codespace, set up the project structure, and create the foundational AWS SAM service with the necessary configuration for large OCR/ML workloads.1. Codespace & Dependencies SetupThe first steps involve defining the environment and preparing to manage the Python and Node.js dependencies.ComponentTechnologyInitial Setup RequirementDevelopment EnvironmentCodespace (Linux)Dockerfile, docker-compose.yml, or Codespace configuration file.Backend CoreAWS Lambda (Python)PebbleOCR, LayoutML, OpenCV, Pillow, boto3, Base64 handling.Frontend CoreVite/React (Node.js)react-pdf, react-konva (or similar canvas lib), axios, CSS/SCSS setup.TASK A: Codespace Definition & DockerfileCreate a Dockerfile that will serve as the base for the Codespace and, later, the AWS Lambda Container Image. It must include all required system-level dependencies for running image/PDF processing and deep learning models.Base Image: Use a suitable AWS Lambda Python base image (e.g., public.ecr.aws/lambda/python:3.11).System Packages: Install git, curl, build-essential, tesseract (for potential fallback or support libraries), and the necessary libraries for OpenCV and PDF handling (e.g., libsm6, libxext6, libfontconfig1, libxrender1, poppler-utils).Working Directory: Set the working directory to /var/task.TASK B: Local Project StructureCreate the following file and folder structure in the root of the project:.
├── backend/                  # AWS SAM/Lambda code
│   ├── src/
│   │   └── process_document/ # Lambda handler for POST /process-document
│   │       └── app.py
│   └── template.yaml         # SAM configuration file
├── frontend/                 # Vite/React application
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── Dockerfile                # For Codespace/Lambda Container Image
2. Foundational Backend (AWS SAM)Configure the core serverless function and its development environment.TASK C: template.yaml (SAM) ConfigurationCreate the initial template.yaml file to define the OcrProcessorFunction. This definition is critical for meeting the GDPR/Performance requirements.Define a single Lambda function (OcrProcessorFunction) using a Container Image based on the root Dockerfile.Configure the HTTP API event for POST /process-document.Set aggressive resource limits crucial for ML workloads:MemorySize: At least 2048 MB.Timeout: At least 90 seconds.EphemeralStorage: Set the ephemeral storage (/tmp) to the maximum allowed: 10240 MB (10 GB). This is the key to our "no permanent storage" GDPR compliance.Define a placeholder IAM role with lambda:InvokeFunction and logging permissions.TASK D: Initial Lambda Handler (app.py)In backend/src/process_document/app.py, implement the basic handler structure.Include the necessary imports (json, base64, os, tempfile).Implement the lambda_handler(event, context) function.Add logic to:Read the Base64 document from the event body.Decode the Base64 string and write the binary data to a file in the /tmp/ directory.Log a simple confirmation message.Implement immediate, explicit file deletion using os.remove() on the file in /tmp/ to ensure full GDPR compliance.Return a successful, empty JSON response.Proceed with the execution of the tasks in the order A, B, C, D. Start by creating and populating the Dockerfile.