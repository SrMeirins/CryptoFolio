-- Reversión de 018: quita el id de CoinGecko del logo y el origen de cada logo.
-- Los logos guardados se conservan; los precios no dependían de estas columnas.
ALTER TABLE asset_icons DROP CONSTRAINT IF EXISTS chk_asset_icons_source;
ALTER TABLE asset_icons DROP COLUMN IF EXISTS source;
ALTER TABLE asset_metadata DROP CONSTRAINT IF EXISTS chk_asset_metadata_icon_id;
ALTER TABLE asset_metadata DROP COLUMN IF EXISTS icon_id_source;
ALTER TABLE asset_metadata DROP COLUMN IF EXISTS icon_coingecko_id;
