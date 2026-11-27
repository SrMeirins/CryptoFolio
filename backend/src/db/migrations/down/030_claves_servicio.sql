-- Reversión de 030_claves_servicio: elimina la clave guardada de CoinGecko.
-- Tras revertir, el backend vuelve a leer solo COINGECKO_API_KEY del entorno.
DROP TABLE IF EXISTS claves_servicio;
