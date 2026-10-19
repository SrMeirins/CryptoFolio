-- 008 — Ejercicios declarados (#311): la Renta y el Modelo 721 presentados de
-- cada ejercicio, con las cifras del momento para detectar cambios después y
-- aplicar la regla del incremento de 20.000 € del 721. Idempotente.
-- Reversión: migrations/down/008_fiscal_declaraciones.sql
CREATE TABLE IF NOT EXISTS fiscal_declaraciones (
  ejercicio     INTEGER     NOT NULL CHECK (ejercicio BETWEEN 2009 AND 2100),
  tipo          TEXT        NOT NULL CHECK (tipo IN ('renta', 'modelo721')),
  declarado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  cifras        JSONB       NOT NULL CHECK (jsonb_typeof(cifras) = 'object'),
  PRIMARY KEY (ejercicio, tipo)
);
