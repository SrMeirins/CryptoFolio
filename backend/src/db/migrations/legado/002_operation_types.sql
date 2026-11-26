-- ============================================================
-- Migración 002_operation_types
-- Qué: amplía el enum operation_type con 15 tipos nuevos del catálogo de
--      operaciones (compras/ventas en fiat y cripto, airdrops, staking,
--      minería, intereses, comisiones de red/exchange, transferencias
--      internas, regalos enviados, pérdidas...) y añade 3 columnas a
--      transactions.
-- Por qué: el esquema base solo tenía BUY/SELL/WITHDRAW/FEE genéricos; el
--          catálogo de operaciones (modules/operations/catalog.ts) necesita
--          un tipo específico por operación de Binance para aplicar el
--          tratamiento fiscal correcto a cada una.
-- Nota: las 3 columnas de más abajo (fiscal_treatment, fifo_effect,
--       catalog_type) nunca llegaron a usarse — se eliminan en
--       012_drop_dead_columns. Se dejan aquí tal cual porque esta migración
--       ya está aplicada en instalaciones existentes y no se edita
--       retroactivamente.
-- ============================================================
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'BUY_FIAT';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'BUY_CRYPTO';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'AIRDROP';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'STAKING_REWARD';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'MINING_REWARD';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'LENDING_INTEREST';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'CASHBACK';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'FORK';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'SELL_FIAT';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'SELL_CRYPTO';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'GIFT_SENT';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'LOST';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'TRANSFER_INTERNAL';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'FEE_NETWORK';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'FEE_EXCHANGE';

-- Columnas muertas, ver nota de cabecera (eliminadas en 012_drop_dead_columns)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS fiscal_treatment TEXT,
  ADD COLUMN IF NOT EXISTS fifo_effect TEXT,
  ADD COLUMN IF NOT EXISTS catalog_type TEXT;  -- ID del catálogo usado
