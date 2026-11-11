import { db } from '../../db/client';
import { saveSnapshot } from '../backup/backupRestore';
import { getAppTimezone } from '../time/appTimezone';
import { DESFASE_MAX, DESFASE_MIN, detectarZonaHoraria, type DeteccionZona, type OrdenParaZona } from './zonaHoraria';

// Corregir la zona horaria de una importación ya hecha (#599). La hora
// guardada es la del CSV menos el desfase con el que se importó; con otro
// desfase, cada transacción se desplaza la diferencia. Una hora editada a mano
// (#378) se respeta, y la copia del original se desplaza igual para que la
// transacción siga marcada como editada o no, como estaba.

export class ZonaHorariaError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function desfaseValido(valor: unknown): valor is number {
  return Number.isInteger(valor) && (valor as number) >= DESFASE_MIN && (valor as number) <= DESFASE_MAX;
}

async function importacion(id: string): Promise<{ exchange: string; desfase: number }> {
  const r = await db.query('SELECT exchange, desfase_horas FROM csv_imports WHERE id = $1', [id]);
  if (r.rows.length === 0) throw new ZonaHorariaError('Importación no encontrada', 404);
  return { exchange: r.rows[0].exchange as string, desfase: Number(r.rows[0].desfase_horas) };
}

export interface ImpactoZona {
  /** Transacciones que se desplazan. */
  desplazadas: number;
  /** Con la hora editada a mano: no se tocan. */
  respetadas: number;
  /** Cambian de día o de año en la zona de la aplicación. */
  cambianDia: number;
  cambianAnio: number;
}

export interface EstadoZona {
  exchange: string;
  desfaseActual: number;
  deteccion: DeteccionZona;
}

/** Desfase actual y detección sobre las órdenes de la importación, tal como venían en el CSV. */
export async function estadoZonaHoraria(id: string): Promise<EstadoZona> {
  const imp = await importacion(id);
  if (imp.exchange !== 'binance') throw new ZonaHorariaError('Solo los CSV de Binance no indican su zona horaria', 400);
  const r = await db.query(
    `SELECT operation_type::text AS "operationType", asset, cost_asset AS "costAsset", amount, cost_amount AS "costAmount",
            timestamp + make_interval(hours => $2) AS timestamp, notes
     FROM transactions WHERE import_id = $1`, [id, imp.desfase]);
  const ordenes: OrdenParaZona[] = r.rows.map(o => ({ ...o, amount: Number(o.amount), costAmount: o.costAmount == null ? null : Number(o.costAmount) }) as OrdenParaZona);
  return { exchange: imp.exchange, desfaseActual: imp.desfase, deteccion: await detectarZonaHoraria(ordenes) };
}

const NO_EDITADA = `(original_import IS NULL OR (original_import->>'timestamp')::timestamptz = timestamp)`;

/** Qué cambiaría al pasar la importación a otro desfase. */
export async function impactoZonaHoraria(id: string, nuevo: number): Promise<ImpactoZona> {
  const imp = await importacion(id);
  const tz = await getAppTimezone(db);
  const delta = nuevo - imp.desfase;
  const r = await db.query(
    `SELECT count(*) FILTER (WHERE ${NO_EDITADA})::int AS desplazadas,
            count(*) FILTER (WHERE NOT ${NO_EDITADA})::int AS respetadas,
            count(*) FILTER (WHERE ${NO_EDITADA} AND (timestamp AT TIME ZONE $3)::date
                               <> ((timestamp - make_interval(hours => $2)) AT TIME ZONE $3)::date)::int AS "cambianDia",
            count(*) FILTER (WHERE ${NO_EDITADA} AND extract(year FROM timestamp AT TIME ZONE $3)
                               <> extract(year FROM (timestamp - make_interval(hours => $2)) AT TIME ZONE $3))::int AS "cambianAnio"
     FROM transactions WHERE import_id = $1`, [id, delta, tz]);
  return r.rows[0] as unknown as ImpactoZona;
}

/**
 * Pasa la importación a otro desfase: copia previa (#453), desplaza sus
 * transacciones y filas en bruto y guarda el desfase. Hay que recalcular el
 * FIFO después.
 */
export async function aplicarZonaHoraria(id: string, nuevo: number): Promise<ImpactoZona & { copiaPrevia: string }> {
  const imp = await importacion(id);
  if (imp.exchange !== 'binance') throw new ZonaHorariaError('Solo los CSV de Binance no indican su zona horaria', 400);
  const impacto = await impactoZonaHoraria(id, nuevo);
  const delta = nuevo - imp.desfase;
  return db.transaction(async client => {
    const copiaPrevia = await saveSnapshot(client);
    if (delta !== 0) {
      await client.query(
        `UPDATE transactions SET timestamp = timestamp - make_interval(hours => $2)
         WHERE import_id = $1 AND ${NO_EDITADA}`, [id, delta]);
      await client.query(
        `UPDATE transactions
         SET original_import = jsonb_set(original_import, '{timestamp}',
               to_jsonb((original_import->>'timestamp')::timestamptz - make_interval(hours => $2)))
         WHERE import_id = $1 AND original_import ? 'timestamp'`, [id, delta]);
      await client.query(
        `UPDATE raw_transactions SET time = time - make_interval(hours => $2) WHERE import_id = $1`, [id, delta]);
    }
    await client.query('UPDATE csv_imports SET desfase_horas = $2 WHERE id = $1', [id, nuevo]);
    return { ...impacto, copiaPrevia };
  });
}
