# ─────────────────────────────────────────────────────────────────────────────
# CryptoFolio — Makefile de DESARROLLO Dockerizado (uso interno del equipo)
#
# Todos los targets de este Makefile usan docker-compose.dev.yml — el stack
# de desarrollo, nunca el de producción. Un usuario final NO necesita este
# Makefile: solo necesita `docker compose up -d` con docker-compose.yml
# (ver README.md, sección de instalación).
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
DEV_COMPOSE_FILE := docker-compose.dev.yml
ENV_SH      := ./scripts/dev-env.sh
# Compose siempre anclado al fichero de dev, nuestro env y el proyecto aislado.
COMPOSE     := docker compose -f $(DEV_COMPOSE_FILE) --env-file $(DEV_ENV)

.DEFAULT_GOAL := help
.PHONY: help env dev dev-clean rebuild restart tools prod down ps logs logs-backend logs-frontend psql sh-backend backend-test urls clean nuke

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
	@echo "pgAdmin → http://$$( $(COMPOSE) --profile tools port pgadmin 8080 2>/dev/null )  (email admin@cryptofolio.app)"

prod: ## Añadir el frontend en modo producción (perfil 'prod') al stack ya levantado
	@$(ENV_SH)
	@$(COMPOSE) --profile prod up -d --build
	@echo "Frontend (prod) → http://$$( $(COMPOSE) --profile prod port frontend-prod 8080 2>/dev/null )"

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

## ── Backup ───────────────────────────────────────────────────────────────────
backup: ## Backup manual inmediato de Postgres (pg_dump comprimido en ./backups)
	@mkdir -p backups
	@ts=$$(date +%Y%m%d_%H%M%S); \
	 file="backups/cryptotracker_manual_$$ts.sql.gz"; \
	 $(COMPOSE) exec -T postgres sh -lc 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' | gzip > "$$file"; \
	 echo "Backup escrito en $$file ($$(du -h "$$file" | cut -f1))"

restore: ## Restaurar un backup: make restore FILE=backups/cryptotracker_...sql.gz
	@if [ -z "$(FILE)" ]; then echo "Uso: make restore FILE=backups/archivo.sql.gz"; exit 1; fi
	@echo "⚠️  Esto SOBREESCRIBE la base de datos actual con $(FILE)."
	@read -r -p "¿Continuar? [y/N] " r; \
	 if [ "$$r" = "y" ] || [ "$$r" = "Y" ]; then \
	   gunzip -c "$(FILE)" | $(COMPOSE) exec -T postgres sh -lc 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'; \
	   echo "Restauración completada."; \
	 else echo "Cancelado."; fi

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
