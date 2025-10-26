#!/bin/bash

# SchemaXtract Startup Script
# Starts all required services for development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     SchemaXtract Development Startup     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
echo ""

# Check if services are already running
if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠️  Port 3002 already in use (Tesseract OCR service)${NC}"
    read -p "Kill existing process? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pkill -f "python.*main.py" || true
        sleep 2
    else
        echo -e "${RED}Cannot start - port 3002 in use${NC}"
        exit 1
    fi
fi

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠️  Port 3000 already in use (Frontend)${NC}"
    read -p "Kill existing process? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pkill -f "vite" || true
        sleep 2
    else
        echo -e "${RED}Cannot start - port 3000 in use${NC}"
        exit 1
    fi
fi

# Check dependencies
echo -e "${BLUE}🔍 Checking dependencies...${NC}"

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 not found${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

if [ ! -d "ocr_service" ]; then
    echo -e "${RED}❌ ocr_service directory not found${NC}"
    exit 1
fi

if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}⚠️  Frontend dependencies not installed${NC}"
    echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
    cd frontend && npm install && cd ..
fi

echo -e "${GREEN}✅ Dependencies OK${NC}"
echo ""

# Create log directory
mkdir -p logs

# Start Tesseract OCR Service
echo -e "${BLUE}🚀 Starting Tesseract OCR Service (port 3002)...${NC}"
cd ocr_service
python3 main.py > ../logs/ocr-service.log 2>&1 &
OCR_PID=$!
cd ..
echo -e "${GREEN}✅ Tesseract OCR Service started (PID: $OCR_PID)${NC}"

# Wait for Tesseract to initialize
echo -e "${YELLOW}⏳ Waiting for Tesseract OCR to initialize...${NC}"
sleep 3

# Check if Tesseract is responsive
max_attempts=15
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:3002/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Tesseract OCR Service is ready!${NC}"
        break
    fi
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        echo -e "${RED}❌ Tesseract OCR Service failed to start${NC}"
        echo -e "${YELLOW}Check logs/ocr-service.log for details${NC}"
        exit 1
    fi
    sleep 2
    echo -n "."
done
echo ""

# Start Frontend
echo -e "${BLUE}🚀 Starting Frontend (port 3000)...${NC}"
cd frontend
npm run dev -- --host 0.0.0.0 > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"

# Wait for frontend to be ready
sleep 3

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          🎉 All Services Running!         ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
echo -e "  ${GREEN}•${NC} Tesseract OCR:  http://localhost:3002"
echo -e "  ${GREEN}•${NC} Frontend:       http://localhost:3000"
echo ""
echo -e "${BLUE}📝 Logs:${NC}"
echo -e "  ${YELLOW}•${NC} Tesseract:  tail -f logs/ocr-service.log"
echo -e "  ${YELLOW}•${NC} Frontend:   tail -f logs/frontend.log"
echo ""
echo -e "${BLUE}🛑 To stop all services:${NC}"
echo -e "  make stop"
echo -e "  OR: pkill -f 'python.*main.py|vite'"
echo ""
echo -e "${YELLOW}Press Ctrl+C to exit (services will continue running in background)${NC}"
echo ""

# Save PIDs for easy stopping
echo "$OCR_PID" > logs/ocr.pid
echo "$FRONTEND_PID" > logs/frontend.pid

# Keep script running to show real-time logs
tail -f logs/ocr-service.log logs/frontend.log
