-- Reversión de 007: vuelve a extraer el año fiscal en UTC.
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
