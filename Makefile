.PHONY: infra-up infra-down infra-reset dev-build test migrate seed logs

infra-up:
	docker compose -f deploy/docker-compose.yml up -d

infra-down:
	docker compose -f deploy/docker-compose.yml down

infra-reset:
	@echo "DESTRUCTIVE: removes volumes"
	docker compose -f deploy/docker-compose.yml down -v

dev:
	npm run start:dev
	
build:
	npm run build

test:
	npm test

migrate:
	npx prisma migrate dev

seed:
	npm run seed

logs:
	docker compose -f deploy/docker-compose.yml logs -f