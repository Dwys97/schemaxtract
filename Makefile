.PHONY: help install build-backend start-backend start-frontend start-all test-backend clean stop

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies (backend + frontend + donut)
	@echo "📦 Installing AWS SAM CLI..."
	pip install --user aws-sam-cli
	@echo "📦 Installing Donut service dependencies..."
	cd donut_service && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
	@echo "📦 Installing frontend dependencies..."
	cd frontend && npm install
	@echo "✅ All dependencies installed!"

install-donut: ## Install Donut service dependencies only
	@echo "📦 Installing Donut service..."
	cd donut_service && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt

build-backend: ## Build backend Lambda container (lightweight, no Donut)
	@echo "🔨 Building backend Lambda..."
	cd backend && sam build --use-container
	@echo "✅ Backend built successfully!"

start-backend: ## Start backend (SAM Local API)
	@echo "🚀 Starting backend on http://localhost:3001..."
	cd backend && sam local start-api --port 3001 --host 0.0.0.0

start-donut: ## Start Donut service
	@echo "🚀 Starting Donut service on http://localhost:3002..."
	cd donut_service && ./venv/bin/python main.py

start-frontend: ## Start frontend (Vite dev server)
	@echo "🚀 Starting frontend on http://localhost:3000..."
	cd frontend && npm run dev -- --host 0.0.0.0

start-all: ## Start all services using start.sh script
	@echo "🚀 Starting all 3 services (Backend + Donut + Frontend)..."
	./start.sh

start: start-all ## Alias for start-all

test-backend: ## Test backend API endpoint
	@echo "🧪 Testing backend with Donut..."
	@curl -X POST http://127.0.0.1:3001/process-document \
		-H "Content-Type: application/json" \
		-d '{"document": "dGVzdA=="}' \
		-s | python3 -m json.tool
	@echo ""
	@echo "✅ Backend test complete!"

test: test-backend ## Run backend tests

clean: ## Clean build artifacts
	@echo "🧹 Cleaning build artifacts..."
	rm -rf backend/.aws-sam
	rm -rf frontend/dist
	rm -rf frontend/node_modules/.vite
	rm -rf logs
	@echo "✅ Clean complete!"

stop: ## Stop all running services
	@echo "🛑 Stopping all services..."
	@pkill -f "sam local" || echo "Backend not running"
	@pkill -f "vite" || echo "Frontend not running"
	@echo "✅ All services stopped!"

dev: ## Quick start development environment  
	@echo "🚀 Starting development environment..."
	@echo "This will open 2 processes. Press Ctrl+C to stop both."
	@trap 'make stop' INT; \
	make start-backend & \
	sleep 10 && make start-frontend

.DEFAULT_GOAL := help
