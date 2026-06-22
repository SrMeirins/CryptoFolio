-- fiscal_treatment, fifo_effect y catalog_type se añadieron en 002 pero nunca
-- se usaron en ningún punto de la app (backend ni frontend). schema.sql nunca
-- las incluyó (instalaciones Docker no las tienen); solo instalaciones
-- Electron que corrieron 002 desde cero las tendrían. Se eliminan aquí en vez
-- de editar 002 (migración ya aplicada, no se toca retroactivamente).
ALTER TABLE transactions
  DROP COLUMN IF EXISTS fiscal_treatment,
  DROP COLUMN IF EXISTS fifo_effect,
  DROP COLUMN IF EXISTS catalog_type;
