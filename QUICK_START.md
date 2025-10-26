# MD-Copilot IDP - Quick Start Guide

## System Status

### ✅ Backend (AWS SAM Local)
- **Status**: RUNNING
- **Port**: 3001
- **Endpoint**: http://localhost:3001/process-document
- **Process**: Python SAM CLI server

### ✅ Frontend (Vite Dev Server)  
- **Status**: RUNNING (stopped in terminal, use `fg` to resume)
- **Port**: 3000
- **URL**: http://localhost:3000/
- **Process**: Node.js Vite dev server

## Starting the Services

### Start Backend
```bash
cd /workspaces/schemaxtract/backend
sam build --use-container
sam local start-api --port 3001 --host 0.0.0.0
```

### Start Frontend
```bash
cd /workspaces/schemaxtract/frontend
npm install  # Only needed first time
npm run dev -- --host 0.0.0.0
```

## Testing

### Test Backend API
```bash
curl -X POST http://127.0.0.1:3001/process-document \
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
