.PHONY: help install build-backend start-backend start-frontend start test-backend test clean stop

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

build-backend: ## Build backend Lambda container
	@echo "🔨 Building backend..."
	cd backend && sam build --use-container
	@echo "✅ Backend built successfully!"

start-backend: ## Start backend (SAM Local API)
	@echo "🚀 Starting backend on http://localhost:3001..."
	cd backend && sam local start-api --port 3001 --host 0.0.0.0

start-frontend: ## Start frontend (Vite dev server)
	@echo "🚀 Starting frontend on http://localhost:3000..."
	cd frontend && npm run dev:host

start: ## Start both backend and frontend (requires 2 terminals)
	@echo "⚠️  This command requires 2 terminals."
	@echo "Terminal 1: make start-backend"
	@echo "Terminal 2: make start-frontend"
	@echo ""
	@echo "Or use VS Code Tasks: Ctrl+Shift+P -> 'Tasks: Run Task' -> 'Start Both Services'"

test-backend: ## Test backend API endpoint
	@echo "🧪 Testing backend..."
	@curl -X POST http://127.0.0.1:3001/process-document \
		-H "Content-Type: application/json" \
		-d '{"document": "dGVzdA=="}' \
		-s | python3 -m json.tool
	@echo ""
	@echo "✅ Backend test complete!"

test: test-backend ## Run all tests

clean: ## Clean build artifacts
	@echo "🧹 Cleaning build artifacts..."
	rm -rf backend/.aws-sam
	rm -rf frontend/dist
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
