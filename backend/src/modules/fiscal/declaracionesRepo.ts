import { db } from '../../db/client';
import { cargarAniosFiscales, baseAhorro, compensarPerdidas } from './carryforward';
import { calcularIrpfAhorro } from './irpf';
import { escalaDe } from './escalasAhorro';
import { localYearMonth } from '../time/localTime';
import { getAppTimezone } from '../time/appTimezone';
import type { CifrasRenta, Presentacion721 } from './declaraciones';
import { OPS_RCM_AHORRO } from './clasificacionRentas';

// Acceso a los ejercicios declarados (#311) y cifras actuales de la Renta de
// un ejercicio, calculadas con las mismas consultas y reglas que Fiscal.

/** Renta y 721 presentados (#311) y ejercicio revisado (#542). */
export type TipoDeclaracion = 'renta' | 'modelo721' | 'revision';

export interface Declaracion { ejercicio: number; tipo: TipoDeclaracion; declaradoEn: string; cifras: Record<string, number> }

export async function cifrasRenta(year: number): Promise<CifrasRenta> {
  const tz = await getAppTimezone(db);
  const gp = (await db.query(`
    SELECT COALESCE(SUM(CASE WHEN gain_loss_eur > 0 THEN gain_loss_eur ELSE 0 END), 0) AS ganancias,
           COALESCE(SUM(CASE WHEN gain_loss_eur < 0 THEN gain_loss_eur ELSE 0 END), 0) AS perdidas,
           COALESCE(SUM(gain_loss_eur), 0) AS neto, COUNT(*) AS operaciones
    FROM fifo_lot_consumptions
    WHERE EXTRACT(YEAR FROM consumed_at AT TIME ZONE $2) = $1 AND fiscal_event_type != 'NONE'`, [year, tz])).rows[0];
  const rend = (await db.query(`
    SELECT COALESCE(SUM(amount_net * COALESCE(price_per_unit, 0)), 0) AS total, COUNT(*) AS n
    FROM transactions
    WHERE EXTRACT(YEAR FROM timestamp AT TIME ZONE $2) = $1 AND operation_type = ANY($3)`, [year, tz, OPS_RCM_AHORRO])).rows[0];
  // Escala del ejercicio declarado (#452).
  const tipos = await escalaDe(db, year);
  const detalle = compensarPerdidas(await cargarAniosFiscales(localYearMonth(tz).year)).detalle.find(d => d.year === year);
  const neto = parseFloat(gp.neto);
  const rendimientos = parseFloat(rend.total);
  const base = Math.max(0, detalle ? baseAhorro(detalle) : neto + rendimientos);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ganancias: r2(parseFloat(gp.ganancias)),
    perdidas: r2(parseFloat(gp.perdidas)),
    neto: r2(neto),
    rendimientos: r2(rendimientos),
    operaciones: parseInt(gp.operaciones, 10) + parseInt(rend.n, 10),
    base: r2(base),
    cuota: calcularIrpfAhorro(base, tipos),
  };
}

export async function listarDeclaraciones(): Promise<Declaracion[]> {
  const r = await db.query(`SELECT ejercicio, tipo, declarado_en, cifras FROM fiscal_declaraciones ORDER BY ejercicio DESC, tipo`);
  return r.rows.map((x: { ejercicio: number; tipo: TipoDeclaracion; declarado_en: string; cifras: Record<string, number> }) =>
    ({ ejercicio: x.ejercicio, tipo: x.tipo, declaradoEn: new Date(x.declarado_en).toISOString(), cifras: x.cifras }));
}

export async function guardarDeclaracion(ejercicio: number, tipo: TipoDeclaracion, cifras: object): Promise<Declaracion> {
  const r = await db.query(
    `INSERT INTO fiscal_declaraciones (ejercicio, tipo, cifras) VALUES ($1, $2, $3)
     ON CONFLICT (ejercicio, tipo) DO UPDATE SET cifras = EXCLUDED.cifras, declarado_en = now()
     RETURNING ejercicio, tipo, declarado_en, cifras`, [ejercicio, tipo, JSON.stringify(cifras)]);
  const x = r.rows[0];
  return { ejercicio: x.ejercicio, tipo: x.tipo, declaradoEn: new Date(x.declarado_en).toISOString(), cifras: x.cifras };
}

/** Quita la marca y devuelve lo que había (para Deshacer, #542); null si no estaba. */
export async function borrarDeclaracion(ejercicio: number, tipo: TipoDeclaracion): Promise<Declaracion | null> {
  const r = await db.query(
    `DELETE FROM fiscal_declaraciones WHERE ejercicio = $1 AND tipo = $2 RETURNING ejercicio, tipo, declarado_en, cifras`, [ejercicio, tipo]);
  const x = r.rows[0];
  return x ? { ejercicio: x.ejercicio, tipo: x.tipo, declaradoEn: new Date(x.declarado_en).toISOString(), cifras: x.cifras } : null;
}

/**
 * Deshacer (#542): vuelve a dejar una marca tal como estaba, con su fecha y
 * sus cifras originales, no las de ahora.
 */
export async function restaurarDeclaracion(d: Declaracion): Promise<Declaracion> {
  const r = await db.query(
    `INSERT INTO fiscal_declaraciones (ejercicio, tipo, declarado_en, cifras) VALUES ($1, $2, $3, $4)
     ON CONFLICT (ejercicio, tipo) DO UPDATE SET cifras = EXCLUDED.cifras, declarado_en = EXCLUDED.declarado_en
     RETURNING ejercicio, tipo, declarado_en, cifras`, [d.ejercicio, d.tipo, d.declaradoEn, JSON.stringify(d.cifras)]);
  const x = r.rows[0];
  return { ejercicio: x.ejercicio, tipo: x.tipo, declaradoEn: new Date(x.declarado_en).toISOString(), cifras: x.cifras };
}

/** Si la Renta o el 721 de un ejercicio ya están presentados (#542): lo usan el calendario y la campana. */
export async function presentadas(): Promise<(id: string, ejercicio: number) => boolean> {
  const r = await db.query(`SELECT ejercicio, tipo FROM fiscal_declaraciones WHERE tipo IN ('renta', 'modelo721')`);
  const set = new Set(r.rows.map((x: { ejercicio: number; tipo: string }) => `${x.tipo}:${x.ejercicio}`));
  return (id, ejercicio) => set.has(`${id}:${ejercicio}`);
}

/** Último Modelo 721 presentado antes de `ejercicio`; null si no hay. */
export async function ultimaPresentacion721(ejercicio: number): Promise<Presentacion721 | null> {
  const r = await db.query(
    `SELECT ejercicio, (cifras->>'valor')::float AS valor, cifras->'posiciones' AS posiciones FROM fiscal_declaraciones
     WHERE tipo = 'modelo721' AND ejercicio < $1 ORDER BY ejercicio DESC LIMIT 1`, [ejercicio]);
  const x = r.rows[0];
  return x ? { ejercicio: x.ejercicio, valor: x.valor, ...(Array.isArray(x.posiciones) ? { posiciones: x.posiciones } : {}) } : null;
}
