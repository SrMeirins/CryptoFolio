-- Reversión de 002: vuelve a marcar como IGNORED los depósitos OCBS migrados
-- (identificados por la etiqueta original del CSV en `notes`).
UPDATE transactions
SET operation_type = 'IGNORED', updated_at = NOW()
WHERE operation_type = 'DEPOSIT_FIAT'
  AND asset IN ('EUR', 'USD', 'GBP', 'CHF')
  AND notes IN ('Deposit Fiat OCBS', 'Fiat OCBS - Add Fiat and Fees');
