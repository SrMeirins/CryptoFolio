import { db } from '../../db/client';
import type { CrearAlerta, EditarAlerta } from './alertasSchema';
import type { Repeticion, Sentido } from './evaluacion';

// Acceso a la tabla alertas (#519). Consultas parametrizadas; los nombres de
// columna de los cambios salen de una lista fija, nunca de la petición.

export interface Alerta {
  id: string
  tipo: 'precio' | 'cartera'
  activo: string | null
  sentido: Sentido | null
  precio: number | null
  moneda: 'EUR' | 'USD'
  repeticion: Repeticion
  umbral_pct: number | null
  activa: boolean
  armada: boolean
  ultimo_disparo_at: Date | null
  ultimo_valor: number | null
  created_at: Date
}

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const fila = (r: Fila): Alerta => ({
  id: String(r.id),
  tipo: r.tipo as Alerta['tipo'],
  activo: (r.activo as string | null) ?? null,
  sentido: (r.sentido as Sentido | null) ?? null,
  precio: num(r.precio),
  moneda: r.moneda as Alerta['moneda'],
  repeticion: r.repeticion as Repeticion,
  umbral_pct: num(r.umbral_pct),
  activa: Boolean(r.activa),
  armada: Boolean(r.armada),
  ultimo_disparo_at: (r.ultimo_disparo_at as Date | null) ?? null,
  ultimo_valor: num(r.ultimo_valor),
  created_at: r.created_at as Date,
});

export async function listarAlertas(): Promise<Alerta[]> {
  const { rows } = await db.query(`SELECT * FROM alertas ORDER BY tipo DESC, created_at, id`);
  return rows.map(fila);
}

export async function activoExiste(symbol: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM asset_metadata WHERE symbol = $1`, [symbol]);
  return rows.length > 0;
}

export async function crearAlerta(a: CrearAlerta): Promise<Alerta> {
  const { rows } = a.tipo === 'precio'
    ? await db.query(
      `INSERT INTO alertas (tipo, activo, sentido, precio, moneda, repeticion) VALUES ('precio', $1, $2, $3, $4, $5) RETURNING *`,
      [a.activo, a.sentido, a.precio, a.moneda, a.repeticion])
    : await db.query(`INSERT INTO alertas (tipo, umbral_pct) VALUES ('cartera', $1) RETURNING *`, [a.umbral_pct]);
  return fila(rows[0]);
}

const EDITABLES = ['activa', 'sentido', 'precio', 'moneda', 'repeticion', 'umbral_pct'] as const;

/** Cambia los campos pedidos; cambiar el umbral o reactivarla la vuelve a armar. Null si no existe. */
export async function editarAlerta(id: string, cambios: EditarAlerta): Promise<Alerta | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const k of EDITABLES) {
    if (cambios[k] === undefined) continue;
    params.push(cambios[k]);
    sets.push(`${k} = $${params.length}`);
  }
  if (cambios.precio !== undefined || cambios.sentido !== undefined || cambios.moneda !== undefined || cambios.activa === true) sets.push('armada = TRUE');
  params.push(id);
  const { rows } = await db.query(`UPDATE alertas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return rows[0] ? fila(rows[0]) : null;
}

export async function borrarAlerta(id: string): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM alertas WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

/**
 * Registra un disparo: guarda el valor, la desarma y, si es de precio «una
 * vez», la desactiva. Solo si seguía activa (y armada, en las de precio).
 */
export async function registrarDisparo(id: string, valor: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE alertas SET ultimo_disparo_at = NOW(), ultimo_valor = $2, armada = FALSE,
       activa = CASE WHEN repeticion = 'una_vez' AND tipo = 'precio' THEN FALSE ELSE activa END
     WHERE id = $1 AND activa AND (armada OR tipo = 'cartera')`, [id, valor]);
  return (rowCount ?? 0) > 0;
}

export async function rearmar(id: string): Promise<void> {
  await db.query(`UPDATE alertas SET armada = TRUE WHERE id = $1 AND activa`, [id]);
}

/** Cantidades abiertas por activo (lotes FIFO sin cerrar), para la alerta de cartera. */
export async function cantidadesAbiertas(): Promise<Map<string, number>> {
  const { rows } = await db.query(`SELECT asset, SUM(quantity_remaining)::float AS q FROM fifo_lots WHERE NOT is_closed GROUP BY asset`);
  return new Map((rows as Array<{ asset: string; q: number }>).map(r => [r.asset, Number(r.q)]));
}
