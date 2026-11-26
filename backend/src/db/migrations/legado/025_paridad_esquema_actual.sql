-- 025 (legado) — Paridad con el esquema actual tras el puente de la versión 1.0.
-- Cierra lo que las migraciones 002-024 no cubren respecto a schema.sql:
--   - v_portfolio_current: vista sin uso, retirada de schema.sql; se elimina
--     porque bloquearía futuros ALTER COLUMN TYPE sobre fifo_lots.
--   - eur_amount: dominio de los importes no negativos (#115). Las columnas ya
--     son NUMERIC(38,18) con sus CHECK >= 0 (020); el dominio queda disponible
--     para migraciones posteriores y marca que el puente ya se aplicó (el
--     runner no vuelve a recorrer legado/ si existe).
-- Idempotente.

DROP VIEW IF EXISTS v_portfolio_current;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eur_amount' AND typtype = 'd') THEN
    CREATE DOMAIN eur_amount AS NUMERIC(38, 18) CHECK (VALUE >= 0);
  END IF;
END
$$;
