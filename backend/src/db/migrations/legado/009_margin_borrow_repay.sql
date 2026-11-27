-- ============================================================
-- Migración 009_margin_borrow_repay
-- Qué: añade MARGIN_BORROW y MARGIN_REPAY al enum operation_type.
-- Por qué: los préstamos de margen no son una compra/venta normal.
--          MARGIN_BORROW abre un lote FIFO a precio de mercado (recibes
--          fondos prestados); MARGIN_REPAY lo cierra sin generar
--          ganancia/pérdida (es devolución de deuda, no una disposición
--          patrimonial).
-- ============================================================
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'MARGIN_BORROW';
ALTER TYPE operation_type ADD VALUE IF NOT EXISTS 'MARGIN_REPAY';
