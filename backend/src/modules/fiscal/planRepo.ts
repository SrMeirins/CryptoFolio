import { db } from '../../db/client';
import { FIFO_DUST_EPSILON } from '../fifo/constants';
import type { LotePlan } from './planVentas';

// Plan de ventas guardado (#546) y lo que necesita su simulación: lotes
// abiertos de los activos del plan en orden FIFO global y compras reales de
// los últimos 2 meses (regla de recompra). La comisión estimada vive en
// app_config, editable en el plan y en Ajustes > Fiscal.

export const COMISION_PLAN_KEY = 'plan_comision_pct';
export const COMISION_PLAN_DEFECTO = 0.1;
export const MAX_VENTAS_PLAN = 50;

export interface VentaGuardada { asset: string; walletId: string; walletNombre: string; cantidad: number; precioEur: number | null }

export async function leerPlan(ejercicio: number): Promise<VentaGuardada[]> {
  const r = await db.query(
    `SELECT p.asset, p.wallet_id, w.name AS wallet_nombre, p.cantidad::float AS cantidad, p.precio_eur::float AS precio_eur
     FROM plan_ventas p JOIN wallets w ON w.id = p.wallet_id
     WHERE p.ejercicio = $1 ORDER BY p.orden`, [ejercicio]);
  return r.rows.map((x: Record<string, unknown>) => ({
    asset: x.asset as string, walletId: x.wallet_id as string, walletNombre: x.wallet_nombre as string,
    cantidad: x.cantidad as number, precioEur: (x.precio_eur as number | null) ?? null,
  }));
}

/** Sustituye el plan del ejercicio entero (orden incluido). */
export async function guardarPlan(ejercicio: number, ventas: readonly Omit<VentaGuardada, 'walletNombre'>[]): Promise<void> {
  await db.transaction(async client => {
    await client.query('DELETE FROM plan_ventas WHERE ejercicio = $1', [ejercicio]);
    for (const [orden, v] of ventas.entries()) {
      await client.query(
        'INSERT INTO plan_ventas (ejercicio, orden, asset, wallet_id, cantidad, precio_eur) VALUES ($1, $2, $3, $4, $5, $6)',
        [ejercicio, orden, v.asset, v.walletId, v.cantidad, v.precioEur]);
    }
  });
}

export async function vaciarPlan(ejercicio: number): Promise<number> {
  const r = await db.query('DELETE FROM plan_ventas WHERE ejercicio = $1', [ejercicio]);
  return r.rowCount ?? 0;
}

/** Planes de otros ejercicios que siguen guardados (archivados), con su número de ventas. */
export async function planesArchivados(ejercicioActual: number): Promise<{ ejercicio: number; ventas: number }[]> {
  const r = await db.query(
    `SELECT ejercicio, count(*)::int AS ventas FROM plan_ventas WHERE ejercicio <> $1 GROUP BY ejercicio ORDER BY ejercicio DESC`,
    [ejercicioActual]);
  return r.rows;
}

export async function getComisionPlan(): Promise<number> {
  const r = await db.query('SELECT value FROM app_config WHERE key = $1', [COMISION_PLAN_KEY]);
  const v = Number(r.rows[0]?.value);
  return Number.isFinite(v) && v >= 0 && v <= 10 ? v : COMISION_PLAN_DEFECTO;
}

/** Lotes abiertos de los activos dados, en orden FIFO global por activo (#476). */
export async function lotesDePlan(assets: readonly string[]): Promise<LotePlan[]> {
  const r = await db.query(
    `SELECT fl.id, fl.asset, fl.wallet_id, w.name AS wallet_name, fl.opened_at,
            fl.quantity_remaining::float AS quantity, fl.cost_basis_eur::float AS cost_basis, fl.price_per_unit_eur::float AS price_per_unit
     FROM fifo_lots fl JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.asset = ANY($1) AND fl.is_closed = FALSE AND fl.quantity_remaining > $2
     ORDER BY fl.asset, fl.opened_at ASC, fl.created_at ASC`, [assets, FIFO_DUST_EPSILON]);
  return r.rows.map((x: Record<string, unknown>) => ({
    id: x.id as string, asset: x.asset as string, walletId: x.wallet_id as string, walletName: x.wallet_name as string,
    openedAt: new Date(x.opened_at as string).toISOString().slice(0, 10),
    quantity: x.quantity as number, costBasis: x.cost_basis as number, pricePerUnit: x.price_per_unit as number,
  }));
}

/** Compras reales (no traspasos ni préstamos) de cada activo en los últimos 2 meses: regla de recompra, art. 33.5 LIRPF. */
export async function comprasRecientesReales(assets: readonly string[]): Promise<Record<string, string[]>> {
  const r = await db.query(
    `SELECT DISTINCT fl.asset, to_char(fl.opened_at, 'YYYY-MM-DD') AS fecha
     FROM fifo_lots fl JOIN transactions t ON t.id = fl.open_transaction_id
     WHERE fl.asset = ANY($1)
       AND t.operation_type NOT IN ('TRANSFER_INTERNAL', 'WITHDRAW', 'DEPOSIT_CRYPTO', 'MARGIN_BORROW')
       AND fl.opened_at >= NOW() - INTERVAL '2 months'
     ORDER BY fl.asset, fecha DESC`, [assets]);
  const out: Record<string, string[]> = {};
  for (const x of r.rows as { asset: string; fecha: string }[]) (out[x.asset] ??= []).push(x.fecha);
  return out;
}
