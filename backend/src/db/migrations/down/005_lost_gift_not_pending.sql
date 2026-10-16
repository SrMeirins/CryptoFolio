-- Reversión de 005: vuelve a aplicar la regla antigua del importador, que
-- marcaba como pendiente toda LOST/GIFT_SENT sin wallet de destino. Las filas
-- reclasificadas por el paso D del importador (o editadas a mano) ya estaban
-- en FALSE antes de 005 y no se distinguen: esta reversión las marca también.
-- Es aceptable porque el indicador no tiene efecto en estos tipos.
UPDATE transactions
SET destination_pending = TRUE, updated_at = NOW()
WHERE operation_type IN ('LOST', 'GIFT_SENT')
  AND destination_wallet_id IS NULL
  AND destination_pending = FALSE;
