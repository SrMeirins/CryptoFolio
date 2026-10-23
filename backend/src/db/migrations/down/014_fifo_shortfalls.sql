-- Reversión de 014: quita los déficits guardados (el motor los vuelve a
-- anotar solo como errores de cada ejecución).
DROP TABLE IF EXISTS fifo_shortfalls;
