# Base image: AWS Lambda Python 3.11
FROM public.ecr.aws/lambda/python:3.11

# Install system-level dependencies for PDF processing and building Python packages
RUN yum update -y && \
    yum install -y \
    git \
    curl \
    gcc \
    gcc-c++ \
    make \
    cmake3 \
    pkgconfig \
    poppler-utils \
    && yum clean all

# Create symlink for cmake (cmake3 on Amazon Linux)
RUN ln -sf /usr/bin/cmake3 /usr/bin/cmake

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

# Install Python dependencies (no PyTorch needed - Donut is separate service)
RUN pip install --no-cache-dir -r requirements.txt

# Copy Lambda function code
COPY backend/src/process_document/ .

# Set the Lambda handler
CMD ["app.lambda_handler"]
