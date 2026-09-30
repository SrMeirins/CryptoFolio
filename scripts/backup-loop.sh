#!/bin/sh
# Backup automático de PostgreSQL — corre dentro del sidecar db-backup mientras
# el stack esté levantado. pg_dump comprimido + retención por cantidad de
# ficheros (más portable en Alpine/busybox que -mtime en find).
set -eu
# El exit code de un pipe es el del ÚLTIMO comando por defecto: sin
# pipefail, "pg_dump | gzip" reporta éxito (exit 0 de gzip) aunque pg_dump
# falle — el backup queda como un .gz válido pero vacío, marcado "OK" en el
# log. Confirmado que busybox ash (la shell real de postgres:16-alpine) sí
# soporta esta opción.
set -o pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"

# El directorio de backups vive FUERA del repo, en el host (ver
# docker-compose*.yml) — su dueño real depende de quién lo cree primero:
# este contenedor (root) si es la primera vez que arranca el stack, o el
# usuario normal si ya hizo antes un `make backup`/backup manual desde el
# host. chmod 777 aquí (no chown: no conocemos el UID/GID real del host)
# asegura que ambos lados puedan siempre leer/escribir, sin depender del
# orden de arranque. Mismo host de confianza única que el resto del
# modelo de seguridad de este proyecto self-hosted — no expone nada a la
# red, solo afecta a otros usuarios locales de la misma máquina.
mkdir -p "$BACKUP_DIR"
chmod 777 "$BACKUP_DIR"

do_backup() {
  ts=$(date +%Y%m%d_%H%M%S)
  file="$BACKUP_DIR/cryptotracker_${ts}.sql.gz"
  echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') — generando $file"
  if pg_dump | gzip > "$file"; then
    echo "[backup] OK ($(du -h "$file" | cut -f1))"
  else
    echo "[backup] ERROR generando el backup" >&2
    rm -f "$file"
    return 1
  fi
  ls -1t "$BACKUP_DIR"/cryptotracker_*.sql.gz 2>/dev/null | tail -n "+$((RETENTION_COUNT + 1))" | xargs -r rm -f
}

while true; do
  do_backup || echo "[backup] fallo, se reintentará en el siguiente ciclo" >&2
  sleep 604800 # 7 días — backup diario resultaba una carga excesiva sin necesidad real
done
