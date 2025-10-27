# SchemaXtract - Intelligent Document Processing System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AWS SAM](https://img.shields.io/badge/AWS-SAM-orange)](https://aws.amazon.com/serverless/sam/)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-purple)](https://vitejs.dev/)
[![Python](https://img.shields.io/badge/Python-3.12-green)](https://www.python.org/)

An intelligent document processing (IDP) system powered by LayoutLMv3 for automated field extraction from invoices and documents, with interactive learning capabilities and strict GDPR compliance.

## 🌟 Features

- **AI-Powered Extraction**: LayoutLMv3 document understanding model for accurate field detection
- **GDPR Compliant**: No permanent storage of original documents - all processing in ephemeral storage
- **3-Service Architecture**:
  - AWS Lambda backend for document processing
  - Donut/LayoutLMv3 ML service for field extraction
  - React frontend for interactive annotation
- **Serverless Ready**: AWS SAM for Lambda deployment with local testing
- **Modern Frontend**: React + Vite with drag-and-drop annotations
- **Document Understanding**: Spatial+textual analysis using transformer models
- **Flexible Deployment**: Works in Codespaces, local dev, or cloud

## 🚀 Quick Start

### Prerequisites

- **Docker** (for SAM Local Lambda containers and ML service)
- **Node.js 18+** (for frontend)
- **Python 3.12** (pre-installed in devcontainer)
- **8GB RAM** recommended for ML model

### Option 1: Using GitHub Codespaces (⭐ Recommended)

1. Click the **"Code"** button on GitHub
2. Select **"Codespaces"** tab
3. Click **"Create codespace on main"**
4. Wait for automatic setup (5-8 minutes)
   - Container builds with all dependencies
   - Python packages installed
   - Frontend dependencies installed
5. Once ready, run services using VS Code Tasks:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P`)
   - Type **"Tasks: Run Task"**
   - Select **"Start All Services"**
6. Open the forwarded port 3000 in your browser

**First run downloads:**

- Lambda runtime images (~900MB)
- PyTorch + LayoutLMv3 model (~3.6GB)
- These are cached for subsequent runs

### Option 2: Local Development with Dev Containers

1. **Clone the repository**

   ```bash
   git clone https://github.com/Dwys97/schemaxtract.git
   cd schemaxtract
   ```

2. **Open in VS Code**

   ```bash
   code .
   ```

3. **Reopen in Container**

   - Press `Ctrl+Shift+P`
   - Select **"Dev Containers: Reopen in Container"**
   - Wait for container build and setup

4. **Start services** (same as Codespaces above)

5. **Install and run frontend** (in new terminal)

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001/process-document

## 📁 Project Structure

```
schemaxtract/
├── .devcontainer/          # Codespace/devcontainer configuration
│   ├── devcontainer.json
│   └── setup.sh
├── backend/                # AWS SAM Lambda backend
│   ├── src/
│   │   └── process_document/
│   │       └── app.py      # Lambda handler
│   ├── template.yaml       # SAM/CloudFormation template
│   └── requirements.txt    # Python dependencies
├── frontend/               # Vite/React frontend
│   ├── src/
│   │   ├── App.jsx         # Main React component
## 🏗️ Architecture

### 3-Service Architecture

```

┌─────────────────┐ ┌──────────────────┐ ┌─────────────────────┐
│ │ │ │ │ │
│ React Frontend │─────▶│ Lambda Backend │─────▶│ Donut ML Service │
│ (Port 3000) │ │ (Port 3001) │ │ (Port 3002) │
│ │ │ │ │ │
│ - Upload UI │ │ - PDF→Image │ │ - LayoutLMv3 Model │
│ - Annotations │ │ - SAM Local │ │ - Field Extraction │
│ - Vite + React │ │ - API Gateway │ │ - PyTorch + HF │
└─────────────────┘ └──────────────────┘ └─────────────────────┘

```

### Service Details

1. **Frontend (Vite + React)**
   - Document upload interface
   - Interactive bounding box annotations
   - Field review and correction
   - Modern UI with drag-and-drop

2. **Backend (AWS Lambda via SAM)**
   - PDF to image conversion (pdf2image + poppler)
   - API Gateway integration
   - Calls Donut service for field extraction
   - GDPR-compliant ephemeral processing

3. **Donut Service (Flask + LayoutLMv3)**
   - LayoutLMv3 transformer model
   - Document understanding (spatial + textual)
   - Field extraction with bounding boxes
   - Runs on CPU or GPU

## 📁 Project Structure

```

schemaxtract/
├── .devcontainer/
│ ├── devcontainer.json # Dev container config (Docker-in-Docker)
│ ├── Dockerfile # Python 3.12 + system dependencies
│ └── setup.sh # Post-create automation
├── .vscode/
│ └── tasks.json # VS Code tasks for starting services
├── backend/
│ ├── template.yaml # SAM/CloudFormation template
│ ├── samconfig.toml # SAM local dev settings
│ ├── requirements.txt # Lambda dependencies
│ └── src/
│ └── process_document/
│ ├── app.py # Lambda handler
│ └── requirements.txt
├── donut_service/
│ ├── main.py # Flask server with LayoutLMv3
│ ├── requirements.txt # PyTorch + Transformers
│ └── Dockerfile # ML service container
├── frontend/
│ ├── src/
│ │ ├── App.jsx # Main app component
│ │ ├── components/
│ │ │ ├── DocumentUploader.jsx
│ │ │ ├── DocumentViewerModal.jsx
│ │ │ └── AnnotationCanvas.jsx
│ │ └── main.jsx
│ ├── package.json
│ └── vite.config.js
├── START_HERE.md # Quick start (up-to-date)
├── DONUT_SERVICE_MIGRATION.md # Architecture details
└── README.md # This file

````

## 🔧 Development

### Using VS Code Tasks (Easiest)

Press `Ctrl+Shift+P` → `Tasks: Run Task` → Select:
- **Start All Services** - Starts all 3 services in parallel
- **Start Backend (SAM Local)** - Backend only (port 3001)
- **Start Frontend (Vite)** - Frontend only (port 3000)
- **Start Donut Service** - ML service only (port 3002)
- **Build Backend Only** - SAM build
- **Stop All Services** - Stop everything

### Manual Development

**Backend (AWS SAM Local):**
```bash
cd backend
sam build                  # Build Lambda function
sam local start-api --port 3001 --host 0.0.0.0
````

**Frontend (Vite):**

```bash
cd frontend
npm run dev -- --host 0.0.0.0
# Opens on http://localhost:3000
```

**Donut ML Service:**

```bash
cd donut_service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
# Runs on http://localhost:3002
```

### Test the Services

**Backend:**

```bash
curl -X POST http://localhost:3001/process-document \
  -H "Content-Type: application/json" \
  -d '{"document": "dGVzdA==", "filename": "test.pdf"}'
```

**Donut Service:**

```bash
curl http://localhost:3002/health
# Should return: {"status": "healthy"}
```

**Frontend:**
Open http://localhost:3000 in browser

## 🧪 Testing

### Quick Health Checks

```bash
# Check all dependencies
python3 --version  # Should be 3.12.x
node --version     # Should be v18.x
docker ps          # Should list running containers
sam --version      # Should be 1.145.x+

# Test Donut ML service
curl http://localhost:3002/health

# Test Backend
curl -X POST http://localhost:3001/process-document \
  -H "Content-Type: application/json" \
  -d '{"document": "dGVzdA==", "filename": "test.pdf"}'

# Test Frontend
curl http://localhost:3000
```

### Load Testing

First-time ML model loading takes ~30-60 seconds. Subsequent requests are fast.

See **START_HERE.md** and **DONUT_SERVICE_MIGRATION.md** for detailed information.

## 🔒 GDPR Compliance

This system is designed with GDPR compliance at its core:

- ✅ **No permanent document storage** - Original documents never saved to disk
- ✅ **10GB ephemeral storage** - All processing in `/tmp/` (cleared after execution)
- ✅ **Explicit file deletion** - Files removed immediately after processing
- ✅ **Audit logging** - All file operations logged for compliance
- ✅ **Anonymized training data** - Only coordinates and text stored, decoupled from images

## 🚢 Deployment

### Deploy to AWS

```bash
cd backend
sam build --use-container
sam deploy --guided
```

This will:

1. Build the Lambda container image
2. Push to Amazon ECR
3. Create Lambda function with 10GB ephemeral storage
4. Set up API Gateway
5. Configure CloudWatch Logs

### Environment Variables

Set these in the SAM template or AWS Console:

- `LOG_LEVEL`: Logging level (default: INFO)
- `PYTHONUNBUFFERED`: Set to 1 for real-time logs

## 📊 Performance

Current metrics (Phase 1 baseline):

| Metric            | Value   | Target   |
| ----------------- | ------- | -------- |
| Lambda Memory     | 2048 MB | 2048+ MB |
| Lambda Timeout    | 90s     | 90+ s    |
| Ephemeral Storage | 10 GB   | 10 GB    |
| Cold Start        | ~85ms   | <1s      |
| Warm Response     | ~42ms   | <100ms   |

## 🗺️ Roadmap

### Phase 1: Foundation ✅ COMPLETE

- [x] Dockerfile with Lambda runtime
- [x] SAM template with GDPR configuration
- [x] Basic Lambda handler
- [x] Frontend scaffolding
- [x] Local development setup

### Phase 2: OCR Integration 🚧 IN PROGRESS

- [ ] PebbleOCR integration
- [ ] OpenCV preprocessing
- [ ] PDF handling
- [ ] Real document testing

### Phase 3: LayoutML

- [ ] LayoutML model integration
- [ ] Field prediction
- [ ] Template learning endpoint
- [ ] S3 integration for training data

### Phase 4: Interactive UI

- [ ] PDF viewer component
- [ ] Annotation tools
- [ ] Field labeling interface
- [ ] Template management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- AWS Lambda team for serverless runtime
- PebbleOCR for OCR capabilities
- LayoutML for document understanding
- React and Vite communities

## 📞 Support

- 📖 Documentation: See [QUICK_START.md](QUICK_START.md)
- 🐛 Issues: [GitHub Issues](https://github.com/Dwys97/schemaxtract/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/Dwys97/schemaxtract/discussions)

## 🔗 Links

- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://reactjs.org/)
- [Docker Documentation](https://docs.docker.com/)
