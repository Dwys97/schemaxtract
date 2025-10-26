.PHONY: help install install-ocr build-backend start-backend start-ocr start-frontend start-all test-backend test-ocr test clean stop

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies (backend + frontend)
	@echo "📦 Installing backend dependencies..."
	pip install --user aws-sam-cli
	pip install --user -r backend/requirements.txt
	@echo "📦 Installing frontend dependencies..."
	cd frontend && npm install
	@echo "✅ All dependencies installed!"

install-ocr: ## Install PaddleOCR service dependencies
	@echo "📦 Installing PaddleOCR service dependencies..."
	pip install -r ocr_service/requirements.txt
	@echo "📦 Installing system dependencies..."
	sudo apt-get update && sudo apt-get install -y libgl1 libglib2.0-0
	@echo "✅ PaddleOCR service dependencies installed!"

build-backend: ## Build backend Lambda container
	@echo "🔨 Building backend..."
	cd backend && sam build --use-container
	@echo "✅ Backend built successfully!"

start-backend: ## Start backend (SAM Local API) - DEPRECATED: Use start-ocr instead
	@echo "⚠️  WARNING: Backend uses simulation mode."
	@echo "⚠️  Use 'make start-ocr' for real PaddleOCR extraction."
	@echo "🚀 Starting backend on http://localhost:3001..."
	cd backend && sam local start-api --port 3001 --host 0.0.0.0

start-ocr: ## Start PaddleOCR service (recommended)
	@echo "🚀 Starting PaddleOCR service on http://localhost:3002..."
	cd ocr_service && python main.py

start-frontend: ## Start frontend (Vite dev server)
	@echo "🚀 Starting frontend on http://localhost:3000..."
	cd frontend && npm run dev -- --host 0.0.0.0

start-all: ## Start all services using start.sh script
	@echo "🚀 Starting all services..."
	./start.sh

start: start-all ## Alias for start-all

test-backend: ## Test backend API endpoint
	@echo "🧪 Testing backend..."
	@curl -X POST http://127.0.0.1:3001/process-document \
		-H "Content-Type: application/json" \
		-d '{"document": "dGVzdA=="}' \
		-s | python3 -m json.tool
	@echo ""
	@echo "✅ Backend test complete!"

test-ocr: ## Test PaddleOCR service
	@echo "🧪 Testing PaddleOCR service..."
	@curl http://127.0.0.1:3002/health -s | python3 -m json.tool
	@echo ""
	@echo "✅ PaddleOCR service test complete!"

test: test-ocr ## Run all tests (defaults to PaddleOCR)

clean: ## Clean build artifacts
	@echo "🧹 Cleaning build artifacts..."
	rm -rf backend/.aws-sam
	rm -rf frontend/dist
	rm -rf frontend/node_modules/.vite
	@echo "✅ Clean complete!"

stop: ## Stop all running services
	@echo "🛑 Stopping all services..."
	@pkill -f "sam local" || true
	@pkill -f "vite" || true
	@pkill -f "python.*main.py" || true
	@echo "✅ All services stopped!"
	rm -rf frontend/.vite
	@echo "✅ Clean complete!"

stop: ## Stop all running services
	@echo "🛑 Stopping services..."
	@pkill -f "sam local" || echo "SAM not running"
	@pkill -f "vite" || echo "Vite not running"
	@echo "✅ Services stopped!"

dev: ## Quick start development environment
	@echo "🚀 Starting development environment..."
	@echo "This will open 2 processes. Press Ctrl+C to stop both."
	@trap 'make stop' INT; \
	make start-backend & \
	sleep 5 && make start-frontend

.DEFAULT_GOAL := help
