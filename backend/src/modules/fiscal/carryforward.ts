import { db } from '../../db/client';
import { getAppTimezone } from '../time/appTimezone';
import { ANIOS_COMPENSACION, type AnioFiscal } from './compensacion';

// Carga de los ejercicios para la compensación de pérdidas (#305). La lógica
// pura vive en compensacion.ts (sin base de datos); se reexporta aquí para no
// cambiar a quien ya la importaba.
export { baseAhorro, compensarPerdidas, ANIOS_COMPENSACION, type AnioFiscal, type DetalleCompensacion, type OrigenPerdida } from './compensacion';

/**
 * Neto G/P y rendimientos de cada ejercicio, desde el primero con datos hasta
 * el actual (#305). Antes se cargaban solo los 4 últimos y el actual: una
 * pérdida anterior a esa ventana, aún vigente, no se tenía en cuenta.
 */
export async function cargarAniosFiscales(currentYear: number): Promise<AnioFiscal[]> {
  // Ejercicio en la zona de la aplicación (#388), como parámetro SQL.
  const tz = await getAppTimezone(db);
  const gp = await db.query(`
    SELECT EXTRACT(YEAR FROM flc.consumed_at AT TIME ZONE $1)::int AS year,
           COALESCE(SUM(flc.gain_loss_eur), 0) AS neto
    FROM fifo_lot_consumptions flc
    WHERE flc.fiscal_event_type != 'NONE'
    GROUP BY 1
  `, [tz]);
  const rend = await db.query(`
    SELECT EXTRACT(YEAR FROM t.timestamp AT TIME ZONE $1)::int AS year,
           COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total
    FROM transactions t
    WHERE t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    GROUP BY 1
  `, [tz]);
  const netoPorAnio = new Map<number, number>(gp.rows.map((r: { year: number; neto: string }) => [r.year, parseFloat(r.neto)]));
  const rendPorAnio = new Map<number, number>(rend.rows.map((r: { year: number; total: string }) => [r.year, parseFloat(r.total)]));
  const conDatos = [...netoPorAnio.keys(), ...rendPorAnio.keys()].filter(y => y <= currentYear);
  const desde = Math.min(currentYear - ANIOS_COMPENSACION, ...conDatos);

  const rows: AnioFiscal[] = [];
  for (let y = desde; y <= currentYear; y++) {
    rows.push({ year: y, netoGP: netoPorAnio.get(y) ?? 0, rendimientos: rendPorAnio.get(y) ?? 0 });
  }
  return rows;
}
