# ===========================================================================
# stem-data-wall — "no Ansible needed" shortcuts around docker compose and
# the Python reset/seed scripts. Run `make help` to see everything.
#
# NOTE: recipe lines are indented with TABS (required by make).
# ===========================================================================

# Prefer "docker compose" (v2), fall back to "docker-compose" (v1).
COMPOSE ?= docker compose
# Run the Python scripts through uv if available, else plain python3.
PYTHON  ?= python3

.DEFAULT_GOAL := help
.PHONY: help up down logs restart build ps reset-data seed-demo \
        reset-events reset-board reset-all backup-data nuke env

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example if it does not exist yet
	@test -f .env || (cp .env.example .env && echo "Created .env from template — edit the passwords and PIN!")

up: env ## Build and start the whole stack (app + mongo + grafana)
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Monitor (kiosk)  : http://localhost:8080/"
	@echo "  Controller (iPad): http://localhost:8080/controller"
	@echo "  Results          : http://localhost:8080/results"
	@echo "  Admin            : http://localhost:8080/admin"
	@echo "  Staff            : http://localhost:8080/staff"
	@echo "  Grafana          : http://localhost:3000/"

down: ## Stop the stack (keeps your data)
	$(COMPOSE) down

restart: ## Restart just the app container (after editing server code)
	$(COMPOSE) restart app

build: ## Rebuild the app image
	$(COMPOSE) build app

ps: ## Show container status
	$(COMPOSE) ps

logs: ## Follow logs from all containers
	$(COMPOSE) logs -f --tail=100

# ---- Data: seed / reset / backup -------------------------------------------
# These call the Python scripts. They run on the host and talk to MongoDB on
# 127.0.0.1 (the port is bound to loopback). --yes skips the typed confirmation.

seed-demo: ## Insert realistic fake events for testing the charts
	$(PYTHON) scripts/seed_demo.py

reset-data: reset-events ## Alias for the most common reset (events only)

reset-events: ## Delete all events but keep the collection, schema, and indexes
	$(PYTHON) scripts/reset_db.py --events --yes

reset-board: ## Reset only the game board (used tiles), keep events
	$(PYTHON) scripts/reset_db.py --board --yes

reset-all: ## Drop the DB and recreate the collection + schema + indexes
	$(PYTHON) scripts/reset_db.py --all --yes

backup-data: ## Export all events to a timestamped JSON file under ./backups
	$(PYTHON) scripts/reset_db.py --events --backup ./backups --dry-run
	@echo "Backup written. (Dry-run: no data was deleted.)"

# ---- Full Docker-only teardown ---------------------------------------------
nuke: ## DESTROY everything: containers, volumes, project images, and .env
	@echo "This removes ALL containers, data volumes, and project images."
	@printf "Type 'nuke' to continue: " && read ans && [ "$$ans" = "nuke" ] || (echo "Aborted."; exit 1)
	$(COMPOSE) down -v --rmi local
	@rm -f .env && echo "Removed .env."
