# SchemaXtract - Quick Start (3-Service Architecture)

## ✅ Build Completed Successfully!

Backend Lambda build: **30 seconds** ✨  
Donut service installed: **CPU-only PyTorch** ✨

## Start All Services

```bash
./start.sh
```

Or manually:

```bash
# Terminal 1 - Donut Service (port 3002)
cd donut_service
source venv/bin/activate
python main.py

# Terminal 2 - Backend (port 3001)
cd backend
sam local start-api --port 3001 --host 0.0.0.0

# Terminal 3 - Frontend (port 3000)
cd frontend
npm run dev -- --host 0.0.0.0
```

## Service URLs

- 🎨 **Frontend**: http://localhost:3000
- ⚡ **Backend**: http://localhost:3001
- 🤖 **Donut**: http://localhost:3002

## Test Commands

```bash
# Health check Donut
curl http://localhost:3002/health

# Test backend
curl -X POST http://localhost:3001/process-document \
  -H "Content-Type: application/json" \
  -d '{"document": "dGVzdA==", "filename": "test.pdf"}'
```

## Notes

- **Donut model loads on first request** (~30-60 seconds)
- Backend is already built (`.aws-sam/build/`)
- All dependencies installed

## Next Steps

1. Open http://localhost:3000
2. Upload a PDF or image
3. Watch Donut extract fields!

See `DONUT_SERVICE_MIGRATION.md` for architecture details.
