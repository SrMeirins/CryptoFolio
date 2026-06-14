-- Añadir UNIQUE constraint en wallets.name si no existe
-- (necesaria para el ON CONFLICT de abajo y para bases de datos anteriores)
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
