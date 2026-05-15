-- ============================================================
-- CryptoTracker — Schema PostgreSQL
-- Versión: 1.0
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE operation_type AS ENUM (
  -- Operativas propias del usuario
  'BUY',              -- Compra de cripto (con EUR o USDC)
  'SELL',             -- Venta de cripto a EUR o USDC
  'CONVERT_IN',       -- Recepción de una conversión (EUR→USDC, USDC→BNB)
  'CONVERT_OUT',      -- Gasto en una conversión
  'DEPOSIT_FIAT',     -- Ingreso de EUR en Binance
  'WITHDRAW',         -- Retirada a wallet externa (Tangem)
  'FEE',              -- Fee de red o de operación
  -- Internas Binance (sin efecto fiscal)
  'INTERNAL_TRANSFER',-- Transfer Main↔Funding wallet
  -- Ignoradas
  'IGNORED'           -- Asset Recovery NFT, etc.
);

CREATE TYPE wallet_type AS ENUM (
  'BINANCE',
  'TANGEM',
  'MANUAL'
);

CREATE TYPE fiscal_event_type AS ENUM (
  'GAIN',   -- Ganancia patrimonial
  'LOSS',   -- Pérdida patrimonial
  'NONE'    -- Sin evento fiscal (depósito, transferencia interna)
);

-- ============================================================
-- TABLA: csv_imports
-- Registro de cada CSV importado para evitar duplicados
-- ============================================================
CREATE TABLE csv_imports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename      TEXT NOT NULL,
  file_hash     TEXT NOT NULL UNIQUE, -- SHA-256 del contenido del archivo
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_count     INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0, -- Filas ignoradas (duplicadas, internas)
  notes         TEXT
);

-- ============================================================
-- TABLA: raw_transactions
-- Cada fila del CSV de Binance, tal cual, antes de interpretar
-- ============================================================
CREATE TABLE raw_transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id     UUID NOT NULL REFERENCES csv_imports(id) ON DELETE CASCADE,
  -- Columnas exactas del CSV de Binance
  user_id       TEXT NOT NULL,
  time          TIMESTAMPTZ NOT NULL,
  account       TEXT NOT NULL,         -- 'Spot' | 'Funding'
  operation     TEXT NOT NULL,         -- Valor exacto del CSV
  coin          TEXT NOT NULL,
  change        NUMERIC(30, 10) NOT NULL,
  remark        TEXT,
  -- Control de duplicados: hash de (user_id+time+account+operation+coin+change+remark)
  row_hash      TEXT NOT NULL,
  -- Referencia a la transacción interpretada (se llena después del parseo)
  transaction_id UUID,
  UNIQUE(row_hash)
);

CREATE INDEX idx_raw_transactions_time ON raw_transactions(time);
CREATE INDEX idx_raw_transactions_import ON raw_transactions(import_id);

-- ============================================================
-- TABLA: transactions
-- Operaciones interpretadas y normalizadas
-- Una transacción puede agrupar N filas raw del mismo timestamp
-- ============================================================
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id       UUID REFERENCES csv_imports(id) ON DELETE SET NULL,
  -- Identificación
  operation_type  operation_type NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL,
  -- Activo principal
  asset           TEXT NOT NULL,           -- 'XRP', 'USDC', 'EUR', etc.
  amount          NUMERIC(30, 10) NOT NULL, -- Cantidad bruta (sin fees)
  amount_net      NUMERIC(30, 10) NOT NULL, -- Cantidad neta (después de fees en mismo activo)
  -- Coste / contrapartida
  cost_asset      TEXT,                    -- Activo con el que se pagó ('EUR', 'USDC')
  cost_amount     NUMERIC(30, 10),         -- Cantidad pagada en cost_asset
  -- Precio unitario calculado
  price_per_unit  NUMERIC(30, 10),         -- cost_amount / amount en cost_asset
  price_eur       NUMERIC(30, 10),         -- Precio unitario en EUR (puede requerir conversión USDC→EUR)
  -- Fees
  fee_asset       TEXT,                    -- 'BNB', 'XRP', etc.
  fee_amount      NUMERIC(30, 10),         -- Cantidad de fee
  fee_eur         NUMERIC(30, 10),         -- Equivalente en EUR de la fee (para deducción fiscal)
  -- Wallet
  wallet          wallet_type NOT NULL DEFAULT 'BINANCE',
  account         TEXT,                    -- 'Spot' | 'Funding'
  -- Agrupación de órdenes parciales (mismo timestamp, mismo par)
  group_key       TEXT,                    -- timestamp::asset::cost_asset para agrupar sub-trades
  sub_trade_count INTEGER NOT NULL DEFAULT 1, -- Nº de sub-trades que componen esta transacción
  -- Metadatos
  notes           TEXT,
  manually_added  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX idx_transactions_asset ON transactions(asset);
CREATE INDEX idx_transactions_type ON transactions(operation_type);
CREATE INDEX idx_transactions_wallet ON transactions(wallet);

-- ============================================================
-- TABLA: fifo_lots
-- Lotes FIFO abiertos por cada activo
-- Se abre un lote con cada compra, se cierra (parcial o total) con cada venta/gasto
-- ============================================================
CREATE TABLE fifo_lots (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Lote
  asset             TEXT NOT NULL,
  -- Cantidad original del lote
  quantity_original NUMERIC(30, 10) NOT NULL,
  -- Cantidad restante sin consumir
  quantity_remaining NUMERIC(30, 10) NOT NULL,
  -- Coste base del lote en EUR (precio de adquisición total)
  cost_basis_eur    NUMERIC(30, 10) NOT NULL,
  -- Precio unitario en EUR en el momento de la compra
  price_per_unit_eur NUMERIC(30, 10) NOT NULL,
  -- Fees incluidas en el coste base
  fee_eur           NUMERIC(30, 10) NOT NULL DEFAULT 0,
  -- Referencia a la transacción que abrió el lote
  open_transaction_id UUID NOT NULL REFERENCES transactions(id),
  opened_at         TIMESTAMPTZ NOT NULL,
  -- Si el lote está completamente consumido
  closed_at         TIMESTAMPTZ,
  is_closed         BOOLEAN NOT NULL DEFAULT FALSE,
  -- Wallet donde está este lote
  wallet            wallet_type NOT NULL DEFAULT 'BINANCE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fifo_lots_asset ON fifo_lots(asset);
CREATE INDEX idx_fifo_lots_asset_open ON fifo_lots(asset, is_closed, opened_at);
CREATE INDEX idx_fifo_lots_wallet ON fifo_lots(wallet);

-- ============================================================
-- TABLA: fifo_lot_consumptions
-- Registro de cada vez que se consume (parcialmente) un lote FIFO
-- ============================================================
CREATE TABLE fifo_lot_consumptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id                UUID NOT NULL REFERENCES fifo_lots(id),
  -- Transacción que consume el lote (venta, fee, conversión)
  consuming_transaction_id UUID NOT NULL REFERENCES transactions(id),
  quantity_consumed     NUMERIC(30, 10) NOT NULL,
  -- Coste base proporcional consumido (para calcular G/P)
  cost_basis_consumed_eur NUMERIC(30, 10) NOT NULL,
  -- Valor de venta proporcional en EUR
  proceeds_eur          NUMERIC(30, 10) NOT NULL,
  -- Ganancia/pérdida de este consumo parcial
  gain_loss_eur         NUMERIC(30, 10) NOT NULL, -- proceeds - cost_basis
  fiscal_event_type     fiscal_event_type NOT NULL,
  consumed_at           TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consumptions_lot ON fifo_lot_consumptions(lot_id);
CREATE INDEX idx_consumptions_transaction ON fifo_lot_consumptions(consuming_transaction_id);
CREATE INDEX idx_consumptions_date ON fifo_lot_consumptions(consumed_at);

-- ============================================================
-- TABLA: price_cache
-- Caché de precios históricos y actuales en EUR
-- Se usa para: calcular G/P cuando se paga en USDC, valorar fees BNB
-- ============================================================
CREATE TABLE price_cache (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset       TEXT NOT NULL,
  price_eur   NUMERIC(30, 10) NOT NULL,
  source      TEXT NOT NULL DEFAULT 'coingecko', -- 'coingecko' | 'manual' | 'binance_ws'
  -- Para precios históricos: fecha exacta
  price_date  DATE,
  -- Para precios en tiempo real: timestamp
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset, price_date)           -- Un precio histórico por activo por día
);

CREATE INDEX idx_price_cache_asset ON price_cache(asset, price_date DESC);

-- ============================================================
-- TABLA: portfolio_snapshots
-- Snapshots del portfolio a 31/12 de cada año (para Modelo 721)
-- Se generan automáticamente al calcular el informe fiscal
-- ============================================================
CREATE TABLE portfolio_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_date   DATE NOT NULL,
  asset           TEXT NOT NULL,
  quantity        NUMERIC(30, 10) NOT NULL,
  price_eur       NUMERIC(30, 10) NOT NULL,
  value_eur       NUMERIC(30, 10) NOT NULL,
  wallet          wallet_type NOT NULL,
  -- Para el 721: si supera 50.000€ el conjunto total
  modelo721_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_date, asset, wallet)
);

-- ============================================================
-- TABLA: manual_transactions
-- Transferencias añadidas manualmente desde la UI
-- (ej: movimientos Tangem que no aparecen en Binance)
-- ============================================================
CREATE TABLE manual_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_type  operation_type NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL,
  asset           TEXT NOT NULL,
  amount          NUMERIC(30, 10) NOT NULL,
  from_wallet     wallet_type,
  to_wallet       wallet_type,
  price_eur       NUMERIC(30, 10),   -- Precio unitario en EUR en ese momento
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Se enlaza con transactions cuando se procesa
  transaction_id  UUID REFERENCES transactions(id)
);

-- ============================================================
-- VISTA: v_portfolio_current
-- Balance actual por activo y wallet (calculado desde FIFO lots)
-- ============================================================
CREATE OR REPLACE VIEW v_portfolio_current AS
SELECT
  asset,
  wallet,
  SUM(quantity_remaining) AS quantity,
  SUM(cost_basis_eur * (quantity_remaining / quantity_original)) AS cost_basis_eur,
  AVG(price_per_unit_eur) AS avg_buy_price_eur
FROM fifo_lots
WHERE is_closed = FALSE
  AND quantity_remaining > 0
GROUP BY asset, wallet
ORDER BY asset, wallet;

-- ============================================================
-- VISTA: v_fiscal_year
-- Resumen de G/P por año fiscal (para IRPF)
-- ============================================================
CREATE OR REPLACE VIEW v_fiscal_year AS
SELECT
  EXTRACT(YEAR FROM consumed_at)::INTEGER AS fiscal_year,
  SUM(gain_loss_eur) AS total_gain_loss_eur,
  SUM(CASE WHEN gain_loss_eur > 0 THEN gain_loss_eur ELSE 0 END) AS total_gains_eur,
  SUM(CASE WHEN gain_loss_eur < 0 THEN gain_loss_eur ELSE 0 END) AS total_losses_eur,
  COUNT(*) AS num_operations
FROM fifo_lot_consumptions
GROUP BY fiscal_year
ORDER BY fiscal_year;

-- ============================================================
-- FUNCIÓN: update_updated_at
-- Trigger para actualizar updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- CoinGecko IDs para los activos que aparecen en el CSV
-- (necesarios para consultar precios históricos)
CREATE TABLE asset_metadata (
  symbol          TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  coingecko_id    TEXT,              -- ID exacto en CoinGecko
  is_stablecoin   BOOLEAN NOT NULL DEFAULT FALSE,
  decimals        INTEGER NOT NULL DEFAULT 8
);

INSERT INTO asset_metadata (symbol, name, coingecko_id, is_stablecoin) VALUES
  ('BTC',  'Bitcoin',         'bitcoin',            FALSE),
  ('ETH',  'Ethereum',        'ethereum',           FALSE),
  ('XRP',  'XRP',             'ripple',             FALSE),
  ('ADA',  'Cardano',         'cardano',            FALSE),
  ('DOT',  'Polkadot',        'polkadot',           FALSE),
  ('LINK', 'Chainlink',       'chainlink',          FALSE),
  ('HBAR', 'Hedera',          'hedera-hashgraph',   FALSE),
  ('XLM',  'Stellar',         'stellar',            FALSE),
  ('WIF',  'dogwifhat',       'dogwifcoin',         FALSE),
  ('PYTH', 'Pyth Network',    'pyth-network',       FALSE),
  ('ONDO', 'Ondo Finance',    'ondo-finance',       FALSE),
  ('BNB',  'BNB',             'binancecoin',        FALSE),
  ('USDC', 'USD Coin',        'usd-coin',           TRUE),
  ('USDT', 'Tether',          'tether',             TRUE),
  ('EUR',  'Euro',            NULL,                 TRUE);
