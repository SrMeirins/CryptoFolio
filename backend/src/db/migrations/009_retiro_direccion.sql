-- 009 — Destino on-chain de los retiros (#320): dirección, red y hash de la
-- transacción cuando el CSV los trae (Bitvavo o el historial de retiradas de
-- Binance). Solo añade columnas nullable: compatible con el código anterior.
-- Idempotente. Reversión: migrations/down/009_retiro_direccion.sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS counterparty_address TEXT CHECK (char_length(counterparty_address) <= 128),
  ADD COLUMN IF NOT EXISTS counterparty_network_id UUID REFERENCES networks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tx_hash TEXT CHECK (char_length(tx_hash) <= 128);
