-- 014 — Déficits del motor FIFO (#380): operaciones que pidieron más cantidad
-- de la que había en lotes (señal de importación incompleta). El motor la
-- vacía y la rehace en cada ejecución, como los lotes. Idempotente.
-- Reversión: migrations/down/014_fifo_shortfalls.sql
CREATE TABLE IF NOT EXISTS fifo_shortfalls (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  asset          TEXT NOT NULL CHECK (char_length(asset) <= 32),
  wallet_id      UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  requested      NUMERIC(38, 18) NOT NULL CHECK (requested > 0),
  missing        NUMERIC(38, 18) NOT NULL CHECK (missing > 0 AND missing <= requested),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_shortfalls_tx    ON fifo_shortfalls(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fifo_shortfalls_asset ON fifo_shortfalls(asset);
