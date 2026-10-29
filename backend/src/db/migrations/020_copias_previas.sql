-- 020 — Copias previas a una restauración (#453). Antes de sustituir los datos
-- por los de una copia, se guarda aquí el estado actual para poder volver
-- atrás. Son los mismos datos que ya hay en la base, sin cifrar; se conservan
-- solo las más recientes (lo recorta el código). Idempotente.
-- Reversión: migrations/down/020_copias_previas.sql
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema      INTEGER NOT NULL,
  counts      JSONB NOT NULL,
  data        JSONB NOT NULL
);
