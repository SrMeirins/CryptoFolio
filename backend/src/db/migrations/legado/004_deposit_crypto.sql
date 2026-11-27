-- ============================================================
-- Migración 004_deposit_crypto
-- Qué: añade el valor DEPOSIT_CRYPTO al enum operation_type.
-- Por qué: solo existía DEPOSIT_FIAT (ingreso de euros desde el banco, sin
--          efecto fiscal). Recibir cripto desde una wallet externa propia
--          (hardware wallet, otra plataforma) es un caso distinto: abre un
--          lote FIFO nuevo con el precio histórico como coste de
--          adquisición, así que necesitaba su propio tipo.
-- ============================================================
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'DEPOSIT_CRYPTO' AFTER 'DEPOSIT_FIAT';
