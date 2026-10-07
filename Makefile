# PathPay Makefile — Phase 01
# Wraps pnpm + docker compose. Run `make` to see available targets.

.PHONY: help infra-up infra-down infra-reset dev build test test-cov migrate seed logs clean

help:
	@echo "PathPay targets:"
	@echo "  infra-up      Start Postgres + Redis (Docker Compose)"
	@echo "  infra-down    Stop containers (keep volumes)"
	@echo "  infra-reset   DESTRUCTIVE: stop containers AND remove volumes"
	@echo "  dev           Start the NestJS app in watch mode"
	@echo "  build         Compile TypeScript"
	@echo "  test          Run Jest"
	@echo "  test-cov      Run Jest with coverage"
	@echo "  migrate       Apply Prisma migrations (Phase 02)"
	@echo "  seed          Load dev seed data (Phase 02)"
	@echo "  logs          Tail app logs (placeholder — no file logging yet)"
	@echo "  clean         Remove dist/ and coverage/"

infra-up:
	docker compose -f deploy/docker-compose.yml up -d
	@echo "Waiting for Postgres + Redis to become healthy..."
	@docker compose -f deploy/docker-compose.yml ps

infra-down:
	docker compose -f deploy/docker-compose.yml stop

infra-reset:
	@echo "WARNING: This will DELETE Postgres and Redis volumes."
	@read -p "Press Enter to continue, Ctrl+C to abort..." _
	docker compose -f deploy/docker-compose.yml down -v

dev:
	pnpm run start:dev

build:
	pnpm run build

test:
	pnpm run test --passWithNoTests

test-cov:
	pnpm run test:cov

migrate:
	@echo "Phase 02 will add: pnpm exec prisma migrate deploy"
	@exit 1

seed:
	@echo "Phase 02 will add: pnpm exec prisma db seed"
	@exit 1

logs:
	@echo "Phase 11 will add structured file logging."

clean:
	rm -rf dist coverage