-- ============================================================
-- Migración 008_launchpool_lock
-- Qué: añade LAUNCHPOOL_LOCK y LAUNCHPOOL_UNLOCK al enum operation_type.
-- Por qué: mismo caso que STAKING_LOCK/UNLOCK (migraciones 006/007) pero
--          para Launchpool — Binance reporta "Launchpool Subscription" y
--          "Launchpool Redemption" como su propio par lock/unlock,
--          distinto del staking normal.
-- ============================================================
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'LAUNCHPOOL_LOCK'   AFTER 'STAKING_UNLOCK';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'LAUNCHPOOL_UNLOCK' AFTER 'LAUNCHPOOL_LOCK';
