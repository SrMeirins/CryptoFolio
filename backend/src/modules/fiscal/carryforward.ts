import { db } from '../../db/client';

// Compensación de pérdidas patrimoniales entre ejercicios (normativa española):
// las pérdidas compensan ganancias patrimoniales sin límite y rendimientos del
// capital mobiliario hasta el 25 % de los rendimientos positivos del año; las
// pendientes caducan a los 4 años. Extraída de /api/fiscal/carryforward para
// reutilizarla en el simulador de venta (#279) con exactamente la misma regla.

export interface AnioFiscal { year: number; netoGP: number; rendimientos: number }

export interface DetalleCompensacion {
  year: number;
  netoAntes: number;
  rendimientos: number;
  perdida: number;
  compensadoPatrim: number;
  compensadoRend: number;
  compensado: number;
  limiteRend25: number;
  netoDespues: number;
}

export function compensarPerdidas(rows: readonly AnioFiscal[]): { pendienteTotal: number; detalle: DetalleCompensacion[] } {
  type PendienteItem = { year: number; importe: number };
  let pendientes: PendienteItem[] = [];

  const detalle = rows.map(({ year, netoGP, rendimientos }) => {
    // Expirar pérdidas de hace más de 4 años
    pendientes = pendientes.filter(p => year - p.year <= 4);

    const perdidaEsteAnio  = netoGP < 0 ? Math.abs(netoGP) : 0;
    const gananciasPatrim  = netoGP > 0 ? netoGP : 0;

    // 1. Compensar pérdidas pendientes contra ganancias patrimoniales del año
    const pendienteTotalPatrim = pendientes.reduce((s, p) => s + p.importe, 0);
    const compensadoPatrim = Math.min(pendienteTotalPatrim, gananciasPatrim);
    const restanteGanancias = gananciasPatrim - compensadoPatrim;

    // Consumo FIFO de los pendientes (los más antiguos primero)
    let aConsumir = compensadoPatrim;
    for (const p of pendientes) {
      const consumido = Math.min(p.importe, aConsumir);
      p.importe -= consumido;
      aConsumir -= consumido;
      if (aConsumir <= 0) break;
    }
    pendientes = pendientes.filter(p => p.importe > 0.01);

    // 2. Compensar pérdidas pendientes restantes contra rendimientos (límite 25%)
    const limiteRendimientos = rendimientos > 0 ? rendimientos * 0.25 : 0;
    const pendienteTotalRend = pendientes.reduce((s, p) => s + p.importe, 0);
    const compensadoRend = Math.min(pendienteTotalRend, limiteRendimientos);

    aConsumir = compensadoRend;
    for (const p of pendientes) {
      const consumido = Math.min(p.importe, aConsumir);
      p.importe -= consumido;
      aConsumir -= consumido;
      if (aConsumir <= 0) break;
    }
    pendientes = pendientes.filter(p => p.importe > 0.01);

    // Acumular pérdida de este año
    if (perdidaEsteAnio > 0.01) pendientes.push({ year, importe: perdidaEsteAnio });

    return {
      year,
      netoAntes:        netoGP,
      rendimientos,
      perdida:          perdidaEsteAnio,
      compensadoPatrim,
      compensadoRend,
      compensado:       compensadoPatrim + compensadoRend,
      limiteRend25:     limiteRendimientos,
      netoDespues:      restanteGanancias,
    };
  });

  return { pendienteTotal: pendientes.reduce((s, p) => s + p.importe, 0), detalle };
}

/** Base del ahorro de un ejercicio tras compensar (misma fórmula que el panel Fiscal). */
export function baseAhorro(d: DetalleCompensacion): number {
  return d.netoDespues + (d.rendimientos - d.compensadoRend);
}

/** Neto G/P y rendimientos de los últimos 4 años y el actual. */
export async function cargarAniosFiscales(currentYear: number): Promise<AnioFiscal[]> {
  const rows: AnioFiscal[] = [];
  for (let y = currentYear - 4; y <= currentYear; y++) {
    const gpR = await db.query(`
      SELECT COALESCE(SUM(flc.gain_loss_eur), 0) AS neto
      FROM fifo_lot_consumptions flc
      WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
        AND flc.fiscal_event_type != 'NONE'
    `, [y]);
    const rendR = await db.query(`
      SELECT COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total
      FROM transactions t
      WHERE EXTRACT(YEAR FROM t.timestamp) = $1
        AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    `, [y]);
    rows.push({
      year: y,
      netoGP:       parseFloat(gpR.rows[0]?.neto ?? '0'),
      rendimientos: parseFloat(rendR.rows[0]?.total ?? '0'),
    });
  }
  return rows;
}
