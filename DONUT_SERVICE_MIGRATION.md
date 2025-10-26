# 3-Service Architecture Migration Complete ✅

## Architecture Overview

SchemaXtract now uses a **3-service architecture** for better separation of concerns:

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│  Frontend   │─────▶│   Backend    │─────▶│    Donut     │
│  (Vite)     │      │  (SAM/Lambda)│      │   Service    │
│  Port 3000  │      │  Port 3001   │      │  Port 3002   │
└─────────────┘      └──────────────┘      └──────────────┘
     React               Python                  Flask
   UI/Upload          PDF Convert            ML Inference
                      Field Proxy           Document OCR
```

## Services

### 1. Frontend (Port 3000)
- **Tech**: React 18 + Vite
- **Features**: Document upload, annotation canvas, document list
- **Files**: `frontend/`

### 2. Backend (Port 3001)
- **Tech**: AWS Lambda (Python 3.11) via SAM Local
- **Features**: PDF→Image conversion, proxy to Donut service
- **Files**: `backend/`
- **Dependencies**: Lightweight (boto3, Pillow, pdf2image, requests)
- **Build Time**: ~30 seconds (vs 10+ minutes before)

### 3. Donut Service (Port 3002)
- **Tech**: Flask + Hugging Face Transformers
- **Model**: `naver-clova-ix/donut-base-finetuned-cord-v2`
- **Features**: End-to-end document field extraction
- **Files**: `donut_service/`
- **Note**: Model loads on first request (~30-60s)

## Why Separate Donut Service?

**Problem Solved:**
- Lambda container build was failing due to:
  - `sentencepiece` requiring C++ compilation (cmake, old g++ 7.3.1)
  - `PyMuPDF` compiling from source (10+ minutes)
  - `PyTorch` large download (~200MB CPU-only)
  
**Solution Benefits:**
1. ✅ Fast Lambda builds (~30s vs 10+ min)
2. ✅ No compilation errors in Lambda container
3. ✅ Donut service can use latest Python/libraries
4. ✅ Easy to swap ML models without rebuilding Lambda
5. ✅ Can scale Donut service independently

## Quick Start

### Option 1: Use Start Script (Recommended)
```bash
./start.sh
```

### Option 2: Use Makefile
```bash
# Install all dependencies
make install

# Start all 3 services
make start-all

# Or start individually:
make start-backend    # Port 3001
make start-donut      # Port 3002
make start-frontend   # Port 3000
```

### Option 3: VS Code Tasks
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: `Tasks: Run Task`
3. Select: `Start All Services`

## Service URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/process-document
- **Donut Service**: http://localhost:3002/extract
- **Donut Health**: http://localhost:3002/health

## Testing

### Test Backend Only (Simulation Mode)
```bash
curl -X POST http://localhost:3001/process-document \
  -H "Content-Type: application/json" \
  -d '{"document": "dGVzdA==", "filename": "test.pdf"}'
```

### Test Donut Service
```bash
curl http://localhost:3002/health
```

### Test End-to-End
1. Start all services: `./start.sh`
2. Open http://localhost:3000
3. Upload a PDF/image
4. Watch fields appear with Donut extraction

## Development Workflow

### Backend Changes
```bash
cd backend
# Edit src/process_document/app.py
sam build --use-container  # Fast build
sam local start-api --port 3001
```

### Donut Service Changes
```bash
cd donut_service
source venv/bin/activate
# Edit main.py
python main.py  # Instant restart
```

### Frontend Changes
```bash
cd frontend
# Edit src/components/*.jsx
# Vite hot-reloads automatically
```

## Environment Variables

### Backend
- `DONUT_SERVICE_URL` - Donut service endpoint (default: `http://localhost:3002`)

### Donut Service
- `PORT` - Service port (default: `3002`)

## Troubleshooting

### Donut Service Won't Start
```bash
cd donut_service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Backend Build Fails
```bash
cd backend
sam build --use-container --debug
```

### Port Already in Use
```bash
# Kill processes on ports 3000-3002
lsof -ti:3000,3001,3002 | xargs kill -9
```

## Files Changed

### New Files
- ✨ `donut_service/main.py` - Flask service with Donut model
- ✨ `donut_service/requirements.txt` - ML dependencies
- ✨ `donut_service/Dockerfile` - Donut container config

### Modified Files
- 📝 `backend/requirements.txt` - Removed heavy deps (torch, transformers, sentencepiece)
- 📝 `backend/src/process_document/app.py` - Calls Donut service via HTTP
- 📝 `Dockerfile` - Removed PyTorch installation
- 📝 `start.sh` - Starts 3 services
- 📝 `Makefile` - Added donut targets
- 📝 `.vscode/tasks.json` - Added Donut service task

## Next Steps

1. ✅ Backend builds successfully (lightweight)
2. 🔄 Install Donut service dependencies: `cd donut_service && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
3. 🔄 Test all services: `./start.sh`
4. 🔄 Upload test document via frontend
5. 🚀 Deploy to production (Lambda + EC2/ECS for Donut)

## Production Deployment Notes

- **Backend**: Deploy to AWS Lambda via `sam deploy`
- **Frontend**: Deploy to S3 + CloudFront
- **Donut Service**: Deploy to:
  - EC2 with GPU (for faster inference)
  - ECS/Fargate (containerized)
  - Lambda (if model size <10GB unzipped)
  - Or use managed service like AWS SageMaker

## Success Metrics

- ⚡ Backend build: **30 seconds** (was 10+ minutes with failures)
- ✅ No compilation errors
- 🎯 Clean separation of concerns
- 🔄 Easy to swap/upgrade ML models
- 📦 Lightweight Lambda package
