-- Préstamos de margen: MARGIN_BORROW abre lote a precio de mercado,
-- MARGIN_REPAY cierra el lote sin ganancia (devolución de deuda, no disposición).
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'MARGIN_BORROW';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'MARGIN_REPAY';
