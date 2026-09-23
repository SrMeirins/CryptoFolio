#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev-env.sh — genera/actualiza el fichero de entorno de desarrollo (.env.dev)
#
# Qué hace:
#   • Crea un .env.dev (gitignoreado) con secretos ALEATORIOS por proyecto y los
#     puertos host LIBRES auto-detectados, para que `make dev` arranque sin
#     configurar nada y sin colisionar con otras apps.
#   • Idempotente: si .env.dev ya existe y no se pasa --fresh, lo REUSA (así los
#     puertos y credenciales son estables entre reinicios y no descuadran con el
#     volumen de Postgres ya creado).
#   • --fresh: regenera secretos y puertos (lo usa `make dev-clean` tras liberar
#     los volúmenes y puertos con `down -v`).
#   • Si existe un .env del usuario, reaprovecha sus valores NO placeholder
#     (p. ej. COINGECKO_API_KEY y, si ya los puso, POSTGRES_PASSWORD/JWT_SECRET).
#
# Uso: scripts/dev-env.sh [--fresh]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ENV_DEV="$ROOT/.env.dev"
ENV_USER="$ROOT/.env"

FRESH=0
[[ "${1:-}" == "--fresh" ]] && FRESH=1

# Bases de puertos en rango poco transitado (evita 3000/3001/5173/5432/8080/5050)
BASE_FRONTEND=45173
BASE_BACKEND=43001
BASE_PG=45432
BASE_PGADMIN=45050

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { printf '  \033[36m·\033[0m %s\n' "$*"; }

# Lee el valor de una clave desde un fichero KEY=VALUE.
# Descarta comentarios inline (' #...'), recorta espacios y quita comillas envolventes.
read_key() { # read_key <fichero> <clave>
  [[ -f "$1" ]] || return 0
  local line
  line="$(sed -n -E "s/^[[:space:]]*${2}[[:space:]]*=[[:space:]]*(.*)\$/\1/p" "$1" | tail -n1)"
  printf '%s' "$line" | sed -E \
    -e 's/[[:space:]]+#.*$//' \
    -e 's/^[[:space:]]+//' \
    -e 's/[[:space:]]+$//' \
    -e 's/^"+//' \
    -e 's/\"+$//' \
    -e "s/^'+//" \
    -e "s/'+\$//"
}

# ¿Puerto TCP ocupado en loopback? (cualquier estado: listen o TIME_WAIT)
port_busy() { # port_busy <puerto>
  ss -Htan "( sport = :${1} )" 2>/dev/null | grep -q .
}

# Primera capa de puertos libres desde una base (escanea hacia arriba).
pick_free_port() { # pick_free_port <base>
  local p="$1" tries=0
  while port_busy "$p"; do
    p=$((p + 1)); tries=$((tries + 1))
    if (( tries > 300 )); then
      echo "No se encontró un puerto libre cerca de $1" >&2; return 1
    fi
  done
  printf '%s' "$p"
}

# Secreto hex aleatorio (openssl)
rand_hex() { openssl rand -hex "${1:-32}"; }

# ── Reuso si ya existe y no es --fresh ────────────────────────────────────────
if [[ -f "$ENV_DEV" && $FRESH -eq 0 ]]; then
  log "Reutilizando $(basename "$ENV_DEV") existente (usa 'make dev-clean' para regenerar)."
  exit 0
fi

# ── Secretos: reusar del .env/.env.dev previo si son válidos, si no, generar ──
PLACEHOLDER_RE='^(cambia_esto.*|change_?me.*|tu_api_key.*|dev_password_local|dev_only_insecure.*)$'

pick_secret() { # pick_secret <clave> <fallback_previo>
  local key="$1" prev="${2:-}" val=""
  for f in "$ENV_USER" "$ENV_DEV"; do
    val="$(read_key "$f" "$key" || true)"
    if [[ -n "$val" && ! "$val" =~ $PLACEHOLDER_RE ]]; then
      printf '%s' "$val"; return 0
    fi
  done
  if [[ -n "$prev" && ! "$prev" =~ $PLACEHOLDER_RE ]]; then
    printf '%s' "$prev"; return 0
  fi
  printf ''  # vacío → el llamador genera uno nuevo
}

PREV_PG_PASS="$(read_key "$ENV_DEV" POSTGRES_PASSWORD || true)"
PREV_JWT="$(read_key "$ENV_DEV" JWT_SECRET || true)"

POSTGRES_USER="$(read_key "$ENV_USER" POSTGRES_USER || true)";        POSTGRES_USER="${POSTGRES_USER:-cryptotracker}"
POSTGRES_DB="$(read_key "$ENV_USER" POSTGRES_DB || true)";            POSTGRES_DB="${POSTGRES_DB:-cryptotracker}"
POSTGRES_PASSWORD="$(pick_secret POSTGRES_PASSWORD "$PREV_PG_PASS")"; [[ -z "$POSTGRES_PASSWORD" ]] && POSTGRES_PASSWORD="$(rand_hex 16)"
JWT_SECRET="$(pick_secret JWT_SECRET "$PREV_JWT")";                   [[ -z "$JWT_SECRET" ]] && JWT_SECRET="$(rand_hex 32)"
COINGECKO_BASE_URL="$(read_key "$ENV_USER" COINGECKO_BASE_URL || true)"; COINGECKO_BASE_URL="${COINGECKO_BASE_URL:-https://api.coingecko.com/api/v3}"
COINGECKO_API_KEY="$(read_key "$ENV_USER" COINGECKO_API_KEY || true)"

# ── Puertos host libres ───────────────────────────────────────────────────────
log "Asignando puertos host libres..."
FRONTEND_HOST_PORT="$(pick_free_port "$BASE_FRONTEND")"
BACKEND_HOST_PORT="$(pick_free_port "$BASE_BACKEND")"
PG_HOST_PORT="$(pick_free_port "$BASE_PG")"
PGADMIN_HOST_PORT="$(pick_free_port "$BASE_PGADMIN")"

# ── Escribir .env.dev (0600: contiene secretos) ───────────────────────────────
umask 077
cat > "$ENV_DEV" <<EOF
# Generado por scripts/dev-env.sh — NO commitear (ya está en .gitignore).
# Secretos aleatorios por proyecto + puertos host libres.
# Regenerar con: make dev-clean   (o)   scripts/dev-env.sh --fresh
COMPOSE_PROJECT_NAME=cryptofolio
NODE_ENV=development

POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}

JWT_SECRET=${JWT_SECRET}

COINGECKO_BASE_URL=${COINGECKO_BASE_URL}
COINGECKO_API_KEY=${COINGECKO_API_KEY}

# Puertos host (loopback) auto-asignados
FRONTEND_HOST_PORT=${FRONTEND_HOST_PORT}
BACKEND_HOST_PORT=${BACKEND_HOST_PORT}
PG_HOST_PORT=${PG_HOST_PORT}
PGADMIN_HOST_PORT=${PGADMIN_HOST_PORT}
EOF

log "Escrito $(basename "$ENV_DEV") (0600)."
log "→ Frontend: http://localhost:${FRONTEND_HOST_PORT}"
log "→ Backend:  http://localhost:${BACKEND_HOST_PORT}"
log "→ Postgres: localhost:${PG_HOST_PORT} (user=${POSTGRES_USER} db=${POSTGRES_DB})"
