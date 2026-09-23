-- ============================================================
-- Migración 005_binance_staking_wallet
-- Qué: añade la sub-cuenta de sistema "Binance Staking" a wallets, y de paso
--      el constraint UNIQUE en wallets.name si la BD es anterior a tenerlo.
-- Por qué: Binance reporta el staking en una sub-cuenta propia en el CSV
--          exportado; sin esta wallet predefinida, esas transacciones no
--          tenían dónde clasificarse igual que las demás sub-cuentas de
--          Binance (Spot, Funding, Margin...).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallets_name_unique' AND conrelid = 'wallets'::regclass
  ) THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_name_unique UNIQUE (name);
  END IF;
END $$;

INSERT INTO wallets (name, type, is_system, is_default, color)
VALUES ('Binance Staking', 'exchange', TRUE, FALSE, '#f59e0b')
ON CONFLICT (name) DO NOTHING;
