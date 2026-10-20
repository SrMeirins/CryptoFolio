-- Reversión de 009: elimina el destino on-chain de los retiros.
ALTER TABLE transactions
  DROP COLUMN IF EXISTS tx_hash,
  DROP COLUMN IF EXISTS counterparty_network_id,
  DROP COLUMN IF EXISTS counterparty_address;
