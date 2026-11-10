-- Reversión de 021: se borran las marcas de «revisado» (el tipo deja de existir)
-- y se vuelve a la restricción anterior.
DELETE FROM fiscal_declaraciones WHERE tipo = 'revision';
ALTER TABLE fiscal_declaraciones DROP CONSTRAINT IF EXISTS fiscal_declaraciones_tipo_check;
ALTER TABLE fiscal_declaraciones ADD CONSTRAINT fiscal_declaraciones_tipo_check
  CHECK (tipo IN ('renta', 'modelo721'));
