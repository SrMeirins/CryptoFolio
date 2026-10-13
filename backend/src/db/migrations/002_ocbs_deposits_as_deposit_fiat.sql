-- 002 — Depósitos con tarjeta de Binance (OCBS) importados como IGNORED pasan
-- a DEPOSIT_FIAT (#169). Son la entrada de los EUR que se gastan en la compra
-- inmediata; al ignorarlos, los saldos y flujos de EUR los omitían.
-- Idempotente: solo afecta a filas que sigan como IGNORED. El motor FIFO no
-- procesa DEPOSIT_FIAT, así que no hace falta recalcular lotes.
-- Reversión: migrations/down/002_ocbs_deposits_as_deposit_fiat.sql
UPDATE transactions
SET operation_type = 'DEPOSIT_FIAT', updated_at = NOW()
WHERE operation_type = 'IGNORED'
  AND asset IN ('EUR', 'USD', 'GBP', 'CHF')
  AND notes IN ('Deposit Fiat OCBS', 'Fiat OCBS - Add Fiat and Fees');
