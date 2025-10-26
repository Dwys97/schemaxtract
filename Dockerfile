# Base image: AWS Lambda Python 3.11
FROM public.ecr.aws/lambda/python:3.11

# Install system-level dependencies for PDF processing
RUN yum update -y && \
    yum install -y \
    git \
    curl \
    gcc \
    gcc-c++ \
    make \
    poppler-utils \
    && yum clean all

# Install additional libraries for image processing
RUN yum install -y \
    libSM \
    libXext \
    libXrender \
    libgomp \
    fontconfig \
    && yum clean all

# Set working directory (standard for AWS Lambda)
WORKDIR /var/task

# Copy requirements file for Python dependencies
COPY backend/requirements.txt .

# Install PyTorch CPU-only (lightweight version for Lambda)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install other Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Lambda function code
COPY backend/src/process_document/ .

# Set the Lambda handler
CMD ["app.lambda_handler"]
