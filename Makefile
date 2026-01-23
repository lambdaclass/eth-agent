.PHONY: all install build test test-watch test-coverage test-property test-fuzz test-e2e lint lint-fix typecheck clean help

# Default target
all: install lint typecheck test build

# Install dependencies
install:
	npm install

# Build the project
build:
	npm run build

# Run unit tests
test:
	npm run test

# Run tests in watch mode
test-watch:
	npm run test:watch

# Run tests with coverage
test-coverage:
	npm run test:coverage

# Run property-based tests
test-property:
	npm run test:property

# Run fuzz tests
test-fuzz:
	npm run test:fuzz

# Run e2e tests (requires anvil from Foundry)
test-e2e:
	npm run test:e2e

# Run all tests (unit + property + fuzz + e2e)
test-all: test test-property test-fuzz test-e2e

# Run linter
lint:
	npm run lint

# Fix lint errors
lint-fix:
	npm run lint:fix

# Type check
typecheck:
	npm run typecheck

# Clean build artifacts
clean:
	npm run clean

# Development mode (watch)
dev:
	npm run dev

# Check everything before committing
check: lint typecheck test

# Full CI pipeline
ci: install lint typecheck test-coverage build

# Show help
help:
	@echo "Available targets:"
	@echo "  all          - Install, lint, typecheck, test, and build"
	@echo "  install      - Install dependencies"
	@echo "  build        - Build the project"
	@echo "  test         - Run unit tests"
	@echo "  test-watch   - Run tests in watch mode"
	@echo "  test-coverage- Run tests with coverage"
	@echo "  test-property- Run property-based tests"
	@echo "  test-fuzz    - Run fuzz tests"
	@echo "  test-e2e     - Run e2e tests (requires anvil)"
	@echo "  test-all     - Run all tests"
	@echo "  lint         - Run linter"
	@echo "  lint-fix     - Fix lint errors"
	@echo "  typecheck    - Type check"
	@echo "  clean        - Clean build artifacts"
	@echo "  dev          - Development mode (watch)"
	@echo "  check        - Check before committing"
	@echo "  ci           - Full CI pipeline"
	@echo "  help         - Show this help"
