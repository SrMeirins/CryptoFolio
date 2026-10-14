-- 004 — Logos de los activos servidos desde el propio origen (#201).
-- El navegador pedía los iconos a un servicio externo: revelaba qué activos se
-- tienen y la CSP de producción (img-src 'self' data:) los bloqueaba. El
-- backend los descarga una vez y los guarda aquí. 'missing' marca los activos
-- sin logo disponible, para reintentarlos más adelante sin pedirlos en cada carga.
-- Idempotente; reflejada en schema.sql. Reversión en migrations/down/.
CREATE TABLE IF NOT EXISTS asset_icons (
  symbol        TEXT PRIMARY KEY,
  status        TEXT NOT NULL,
  content_type  TEXT,
  data          BYTEA,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_asset_icons_status CHECK (status IN ('ok', 'missing')),
  CONSTRAINT chk_asset_icons_content CHECK (
    (status = 'ok' AND data IS NOT NULL AND octet_length(data) <= 262144
       AND content_type IN ('image/png', 'image/jpeg', 'image/webp'))
    OR (status = 'missing' AND data IS NULL AND content_type IS NULL)
  )
);
