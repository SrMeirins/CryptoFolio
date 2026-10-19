import { db } from '../../db/client';
import { cargarAniosFiscales, baseAhorro, compensarPerdidas } from './carryforward';
import { calcularIrpfAhorro, parseTiposConfig } from './irpf';
import { madridYearMonth } from './madridTime';
import type { CifrasRenta, Presentacion721 } from './declaraciones';

// Acceso a los ejercicios declarados (#311) y cifras actuales de la Renta de
// un ejercicio, calculadas con las mismas consultas y reglas que Fiscal.

export type TipoDeclaracion = 'renta' | 'modelo721';

export interface Declaracion { ejercicio: number; tipo: TipoDeclaracion; declaradoEn: string; cifras: Record<string, number> }

const RENDIMIENTOS = `('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')`;

export async function cifrasRenta(year: number): Promise<CifrasRenta> {
  const gp = (await db.query(`
    SELECT COALESCE(SUM(CASE WHEN gain_loss_eur > 0 THEN gain_loss_eur ELSE 0 END), 0) AS ganancias,
           COALESCE(SUM(CASE WHEN gain_loss_eur < 0 THEN gain_loss_eur ELSE 0 END), 0) AS perdidas,
           COALESCE(SUM(gain_loss_eur), 0) AS neto, COUNT(*) AS operaciones
    FROM fifo_lot_consumptions
    WHERE EXTRACT(YEAR FROM consumed_at AT TIME ZONE 'Europe/Madrid') = $1 AND fiscal_event_type != 'NONE'`, [year])).rows[0];
  const rend = (await db.query(`
    SELECT COALESCE(SUM(amount_net * COALESCE(price_per_unit, 0)), 0) AS total, COUNT(*) AS n
    FROM transactions
    WHERE EXTRACT(YEAR FROM timestamp AT TIME ZONE 'Europe/Madrid') = $1 AND operation_type IN ${RENDIMIENTOS}`, [year])).rows[0];
  const tipos = parseTiposConfig((await db.query("SELECT value FROM app_config WHERE key = 'irpf_tramos_tipos'")).rows[0]?.value);
  const detalle = compensarPerdidas(await cargarAniosFiscales(madridYearMonth().year)).detalle.find(d => d.year === year);
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

export async function borrarDeclaracion(ejercicio: number, tipo: TipoDeclaracion): Promise<boolean> {
  return ((await db.query(`DELETE FROM fiscal_declaraciones WHERE ejercicio = $1 AND tipo = $2`, [ejercicio, tipo])).rowCount ?? 0) > 0;
}

/** Último Modelo 721 presentado antes de `ejercicio`; null si no hay. */
export async function ultimaPresentacion721(ejercicio: number): Promise<Presentacion721 | null> {
  const r = await db.query(
    `SELECT ejercicio, (cifras->>'valor')::float AS valor FROM fiscal_declaraciones
     WHERE tipo = 'modelo721' AND ejercicio < $1 ORDER BY ejercicio DESC LIMIT 1`, [ejercicio]);
  return r.rows[0] ? { ejercicio: r.rows[0].ejercicio, valor: r.rows[0].valor } : null;
}
