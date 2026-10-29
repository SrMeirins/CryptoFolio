-- 018 — Logo para todos los activos (#449). Id de CoinGecko solo para el logo,
-- aparte de coingecko_id (que también da precios): uno mal resuelto nunca
-- cambia una valoración. Se resuelve por símbolo («auto») o se fija a mano en
-- Ajustes › Activos («manual»). Cada logo guarda de dónde salió. Idempotente.
-- Reversión: migrations/down/018_origen_logos.sql
ALTER TABLE asset_metadata ADD COLUMN IF NOT EXISTS icon_coingecko_id TEXT;
ALTER TABLE asset_metadata ADD COLUMN IF NOT EXISTS icon_id_source TEXT;
ALTER TABLE asset_metadata DROP CONSTRAINT IF EXISTS chk_asset_metadata_icon_id;
ALTER TABLE asset_metadata ADD CONSTRAINT chk_asset_metadata_icon_id CHECK (
  (icon_coingecko_id IS NULL) = (icon_id_source IS NULL)
  AND (icon_coingecko_id IS NULL OR icon_coingecko_id ~ '^[a-z0-9][a-z0-9-]{0,99}$')
  AND (icon_id_source IS NULL OR icon_id_source IN ('auto', 'manual'))
);

ALTER TABLE asset_icons ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE asset_icons DROP CONSTRAINT IF EXISTS chk_asset_icons_source;
ALTER TABLE asset_icons ADD CONSTRAINT chk_asset_icons_source CHECK (source IS NULL OR source IN ('coingecko', 'local', 'flag'));
