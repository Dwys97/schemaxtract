# SchemaXtract - Quick Start Guide

## 🚀 Starting Services

### Recommended: VS Code Tasks

The easiest way to start all services in the devcontainer:

1. **Press** `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. **Type**: `Tasks: Run Task`
3. **Select**: `Start All Services`

This starts all 3 services in parallel:
- ✅ Backend (SAM Local) - Port 3001
- ✅ Frontend (Vite) - Port 3000  
- ✅ Donut Service (LayoutLMv3) - Port 3002

### Individual Service Tasks

- `Start Backend (SAM Local)` - Backend only
- `Start Frontend (Vite)` - Frontend only
- `Start Donut Service` - ML service only
- `Build Backend Only` - Just build SAM
- `Test Backend API` - Quick API test
- `Stop All Services` - Stop everything

## 📊 System Status

Once running, you should see:

### ✅ Backend (AWS SAM Local)
- **Status**: RUNNING
- **Port**: 3001
- **Endpoint**: http://localhost:3001/process-document
- **Function**: PDF processing and API gateway

### ✅ Frontend (Vite Dev Server)  
- **Status**: RUNNING
- **Port**: 3000
- **URL**: http://localhost:3000
- **Function**: React UI for document upload and annotation

### ✅ Donut Service (LayoutLMv3)
- **Status**: RUNNING
- **Port**: 3002
- **Endpoint**: http://localhost:3002/health
- **Function**: AI field extraction using transformer model

## 🔧 Manual Commands (Alternative)

If you prefer terminal commands over VS Code tasks:

### Start Backend (SAM Local)
```bash
cd /workspaces/schemaxtract/backend
sam build
sam local start-api --port 3001 --host 0.0.0.0 --skip-pull-image
```

### Start Frontend (Vite)
```bash
cd /workspaces/schemaxtract/frontend
npm install  # Only needed first time
npm run dev -- --host 0.0.0.0
```

### Start Donut Service (LayoutLMv3)
```bash
cd /workspaces/schemaxtract/donut_service
python3 -m venv venv  # Only needed first time
source venv/bin/activate
pip install -r requirements.txt  # Only needed first time
python main.py
```

**Note**: The Donut service takes 5-10 minutes to install dependencies on first run (downloads PyTorch + Transformers ~3.6GB). Subsequent starts are fast.

## 🧪 Testing the Services

### Test Backend API
```bash
# Simple health check
curl -X POST http://127.0.0.1:3001/process-document \
  -H "Content-Type: application/json" \
  -d '{"document": "dGVzdA==", "filename": "test.pdf"}'

# Expected response:
# {"message": "Document processed", "fields": {...}}
```

### Test Donut ML Service
```bash
# Health check
curl http://localhost:3002/health

# Expected response:
# {"status": "healthy", "model": "loaded"}
```

### Test Frontend
Simply open http://localhost:3000 in your browser.

## ⚙️ Configuration

### Environment Variables

Backend (.env or environment):
```bash
DONUT_SERVICE_URL=http://172.17.0.1:3002  # For Docker networking
LOG_LEVEL=INFO
```

### Ports

- **3000**: Frontend (React + Vite)
- **3001**: Backend (AWS SAM Local / Lambda)
- **3002**: Donut Service (LayoutLMv3 ML model)

All ports are automatically forwarded in Codespaces and devcontainers.

## 🐛 Troubleshooting

### "No module named 'app'" Error
- Ensure container was rebuilt with latest changes
- Check that docker-in-docker is enabled in devcontainer.json
- Restart container: `Ctrl+Shift+P` → `Dev Containers: Rebuild Container`

### Docker Permission Denied
- Fixed by docker-in-docker feature (no manual socket permissions needed)
- Ensure `--privileged` flag in devcontainer runArgs

### Donut Service Taking Long to Start
- First time: Downloads PyTorch + Transformers (~3.6GB) - takes 5-10 min
- Model loading: First request loads LayoutLMv3 - takes 30-60 sec
- Subsequent runs are fast

### SAM Build Slow
- First time: Downloads Lambda runtime images (~900MB)
- Use `sam build` without `--use-container` for faster builds (uses local pip)
- Images are cached for subsequent runs

### Frontend Not Loading
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev -- --host 0.0.0.0
```
  -H "Content-Type: application/json" \
  -d '{"document": "dGVzdCBkb2N1bWVudA=="}'
```

Expected response:
```json
{
    "message": "Document processed successfully",
    "status": "success"
}
```

### Test Frontend
Open browser: http://localhost:3000/

## Project Structure

```
schemaxtract/
├── Dockerfile                    # Lambda container image definition
├── .gitignore                   # Git ignore patterns
├── TEST_RESULTS.md              # Comprehensive test results
├── QUICK_START.md               # This file
├── backend/
│   ├── requirements.txt         # Python dependencies
│   ├── template.yaml            # SAM/CloudFormation template
│   └── src/
│       └── process_document/
│           └── app.py           # Lambda handler
└── frontend/
    ├── package.json             # Node.js dependencies
    ├── vite.config.js           # Vite configuration
    ├── index.html               # HTML entry point
    └── src/
        ├── main.jsx             # React entry point
        ├── App.jsx              # Main React component
        ├── App.css              # App styles
        └── index.css            # Global styles
```

## Key Features

### GDPR Compliance ✅
- No permanent storage of original documents
- 10 GB ephemeral storage for processing
- Explicit file deletion after processing
- Verified in Lambda logs

### Performance ⚡
- 2048 MB Lambda memory
- 90s timeout
- ~85ms cold start
- ~42ms warm response

## Next Development Steps

1. **Phase 2: OCR Integration**
   - Implement PebbleOCR for text extraction
   - Add preprocessing with OpenCV
   - Test with real PDF documents

2. **Phase 3: LayoutML Integration**
   - Integrate LayoutML model for field prediction
   - Implement template learning

3. **Phase 4: Interactive Frontend**
   - Add PDF viewer
   - Create annotation tools
   - Implement field labeling UI

## Deployment to AWS

When ready for production:

```bash
cd backend
sam build --use-container
sam deploy --guided
```

This will:
- Push container image to ECR
- Create Lambda function
- Set up API Gateway
- Configure CloudWatch Logs
- Apply IAM permissions

## Troubleshooting

### SAM Build Issues
- Ensure Docker is running
- Check `backend/requirements.txt` for compatible versions
- Use `--use-container` flag for consistent builds

### Frontend Issues
- Run `npm install` if dependencies missing
- Check Vite config proxy settings
- Ensure backend is running on port 3001

### GDPR Verification
Check Lambda logs for file deletion:
```bash
tail -f /tmp/sam-local.log | grep GDPR
```

## Support

For issues or questions, refer to:
- `TEST_RESULTS.md` - Comprehensive test documentation
- `copilot.instructions.md` - Project scope and architecture
- AWS SAM documentation
- Vite documentation
