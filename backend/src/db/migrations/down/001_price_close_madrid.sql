-- Reversión de 001_price_close_madrid.sql. Solo elimina una caché: los
-- precios se vuelven a obtener de Binance/CoinGecko cuando hagan falta.
-- El runner no lee este directorio; se aplica a mano si hay que revertir.
DROP TABLE IF EXISTS price_close_madrid;
