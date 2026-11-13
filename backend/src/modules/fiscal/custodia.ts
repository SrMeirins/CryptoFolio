import { db } from '../../db/client';
import { getAppTimezone } from '../time/appTimezone';
import { localDate } from '../time/localTime';
import { REGLAS_EXCHANGE, reglaDeWallet, type DatosEntidad, type ReglaExchange } from './custodiaAutomatica';

// Custodia de las wallets de exchange para el Modelo 721 (#545). En cada fecha
// manda, por orden: lo que indicó el usuario (su fila vigente), la regla
// automática de los exchanges que la app importa y, si no hay nada, «no se
// sabe», que computa por prudencia.

export type { DatosEntidad };

export interface FilaCustodia {
  id: string; walletId: string; desde: string | null; enEspana: boolean; entidad: DatosEntidad | null;
}

export type OrigenCustodia = 'usuario' | 'automatico' | 'desconocido';

export interface Custodia {
  /** null: no se sabe (computa por prudencia). */
  enEspana: boolean | null;
  entidad: DatosEntidad | null;
  origen: OrigenCustodia;
  /** Desde cuándo vale (null: desde siempre o sin dato). */
  desde: string | null;
  /** Fila del usuario que la fija, para poder quitarla. */
  filaId: string | null;
  /** Regla automática de su exchange, si es una wallet nativa. */
  regla: ReglaExchange['clave'] | null;
}

export interface WalletExchange { id: string; name: string; is_system: boolean }

export class CustodiaError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** El tramo con la fecha de inicio más reciente que no supera `dia` (el «desde siempre» vale si no hay otro). */
function vigente<T extends { desde: string | null }>(tramos: readonly T[], dia: string): T | null {
  let mejor: T | null = null;
  for (const t of tramos) {
    if (t.desde !== null && t.desde > dia) continue;
    if (!mejor || (t.desde ?? '') > (mejor.desde ?? '')) mejor = t;
  }
  return mejor;
}

/** Custodia de una wallet en un día (pura). */
export function custodiaEn(w: WalletExchange, filas: readonly FilaCustodia[], dia: string): Custodia {
  const regla = reglaDeWallet(w);
  const propia = vigente(filas.filter(f => f.walletId === w.id), dia);
  if (propia) {
    return { enEspana: propia.enEspana, entidad: propia.entidad, origen: 'usuario', desde: propia.desde, filaId: propia.id, regla: regla?.clave ?? null };
  }
  const auto = regla ? vigente(regla.tramos, dia) : null;
  if (auto && regla) return { enEspana: auto.enEspana, entidad: auto.entidad, origen: 'automatico', desde: auto.desde, filaId: null, regla: regla.clave };
  return { enEspana: null, entidad: null, origen: 'desconocido', desde: null, filaId: null, regla: regla?.clave ?? null };
}

const filaDe = (x: Record<string, unknown>): FilaCustodia => ({
  id: x.id as string, walletId: x.wallet_id as string, desde: (x.desde as string | null) ?? null, enEspana: x.en_espana as boolean,
  entidad: x.entidad_nombre ? {
    nombre: x.entidad_nombre as string, nif: (x.entidad_nif as string | null) ?? null,
    pais: (x.entidad_pais as string | null) ?? null, web: (x.entidad_web as string | null) ?? null,
  } : null,
});

async function leerFilas(): Promise<FilaCustodia[]> {
  const r = await db.query(
    `SELECT id, wallet_id, to_char(desde, 'YYYY-MM-DD') AS desde, en_espana, entidad_nombre, entidad_nif, entidad_pais, entidad_web
     FROM wallet_custodia ORDER BY wallet_id, desde NULLS FIRST`);
  return r.rows.map(filaDe);
}

async function walletsExchange(): Promise<WalletExchange[]> {
  const r = await db.query(`SELECT id, name, is_system FROM wallets WHERE type = 'exchange' ORDER BY name`);
  return r.rows;
}

/** Custodia de cada wallet de exchange en una fecha (día local de la app). */
export async function custodiaPorWallet(fecha: Date): Promise<Map<string, Custodia>> {
  const [dia, wallets, filas] = await Promise.all([
    getAppTimezone(db).then(tz => localDate(tz, fecha)), walletsExchange(), leerFilas(),
  ]);
  return new Map(wallets.map(w => [w.id, custodiaEn(w, filas, dia)]));
}

export interface CustodiaWallet {
  walletId: string;
  nombre: string;
  /** Exchange que la app importa, con su regla automática por fechas. */
  regla: ReglaExchange['clave'] | null;
  hoy: Custodia;
  /** Lo que indicó el usuario, por fecha. */
  filas: FilaCustodia[];
}

/** Custodia de todas las wallets de exchange: la de hoy y lo indicado por el usuario. */
export async function listarCustodia(): Promise<CustodiaWallet[]> {
  const [dia, wallets, filas] = await Promise.all([
    getAppTimezone(db).then(tz => localDate(tz, new Date())), walletsExchange(), leerFilas(),
  ]);
  return wallets.map(w => ({
    walletId: w.id, nombre: w.name, regla: reglaDeWallet(w)?.clave ?? null,
    hoy: custodiaEn(w, filas, dia), filas: filas.filter(f => f.walletId === w.id),
  }));
}

/** Reglas automáticas, para mostrarlas con sus fuentes (sin las expresiones de nombre). */
export function reglasPublicas() {
  return REGLAS_EXCHANGE.map(({ clave, exchange, tramos, fuentes, nota }) => ({ clave, exchange, tramos, fuentes, nota }));
}

export interface DatosCustodia { desde: string | null; enEspana: boolean; entidad: DatosEntidad | null }

/** Guarda lo que indica el usuario para una wallet desde una fecha; con la misma fecha, lo sustituye. */
export async function guardarCustodia(walletId: string, d: DatosCustodia): Promise<void> {
  const w = await db.query(`SELECT 1 FROM wallets WHERE id = $1 AND type = 'exchange'`, [walletId]);
  if (w.rows.length === 0) throw new CustodiaError('Wallet de exchange no encontrada', 404);
  const e = d.entidad;
  const valores = [walletId, d.desde, d.enEspana, e?.nombre ?? null, e?.nif ?? null, e?.pais ?? null, e?.web ?? null];
  const u = await db.query(
    `UPDATE wallet_custodia SET en_espana = $3, entidad_nombre = $4, entidad_nif = $5, entidad_pais = $6, entidad_web = $7
     WHERE wallet_id = $1 AND desde IS NOT DISTINCT FROM $2::date`, valores);
  if (u.rowCount === 0) {
    await db.query(
      `INSERT INTO wallet_custodia (wallet_id, desde, en_espana, entidad_nombre, entidad_nif, entidad_pais, entidad_web)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7)`, valores);
  }
}

/** Quita una fila del usuario: en sus fechas vuelve a valer la anterior, la regla automática o «no se sabe». */
export async function quitarFila(id: string): Promise<void> {
  const r = await db.query('DELETE FROM wallet_custodia WHERE id = $1', [id]);
  if (r.rowCount === 0) throw new CustodiaError('No encontrado', 404);
}

/** Vuelve a lo automático (o a «no se sabe»): quita todo lo indicado por el usuario para la wallet. */
export async function restablecerCustodia(walletId: string): Promise<number> {
  const r = await db.query('DELETE FROM wallet_custodia WHERE wallet_id = $1', [walletId]);
  return r.rowCount ?? 0;
}
