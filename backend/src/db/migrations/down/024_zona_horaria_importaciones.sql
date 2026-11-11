-- Reversión de 024: quita la zona horaria guardada de cada importación. Las
-- horas ya corregidas de las transacciones se conservan.
ALTER TABLE csv_imports DROP CONSTRAINT IF EXISTS chk_csv_imports_desfase_horas;
ALTER TABLE csv_imports DROP COLUMN IF EXISTS desfase_horas;
