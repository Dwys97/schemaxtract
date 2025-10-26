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
echo -e "${BLUE}║         (Donut Model Integrated)         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
echo ""

# Check if frontend port is in use
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

# Check if backend port is in use
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠️  Port 3001 already in use (Backend)${NC}"
    read -p "Kill existing process? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pkill -f "sam local" || true
        sleep 2
    else
        echo -e "${RED}Cannot start - port 3001 in use${NC}"
        exit 1
    fi
fi

# Check dependencies
echo -e "${BLUE}🔍 Checking dependencies...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

if ! command -v sam &> /dev/null; then
    echo -e "${RED}❌ AWS SAM CLI not found${NC}"
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

# Start SAM Backend (with integrated Donut)
echo -e "${BLUE}🚀 Starting SAM Backend with Donut (port 3001)...${NC}"
echo -e "${YELLOW}⏳ Building Docker container (first time may take 5-10 minutes)...${NC}"
cd backend
sam build --use-container > ../logs/sam-build.log 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend built successfully${NC}"
    sam local start-api --port 3001 --host 0.0.0.0 > ../logs/backend.log 2>&1 &
    BACKEND_PID=$!
    cd ..
    echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}❌ Backend build failed${NC}"
    echo -e "${YELLOW}Check logs/sam-build.log for details${NC}"
    exit 1
fi

# Wait for backend to initialize
echo -e "${YELLOW}⏳ Waiting for backend to initialize...${NC}"
sleep 5

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
echo -e "  ${GREEN}•${NC} Backend (Donut): http://localhost:3001"
echo -e "  ${GREEN}•${NC} Frontend:        http://localhost:3000"
echo ""
echo -e "${BLUE}📝 Logs:${NC}"
echo -e "  ${YELLOW}•${NC} Backend:  tail -f logs/backend.log"
echo -e "  ${YELLOW}•${NC} Frontend: tail -f logs/frontend.log"
echo ""
echo -e "${BLUE}🤖 Donut Model:${NC}"
echo -e "  ${YELLOW}•${NC} Integrated in Lambda (no separate service)"
echo -e "  ${YELLOW}•${NC} End-to-end document understanding"
echo ""
echo -e "${BLUE}🛑 To stop all services:${NC}"
echo -e "  make stop"
echo -e "  OR: pkill -f 'sam local|vite'"
echo ""
echo -e "${YELLOW}Press Ctrl+C to exit (services will continue running in background)${NC}"
echo ""

# Save PIDs for easy stopping
echo "$BACKEND_PID" > logs/backend.pid
echo "$FRONTEND_PID" > logs/frontend.pid

# Keep script running to show real-time logs
tail -f logs/backend.log logs/frontend.log
