-- 015 — Cierres diarios por zona horaria (#389): price_close_madrid pasa a
-- price_close_daily con la zona en la clave primaria. Las filas existentes
-- son cierres de Europe/Madrid. Idempotente y válida en los tres casos:
--   1. base desplegada: solo existe price_close_madrid (se transforma);
--   2. instalación nueva: schema.sql ya creó price_close_daily y la migración
--      001 recreó una price_close_madrid vacía (se trasladan sus filas y se
--      elimina);
--   3. ya migrada: no hace nada.
-- Reversión: migrations/down/015_cierres_por_zona.sql
DO $$
BEGIN
  IF to_regclass('price_close_daily') IS NULL AND to_regclass('price_close_madrid') IS NOT NULL THEN
    ALTER TABLE price_close_madrid RENAME TO price_close_daily;
    ALTER TABLE price_close_daily ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Madrid';
    ALTER TABLE price_close_daily ALTER COLUMN timezone DROP DEFAULT;
    ALTER TABLE price_close_daily DROP CONSTRAINT price_close_madrid_pkey;
    ALTER TABLE price_close_daily ADD CONSTRAINT price_close_daily_pkey PRIMARY KEY (asset, timezone, close_date);
    ALTER TABLE price_close_daily RENAME CONSTRAINT chk_price_close_madrid_source TO chk_price_close_daily_source;
    ALTER TABLE price_close_daily RENAME CONSTRAINT chk_price_close_madrid_price TO chk_price_close_daily_price;
    ALTER TABLE price_close_daily ADD CONSTRAINT chk_price_close_daily_timezone CHECK (char_length(timezone) BETWEEN 1 AND 64);
  ELSIF to_regclass('price_close_daily') IS NOT NULL AND to_regclass('price_close_madrid') IS NOT NULL THEN
    INSERT INTO price_close_daily (asset, timezone, close_date, price_eur, source, fetched_at)
      SELECT asset, 'Europe/Madrid', close_date, price_eur, source, fetched_at FROM price_close_madrid
      ON CONFLICT DO NOTHING;
    DROP TABLE price_close_madrid;
  END IF;
END $$;
