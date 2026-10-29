// Resumen del estado FIFO (#454) para comparar antes y después de recalcular:
// lotes (y cuántos siguen abiertos), consumos, faltantes y plusvalía neta.

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export interface FifoSummary { lots: number; openLots: number; consumptions: number; shortfalls: number; netGainEur: number }

export async function fifoSummary(client: Queryable): Promise<FifoSummary> {
  const { rows } = await client.query(
    `SELECT (SELECT COUNT(*) FROM fifo_lots)                                  AS lots,
            (SELECT COUNT(*) FROM fifo_lots WHERE NOT is_closed)              AS open_lots,
            (SELECT COUNT(*) FROM fifo_lot_consumptions)                      AS consumptions,
            (SELECT COUNT(*) FROM fifo_shortfalls)                            AS shortfalls,
            (SELECT COALESCE(SUM(gain_loss_eur), 0) FROM fifo_lot_consumptions) AS net_gain`,
  );
  const r = rows[0];
  return {
    lots: Number(r.lots), openLots: Number(r.open_lots), consumptions: Number(r.consumptions),
    shortfalls: Number(r.shortfalls), netGainEur: Math.round(Number(r.net_gain) * 100) / 100,
  };
}

/** Diferencia campo a campo (después menos antes). */
export function summaryDiff(before: FifoSummary, after: FifoSummary): FifoSummary {
  return {
    lots: after.lots - before.lots,
    openLots: after.openLots - before.openLots,
    consumptions: after.consumptions - before.consumptions,
    shortfalls: after.shortfalls - before.shortfalls,
    netGainEur: Math.round((after.netGainEur - before.netGainEur) * 100) / 100,
  };
}
