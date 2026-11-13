-- 026 — Custodia de las wallets de exchange (#545). Para el Modelo 721 solo
-- computa lo custodiado fuera de España. Cada fila es lo que el usuario indica
-- para una wallet desde una fecha (NULL: desde siempre) hasta la siguiente:
-- si la custodia está en España y, opcionalmente, los datos de la entidad para
-- el formulario. Sin filas, las wallets nativas de los exchanges que la app
-- importa usan su regla automática (catálogo en el código) y el resto computa
-- por prudencia.
-- Idempotente. Reversión: migrations/down/026_custodia_wallets.sql
CREATE TABLE IF NOT EXISTS wallet_custodia (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id      UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  desde          DATE,
  en_espana      BOOLEAN NOT NULL,
  entidad_nombre TEXT CHECK (entidad_nombre IS NULL OR char_length(btrim(entidad_nombre)) BETWEEN 1 AND 120),
  entidad_nif    TEXT CHECK (entidad_nif IS NULL OR char_length(entidad_nif) <= 32),
  -- País de la entidad (ISO 3166-1 alfa-2), coherente con en_espana.
  entidad_pais   CHAR(2) CHECK (entidad_pais IS NULL OR entidad_pais ~ '^[A-Z]{2}$'),
  entidad_web    TEXT CHECK (entidad_web IS NULL OR char_length(entidad_web) <= 200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_custodia_pais_coherente CHECK (entidad_pais IS NULL OR (entidad_pais = 'ES') = en_espana)
);
-- Una sola fila por wallet y fecha, y una sola «desde siempre».
CREATE UNIQUE INDEX IF NOT EXISTS wallet_custodia_desde_key ON wallet_custodia(wallet_id, desde) WHERE desde IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_custodia_siempre_key ON wallet_custodia(wallet_id) WHERE desde IS NULL;
