-- Reversión de 015: vuelve a price_close_madrid con solo los cierres de
-- Europe/Madrid (los de otras zonas se descartan: se pueden volver a descargar).
DO $$
BEGIN
  IF to_regclass('price_close_daily') IS NOT NULL AND to_regclass('price_close_madrid') IS NULL THEN
    DELETE FROM price_close_daily WHERE timezone <> 'Europe/Madrid';
    ALTER TABLE price_close_daily DROP CONSTRAINT price_close_daily_pkey;
    ALTER TABLE price_close_daily DROP CONSTRAINT IF EXISTS chk_price_close_daily_timezone;
    ALTER TABLE price_close_daily DROP COLUMN timezone;
    ALTER TABLE price_close_daily RENAME TO price_close_madrid;
    ALTER TABLE price_close_madrid ADD CONSTRAINT price_close_madrid_pkey PRIMARY KEY (asset, close_date);
    ALTER TABLE price_close_madrid RENAME CONSTRAINT chk_price_close_daily_source TO chk_price_close_madrid_source;
    ALTER TABLE price_close_madrid RENAME CONSTRAINT chk_price_close_daily_price TO chk_price_close_madrid_price;
  END IF;
END $$;
