# Base image: AWS Lambda Python 3.11
FROM public.ecr.aws/lambda/python:3.11

# Install system-level dependencies for OCR, PDF processing, and ML workloads
RUN yum update -y && \
    yum install -y \
    git \
    curl \
    gcc \
    gcc-c++ \
    make \
    tesseract \
    tesseract-langpack-eng \
    poppler-utils \
    && yum clean all

# Install additional libraries for OpenCV and image processing
RUN yum install -y \
    libSM \
    libXext \
    libXrender \
    libgomp \
    libglib2.0-0 \
    fontconfig \
    && yum clean all

# Set working directory (standard for AWS Lambda)
WORKDIR /var/task

# Copy requirements file for Python dependencies
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Lambda function code
COPY backend/src/process_document/ .

# Set the Lambda handler
CMD ["app.lambda_handler"]
