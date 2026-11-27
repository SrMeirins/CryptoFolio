-- ============================================================
-- Migración 013_bitvavo_wallet
-- Qué: añade la wallet de sistema 'Bitvavo' (tipo exchange, cuenta única).
-- Por qué: soporte de importación CSV para el segundo exchange del usuario.
--          Bitvavo no tiene sub-cuentas como Binance (Spot/Funding/Margin/
--          Strategy) — todo su balance vive en una única cuenta, por eso
--          basta con una wallet de sistema (a diferencia de las 6 de Binance).
-- ============================================================
INSERT INTO wallets (name, type, is_system, is_default, color)
SELECT 'Bitvavo', 'exchange', TRUE, FALSE, '#273A75'
WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE name = 'Bitvavo');
