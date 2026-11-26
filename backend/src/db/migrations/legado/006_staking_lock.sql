-- ============================================================
-- Migración 006_staking_lock
-- Qué: añade el valor STAKING_LOCK al enum operation_type.
-- Por qué: Binance reporta "Staking Purchase" y las suscripciones a Simple
--          Earn (Flexible/Locked) como movimientos Spot→Earn. No es una
--          venta ni un evento fiscal, solo un bloqueo de fondos — necesitaba
--          su propio tipo para no confundirlo con SELL.
-- ============================================================
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'STAKING_LOCK' AFTER 'TRANSFER_INTERNAL';
