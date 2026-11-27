-- Reversión de 031: borra las importaciones de retiradas (no tienen operaciones
-- propias; los datos que completaron en los retiros se conservan) y quita las columnas.
DELETE FROM csv_imports WHERE tipo = 'retiradas';
ALTER TABLE csv_imports
  DROP CONSTRAINT IF EXISTS chk_csv_imports_periodo,
  DROP CONSTRAINT IF EXISTS chk_csv_imports_tipo,
  DROP COLUMN IF EXISTS periodo_hasta,
  DROP COLUMN IF EXISTS periodo_desde,
  DROP COLUMN IF EXISTS tipo;
