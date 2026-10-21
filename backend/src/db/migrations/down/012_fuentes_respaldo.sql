-- Reversión de 012: quita los cierres de las fuentes de respaldo (se volverán a
-- descargar con las originales) y el id de CoinPaprika.
DELETE FROM price_close_madrid WHERE source IN ('coinpaprika_daily', 'okx_1d');
ALTER TABLE price_close_madrid DROP CONSTRAINT IF EXISTS chk_price_close_madrid_source;
ALTER TABLE price_close_madrid ADD CONSTRAINT chk_price_close_madrid_source
  CHECK (source IN ('binance_1h', 'coingecko_daily', 'none'));
ALTER TABLE asset_metadata DROP COLUMN IF EXISTS coinpaprika_id;
