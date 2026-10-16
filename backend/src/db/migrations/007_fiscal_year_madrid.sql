-- 007 — Año fiscal de v_fiscal_year en hora de Madrid (#295). Antes se
-- extraía en UTC: una operación el 1 de enero entre las 00:00 y la 01:00
-- (02:00 en verano) contaba en el ejercicio anterior. Idempotente.
-- Reversión: migrations/down/007_fiscal_year_madrid.sql
CREATE OR REPLACE VIEW v_fiscal_year AS
SELECT
  EXTRACT(YEAR FROM consumed_at AT TIME ZONE 'Europe/Madrid')::INTEGER AS fiscal_year,
  SUM(gain_loss_eur) AS total_gain_loss_eur,
  SUM(CASE WHEN gain_loss_eur > 0 THEN gain_loss_eur ELSE 0 END) AS total_gains_eur,
  SUM(CASE WHEN gain_loss_eur < 0 THEN gain_loss_eur ELSE 0 END) AS total_losses_eur,
  COUNT(*) AS num_operations
FROM fifo_lot_consumptions
WHERE fiscal_event_type != 'NONE'
GROUP BY fiscal_year
ORDER BY fiscal_year;
