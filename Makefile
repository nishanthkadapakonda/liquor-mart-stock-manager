# Liquor Mart Stock Manager - Makefile
# Usage: make <target>
# For Windows users without make: use the npm scripts in backend/package.json

.PHONY: help dev dev-backend dev-frontend install db-reset db-fresh db-seed db-studio db-migrate db-push clean

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Development:"
	@echo "    make dev             - Start both backend and frontend"
	@echo "    make dev-backend     - Start backend only"
	@echo "    make dev-frontend    - Start frontend only"
	@echo "    make install         - Install all dependencies"
	@echo ""
	@echo "  Database:"
	@echo "    make db-reset        - Reset DB (delete all data, keep schema)"
	@echo "    make db-fresh        - Fresh start (drop DB, recreate, migrate)"
	@echo "    make db-seed         - Seed database with sample data"
	@echo "    make db-studio       - Open Prisma Studio (GUI)"
	@echo "    make db-migrate      - Run pending migrations"
	@echo "    make db-push         - Push schema changes (dev only)"
	@echo ""
	@echo "  Cleanup:"
	@echo "    make clean           - Remove node_modules and build artifacts"
	@echo ""

# ============================================
# Development
# ============================================

dev:
	@echo "Starting backend and frontend..."
	cd backend && npm run dev &
	cd frontend && npm run dev

dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

install:
	cd backend && npm install
	cd frontend && npm install

# ============================================
# Database Operations
# ============================================

# Reset database - deletes ALL data but keeps the schema
db-reset:
	@echo "⚠️  This will DELETE ALL DATA from the database!"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	cd backend && npx prisma migrate reset --force
	@echo "✅ Database reset complete. All tables are empty."

# Fresh start - completely recreates the database
db-fresh:
	@echo "⚠️  This will DROP and RECREATE the entire database!"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	cd backend && npx prisma migrate reset --force
	@echo "✅ Fresh database created with all migrations applied."

# Seed database with sample data
db-seed:
	cd backend && npm run seed

# Open Prisma Studio - visual database browser
db-studio:
	cd backend && npx prisma studio

# Run pending migrations
db-migrate:
	cd backend && npx prisma migrate dev

# Push schema changes without creating migration (dev only)
db-push:
	cd backend && npx prisma db push

# ============================================
# Cleanup
# ============================================

clean:
	rm -rf backend/node_modules backend/dist
	rm -rf frontend/node_modules frontend/dist
	@echo "✅ Cleaned up node_modules and build artifacts"

