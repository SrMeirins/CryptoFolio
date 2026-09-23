-- ============================================================
-- Migración 017_lunc_binance_pair
-- Qué: reasigna LUNC (Terra Luna Classic) a su par real de Binance
--      'LUNCUSDT' (price_source 'usdt_proxy') y limpia su coingecko_id,
--      y purga los centinelas -1 ('no_data') que había en price_cache.
-- Por qué: se sembró como 'coingecko' con id 'terra-luna', que corresponde a
--      la nueva LUNA 2.0 (precio ~1000x superior), no a LUNC. Al no tener par
--      de Binance y no haber clave de CoinGecko, quedaba sin precio y se
--      cachecía como 'no_data' (-1) de forma permanente. Con LUNCUSDT se
--      resuelve desde Binance sin credenciales. El DELETE de centinelas permite
--      que el motor los recalcule con el par correcto.
-- Reversible: no revierte el precio ya recalculado; para volver atrás bastaría
--      restaurar price_source='coingecko', coingecko_id='terra-luna' y binance
--      pairs a NULL. Se deja coingecko_id a NULL (neutro) en lugar del erróneo.
-- ============================================================
UPDATE asset_metadata
   SET price_source      = 'usdt_proxy',
       binance_usdt_pair = 'LUNCUSDT',
       binance_eur_pair  = NULL,
       binance_btc_pair  = NULL,
       binance_eth_pair  = NULL,
       coingecko_id      = NULL,
       auto_detected     = FALSE,
       last_price_check  = NOW()
 WHERE symbol = 'LUNC';

-- Eliminar los precios en caché marcados como 'no_data' (-1) de LUNC para que
-- se recalculen vía Binance. No toca ningún precio real.
DELETE FROM price_cache WHERE asset = 'LUNC' AND price_eur < 0;
