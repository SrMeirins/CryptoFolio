-- 021 — Paso «Revisado» del ejercicio (#542): fiscal_declaraciones admite el
-- tipo «revision», con la fecha y las cifras revisadas. Un solo origen del
-- estado de la declaración. Idempotente.
-- Reversión: migrations/down/021_declaracion_revision.sql
ALTER TABLE fiscal_declaraciones DROP CONSTRAINT IF EXISTS fiscal_declaraciones_tipo_check;
ALTER TABLE fiscal_declaraciones ADD CONSTRAINT fiscal_declaraciones_tipo_check
  CHECK (tipo IN ('renta', 'modelo721', 'revision'));
