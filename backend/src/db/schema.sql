-- ============================================================
-- CryptoFolio — Schema PostgreSQL
-- Version: 3.0 — Wallets unificadas (FK, sin enum wallet_type)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE operation_type AS ENUM (
  'BUY', 'SELL',
  'BUY_FIAT', 'BUY_CRYPTO',
  'SELL_FIAT', 'SELL_CRYPTO',
  'CONVERT_IN', 'CONVERT_OUT',
  'DEPOSIT_FIAT', 'DEPOSIT_CRYPTO',
  'WITHDRAW_FIAT',
  'WITHDRAW',
  'FEE', 'FEE_NETWORK', 'FEE_EXCHANGE',
  'INTERNAL_TRANSFER',
  'TRANSFER_INTERNAL',
  'STAKING_REWARD', 'MINING_REWARD',
  'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK',
  'AIRDROP', 'FORK',
  'GIFT_SENT', 'LOST',
  'IGNORED'
);

CREATE TYPE fiscal_event_type AS ENUM (
  'GAIN',
  'LOSS',
  'NONE'
);

CREATE TYPE wallet_kind AS ENUM (
  'exchange',
  'hardware',
  'software',
  'bank'
);

-- ============================================================
-- TABLA: networks
-- ============================================================
CREATE TABLE networks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL UNIQUE,
  native_asset     TEXT NOT NULL,
  explorer_url     TEXT,
  explorer_tx_url  TEXT,
  is_predefined    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO networks (name, native_asset, explorer_url, explorer_tx_url, is_predefined) VALUES
  ('XRP Ledger', 'XRP',  'https://livenet.xrpl.org/accounts/{address}',              'https://livenet.xrpl.org/transactions/{tx_hash}',        TRUE),
  ('Ethereum',   'ETH',  'https://etherscan.io/address/{address}',                   'https://etherscan.io/tx/{tx_hash}',                       TRUE),
  ('Solana',     'SOL',  'https://explorer.solana.com/address/{address}',             'https://explorer.solana.com/tx/{tx_hash}',                TRUE),
  ('BNB Chain',  'BNB',  'https://bscscan.com/address/{address}',                    'https://bscscan.com/tx/{tx_hash}',                        TRUE),
  ('Cardano',    'ADA',  'https://cardanoscan.io/address/{address}',                 'https://cardanoscan.io/tx/{tx_hash}',                     TRUE),
  ('HBAR',       'HBAR', 'https://hashscan.io/mainnet/account/{address}',            'https://hashscan.io/mainnet/transaction/{tx_hash}',       TRUE),
  ('Stellar',    'XLM',  'https://stellar.expert/explorer/public/account/{address}', 'https://stellar.expert/explorer/public/tx/{tx_hash}',    TRUE),
  ('Polkadot Asset Hub', 'DOT',  'https://assethub-polkadot.subscan.io/account/{address}',           'https://assethub-polkadot.subscan.io/extrinsic/{tx_hash}',       TRUE),
  ('Bitcoin',            'BTC',  'https://blockstream.info/address/{address}',                        'https://blockstream.info/tx/{tx_hash}',                          TRUE),
  ('Avalanche',          'AVAX', 'https://snowtrace.io/address/{address}',                            'https://snowtrace.io/tx/{tx_hash}',                              TRUE),
  ('Tron',               'TRX',  'https://tronscan.org/#/address/{address}',                          'https://tronscan.org/#/transaction/{tx_hash}',                   TRUE);

-- ============================================================
-- TABLA: network_assets
-- ============================================================
CREATE TABLE network_assets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  network_id       UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  asset            TEXT NOT NULL,
  contract_address TEXT,
  is_predefined    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(network_id, asset)
);

INSERT INTO network_assets (network_id, asset, contract_address, is_predefined)
SELECT id, 'LINK', '0x514910771AF9Ca656af840dff83E8264EcF986CA', TRUE FROM networks WHERE name = 'Ethereum';
INSERT INTO network_assets (network_id, asset, contract_address, is_predefined)
SELECT id, 'USDC', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', TRUE FROM networks WHERE name = 'Ethereum';
INSERT INTO network_assets (network_id, asset, contract_address, is_predefined)
SELECT id, 'ONDO', '0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3', TRUE FROM networks WHERE name = 'Ethereum';
INSERT INTO network_assets (network_id, asset, contract_address, is_predefined)
SELECT id, 'WIF',  NULL, TRUE FROM networks WHERE name = 'Solana';
INSERT INTO network_assets (network_id, asset, contract_address, is_predefined)
SELECT id, 'PYTH', NULL, TRUE FROM networks WHERE name = 'Solana';

-- ============================================================
-- TABLA: wallets
-- ============================================================
CREATE TABLE wallets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  type         wallet_kind NOT NULL,
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  color        TEXT NOT NULL DEFAULT '#6366f1',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wallet de sistema para activos retirados a wallets externas no rastreadas
INSERT INTO wallets (name, type, is_system, is_default, color, notes)
VALUES ('Wallets externas', 'software', TRUE, FALSE, '#6b7280',
  'Activos retirados a wallets no registradas en esta app (MetaMask, otros exchanges, etc.)');

-- Sub-cuentas de Binance (no borrables). Una por cada tipo de cuenta del CSV exportado.
INSERT INTO wallets (name, type, is_system, is_default, color) VALUES
  ('Binance Spot',             'exchange', TRUE, TRUE,  '#F0B90B'),
  ('Binance Funding',          'exchange', TRUE, FALSE, '#F0B90B'),
  ('Binance Cross Margin',     'exchange', TRUE, FALSE, '#E8892B'),
  ('Binance Isolated Margin',  'exchange', TRUE, FALSE, '#C8812B');

-- ============================================================
-- TABLA: wallet_addresses
-- ============================================================
CREATE TABLE wallet_addresses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id           UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  network_id          UUID REFERENCES networks(id),
  custom_network      TEXT,
  custom_explorer_url TEXT,
  address             TEXT,
  last_sync_at        TIMESTAMPTZ,
  last_known_balance  NUMERIC(30, 10),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_addresses_wallet  ON wallet_addresses(wallet_id);
CREATE INDEX idx_wallet_addresses_network ON wallet_addresses(network_id);

-- ============================================================
-- TABLA: csv_imports
-- ============================================================
CREATE TABLE csv_imports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename      TEXT NOT NULL,
  file_hash     TEXT NOT NULL UNIQUE,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_count     INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  notes         TEXT
);

-- ============================================================
-- TABLA: raw_transactions
-- ============================================================
CREATE TABLE raw_transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id      UUID NOT NULL REFERENCES csv_imports(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  time           TIMESTAMPTZ NOT NULL,
  account        TEXT NOT NULL,
  operation      TEXT NOT NULL,
  coin           TEXT NOT NULL,
  change         NUMERIC(30, 10) NOT NULL,
  remark         TEXT,
  row_hash       TEXT NOT NULL,
  transaction_id UUID,
  UNIQUE(row_hash)
);

CREATE INDEX idx_raw_transactions_time   ON raw_transactions(time);
CREATE INDEX idx_raw_transactions_import ON raw_transactions(import_id);

-- ============================================================
-- TABLA: transactions
-- wallet_id referencia la tabla wallets (sin enum hardcodeado)
-- destination_wallet_id: wallet destino para WITHDRAW/TRANSFER
-- destination_pending: true cuando el destino aún no se ha asignado
-- ============================================================
CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id             UUID REFERENCES csv_imports(id) ON DELETE SET NULL,
  operation_type        operation_type NOT NULL,
  timestamp             TIMESTAMPTZ NOT NULL,
  asset                 TEXT NOT NULL,
  amount                NUMERIC(30, 10) NOT NULL,
  amount_net            NUMERIC(30, 10) NOT NULL,
  cost_asset            TEXT,
  cost_amount           NUMERIC(30, 10),
  price_per_unit        NUMERIC(30, 10),
  price_eur             NUMERIC(30, 10),
  fee_asset             TEXT,
  fee_amount            NUMERIC(30, 10),
  fee_eur               NUMERIC(30, 10),
  wallet_id             UUID NOT NULL REFERENCES wallets(id),
  account               TEXT,
  notes                 TEXT,
  manually_added        BOOLEAN NOT NULL DEFAULT FALSE,
  destination_wallet_id UUID REFERENCES wallets(id),
  destination_pending   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX idx_transactions_asset     ON transactions(asset);
CREATE INDEX idx_transactions_type      ON transactions(operation_type);
CREATE INDEX idx_transactions_wallet    ON transactions(wallet_id);
CREATE INDEX idx_transactions_dest      ON transactions(destination_wallet_id);

-- ============================================================
-- TABLA: fifo_lots
-- wallet_id referencia la tabla wallets
-- ============================================================
CREATE TABLE fifo_lots (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset               TEXT NOT NULL,
  quantity_original   NUMERIC(30, 10) NOT NULL,
  quantity_remaining  NUMERIC(30, 10) NOT NULL,
  cost_basis_eur      NUMERIC(30, 10) NOT NULL,
  price_per_unit_eur  NUMERIC(30, 10) NOT NULL,
  fee_eur             NUMERIC(30, 10) NOT NULL DEFAULT 0,
  open_transaction_id UUID NOT NULL REFERENCES transactions(id),
  opened_at           TIMESTAMPTZ NOT NULL,
  closed_at           TIMESTAMPTZ,
  is_closed           BOOLEAN NOT NULL DEFAULT FALSE,
  wallet_id           UUID NOT NULL REFERENCES wallets(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fifo_lots_asset      ON fifo_lots(asset);
CREATE INDEX idx_fifo_lots_asset_open ON fifo_lots(asset, is_closed, opened_at);
CREATE INDEX idx_fifo_lots_wallet     ON fifo_lots(wallet_id);

-- ============================================================
-- TABLA: fifo_lot_consumptions
-- ============================================================
CREATE TABLE fifo_lot_consumptions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id                   UUID NOT NULL REFERENCES fifo_lots(id),
  consuming_transaction_id UUID NOT NULL REFERENCES transactions(id),
  quantity_consumed        NUMERIC(30, 10) NOT NULL,
  cost_basis_consumed_eur  NUMERIC(30, 10) NOT NULL,
  proceeds_eur             NUMERIC(30, 10) NOT NULL,
  gain_loss_eur            NUMERIC(30, 10) NOT NULL,
  fiscal_event_type        fiscal_event_type NOT NULL,
  consumed_at              TIMESTAMPTZ NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consumptions_lot         ON fifo_lot_consumptions(lot_id);
CREATE INDEX idx_consumptions_transaction ON fifo_lot_consumptions(consuming_transaction_id);
CREATE INDEX idx_consumptions_date        ON fifo_lot_consumptions(consumed_at);

-- ============================================================
-- TABLA: price_cache
-- ============================================================
CREATE TABLE price_cache (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset      TEXT NOT NULL,
  price_eur  NUMERIC(30, 10) NOT NULL,
  source     TEXT NOT NULL DEFAULT 'binance',
  price_date DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset, price_date)
);

CREATE INDEX idx_price_cache_asset ON price_cache(asset, price_date DESC);

-- ============================================================
-- TABLA: asset_metadata
-- ============================================================
CREATE TABLE asset_metadata (
  symbol             TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  coingecko_id       TEXT,
  is_stablecoin      BOOLEAN NOT NULL DEFAULT FALSE,
  decimals           INTEGER NOT NULL DEFAULT 8,
  binance_eur_pair   TEXT,
  binance_usdt_pair  TEXT,
  binance_btc_pair   TEXT,
  binance_eth_pair   TEXT,
  price_source       TEXT DEFAULT 'unknown',
  auto_detected      BOOLEAN DEFAULT FALSE,
  last_price_check   TIMESTAMPTZ
);

INSERT INTO asset_metadata (symbol, name, coingecko_id, is_stablecoin, binance_eur_pair, price_source) VALUES
  ('BTC',  'Bitcoin',      'bitcoin',          FALSE, 'BTCEUR',  'eur_direct'),
  ('ETH',  'Ethereum',     'ethereum',         FALSE, 'ETHEUR',  'eur_direct'),
  ('XRP',  'XRP',          'ripple',           FALSE, 'XRPEUR',  'eur_direct'),
  ('ADA',  'Cardano',      'cardano',          FALSE, 'ADAEUR',  'eur_direct'),
  ('DOT',  'Polkadot',     'polkadot',         FALSE, 'DOTEUR',  'eur_direct'),
  ('LINK', 'Chainlink',    'chainlink',        FALSE, 'LINKEUR', 'eur_direct'),
  ('XLM',  'Stellar',      'stellar',          FALSE, 'XLMEUR',  'eur_direct'),
  ('BNB',  'BNB',          'binancecoin',      FALSE, 'BNBEUR',  'eur_direct'),
  ('SOL',  'Solana',       'solana',           FALSE, 'SOLEUR',  'eur_direct');

INSERT INTO asset_metadata (symbol, name, coingecko_id, is_stablecoin, binance_usdt_pair, price_source) VALUES
  ('HBAR', 'Hedera',       'hedera-hashgraph', FALSE, 'HBARUSDT', 'usdt_proxy'),
  ('WIF',  'dogwifhat',    'dogwifcoin',       FALSE, 'WIFUSDT',  'usdt_proxy'),
  ('PYTH', 'Pyth Network', 'pyth-network',     FALSE, 'PYTHUSDT', 'usdt_proxy'),
  ('ONDO', 'Ondo Finance', 'ondo-finance',     FALSE, 'ONDOUSDT', 'usdt_proxy'),
  ('USDC', 'USD Coin',     'usd-coin',         TRUE,  'USDCUSDT', 'usdt_proxy');

INSERT INTO asset_metadata (symbol, name, coingecko_id, is_stablecoin, price_source) VALUES
  ('EUR',  'Euro',   NULL,          TRUE,  'fiat'),
  ('USDT', 'Tether', NULL,          TRUE,  'fiat'),
  ('LUNC', 'Terra Classic', 'terra-luna', FALSE, 'coingecko');

INSERT INTO asset_metadata (symbol, name, coingecko_id, is_stablecoin, binance_eth_pair, price_source) VALUES
  ('BETH', 'Binance ETH Staking', NULL, FALSE, 'BETHETH', 'eth_proxy');

-- ============================================================
-- VISTAS
-- ============================================================
CREATE OR REPLACE VIEW v_portfolio_current AS
SELECT
  fl.asset,
  fl.wallet_id,
  w.name  AS wallet_name,
  w.color AS wallet_color,
  w.type  AS wallet_kind,
  SUM(fl.quantity_remaining) AS quantity,
  SUM(fl.cost_basis_eur * (fl.quantity_remaining / NULLIF(fl.quantity_original, 0))) AS cost_basis_eur,
  AVG(fl.price_per_unit_eur) AS avg_buy_price_eur
FROM fifo_lots fl
JOIN wallets w ON w.id = fl.wallet_id
WHERE fl.is_closed = FALSE AND fl.quantity_remaining > 0
GROUP BY fl.asset, fl.wallet_id, w.name, w.color, w.type
ORDER BY fl.asset, w.name;

CREATE OR REPLACE VIEW v_fiscal_year AS
SELECT
  EXTRACT(YEAR FROM consumed_at)::INTEGER AS fiscal_year,
  SUM(gain_loss_eur) AS total_gain_loss_eur,
  SUM(CASE WHEN gain_loss_eur > 0 THEN gain_loss_eur ELSE 0 END) AS total_gains_eur,
  SUM(CASE WHEN gain_loss_eur < 0 THEN gain_loss_eur ELSE 0 END) AS total_losses_eur,
  COUNT(*) AS num_operations
FROM fifo_lot_consumptions
WHERE fiscal_event_type != 'NONE'
GROUP BY fiscal_year
ORDER BY fiscal_year;

-- ============================================================
-- TABLA: app_config
-- Configuración global de la aplicación (clave-valor)
-- ============================================================
CREATE TABLE app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_config (key, value) VALUES
  ('fiscal_method',        'fifo'),
  ('modelo721_threshold',  '50000'),
  ('fiscal_country',       'ES');

-- ============================================================
-- TRIGGERS
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
