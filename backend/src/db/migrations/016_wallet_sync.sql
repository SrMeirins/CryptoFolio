-- ============================================================
-- Migración 016_wallet_sync
-- Qué: crea network_api_keys (override cifrado de API keys por red) y
--      balance_sync_log (histórico de verificaciones de saldo on-chain).
-- Por qué: soporte de la verificación automática de saldos on-chain vs.
--          saldo calculado por el motor FIFO (diseño en
--          docs/superpowers/specs/2026-08-25-onchain-balance-verification-design.md).
-- ============================================================

CREATE TABLE IF NOT EXISTS network_api_keys (
  network_id         UUID PRIMARY KEY REFERENCES networks(id) ON DELETE CASCADE,
  api_key_encrypted  BYTEA NOT NULL,
  api_key_iv         BYTEA NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS balance_sync_log (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address_id  UUID NOT NULL REFERENCES wallet_addresses(id) ON DELETE CASCADE,
  asset              TEXT NOT NULL,
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  onchain_balance    NUMERIC,
  expected_balance   NUMERIC,
  discrepancy_pct    NUMERIC,
  status             TEXT NOT NULL CHECK (status IN ('ok', 'discrepancy', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_balance_sync_log_wallet_address
  ON balance_sync_log(wallet_address_id, checked_at DESC);
