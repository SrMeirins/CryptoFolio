# ─────────────────────────────────────────────────────────────────────────────
# CryptoFolio — Makefile de desarrollo Dockerizado
#
# Todo el stack usa un `.env.dev` (gitignoreado, generado) con secretos
# aleatorios y puertos host libres → arranca SIEMPRE sin colisionar con otras
# apps dockerizadas y sin configurar nada a mano.
#
# Atajo:  make dev        (BBDD con datos, reutiliza volumen si existe)
#         make dev-clean  (BBDD VACÍA: borra volúmenes y arranca de cero)
#         make help       (lista de comandos)
# ─────────────────────────────────────────────────────────────────────────────

SHELL       := /bin/bash
DEV_ENV     := .env.dev
ENV_SH      := ./scripts/dev-env.sh
# Compose siempre anclado a nuestro env de desarrollo y al proyecto aislado.
COMPOSE     := docker compose --env-file $(DEV_ENV)

.DEFAULT_GOAL := help
.PHONY: help env dev dev-clean rebuild restart tools down ps logs logs-backend logs-frontend psql sh-backend backend-test urls clean nuke

## ── Ayuda ────────────────────────────────────────────────────────────────────
help: ## Mostrar esta ayuda
	@awk 'BEGIN{FS=":.*?## "}; /^[a-zA-Z0-9_-]+:.*?## /{printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## ── Ciclo de vida ────────────────────────────────────────────────────────────
env: ## Generar .env.dev si no existe (secretos + puertos libres). Idempotente.
	@$(ENV_SH)

dev: ## Levantar el stack dev (reutiliza BBDD si existe). make env → up -d --build
	@$(ENV_SH)
	@$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory urls

dev-clean: ## Levantar LIMPIO (BBDD vacía): down -v + regenera env + up --build
	@echo "⚠️  Se eliminarán los volúmenes (datos de Postgres y CSVs subidos)."
	@$(COMPOSE) down -v --remove-orphans
	@$(ENV_SH) --fresh
	@$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory urls

rebuild: ## Reconstruir imágenes y reiniciar manteniendo datos
	@$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory urls

restart: ## Reiniciar contenedores (sin reconstruir ni tocar datos)
	@$(COMPOSE) restart
	@$(MAKE) --no-print-directory urls

tools: ## Añadir pgAdmin (perfil 'tools') al stack ya levantado
	@$(ENV_SH)
	@$(COMPOSE) --profile tools up -d
	@echo "pgAdmin → http://$$( $(COMPOSE) --profile tools port pgadmin 80 2>/dev/null )  (email admin@cryptotracker.local)"

down: ## Parar el stack (conserva datos y .env.dev)
	@$(COMPOSE) down

## ── Inspección ───────────────────────────────────────────────────────────────
ps: ## Estado de los contenedores y sus puertos asignados
	@$(COMPOSE) ps

logs: ## Seguir logs de todos los servicios
	@$(COMPOSE) logs -f --tail=100

logs-backend: ## Logs solo del backend
	@$(COMPOSE) logs -f --tail=100 backend

logs-frontend: ## Logs solo del frontend
	@$(COMPOSE) logs -f --tail=100 frontend

urls: ## Imprimir las URLs reales (resolviendo puertos asignados)
	@f=$$( $(COMPOSE) port frontend 5173 2>/dev/null); b=$$( $(COMPOSE) port backend 3001 2>/dev/null); \
	echo ""; \
	echo "  🖥️   Frontend  → http://$${f:-<sin subir>}"; \
	echo "  🔌   Backend   → http://$${b:-<sin subir>}"; \
	echo "  🐘   Postgres  → localhost:$$(grep -E '^PG_HOST_PORT=' $(DEV_ENV) | cut -d= -f2)"; echo ""

## ── Acceso ───────────────────────────────────────────────────────────────────
psql: ## Shell psql dentro del contenedor de Postgres
	@$(COMPOSE) exec postgres sh -lc 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

sh-backend: ## Shell dentro del contenedor del backend
	@$(COMPOSE) exec backend sh

backend-test: ## Correr los tests del backend dentro del contenedor
	@$(COMPOSE) exec backend npm test

## ── Limpieza ─────────────────────────────────────────────────────────────────
clean: ## Bajar el stack y BORRAR volúmenes (datos). Conserva .env.dev
	@$(COMPOSE) down -v --remove-orphans
	@echo "Volúmenes eliminados."

nuke: ## LO TODO: down -v + borra imágenes construidas + borra .env.dev
	@read -r -p "⚠️  Esto borra TODO (datos, imágenes y .env.dev). ¿Continuar? [y/N] " r; \
	 if [ "$$r" = "y" ] || [ "$$r" = "Y" ]; then \
	   $(COMPOSE) down -v --rmi local --remove-orphans; \
	   rm -f $(DEV_ENV); \
	   echo "Stack, volúmenes, imágenes locales y .env.dev eliminados."; \
	 else echo "Cancelado."; fi
