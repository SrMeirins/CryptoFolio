-- Reversión de 004: elimina los logos guardados. Se vuelven a descargar al
-- reaplicar la migración.
DROP TABLE IF EXISTS asset_icons;
