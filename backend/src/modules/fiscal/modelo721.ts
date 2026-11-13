import { db } from '../../db/client';
import { getUmbral721, valorizarLotesEnFecha, type LoteValorizado } from './lotesValoracion';
import { INCREMENTO_721 } from './declaraciones';
import { listarDeclaraciones, ultimaPresentacion721 } from './declaracionesRepo';
import { endOfLocalYear } from '../time/localTime';
import { custodiaPorWallet, type Custodia, type DatosEntidad } from './custodia';

// Modelo 721 por entidad custodia (#545). Se declara por la entidad que
// custodia las monedas (subcuentas del mismo exchange suman juntas) y solo
// computa la custodia de terceros fuera de España. La custodia de cada wallet
// sale de lo indicado por el usuario o de la regla automática de su exchange
// (custodia.ts); si no se sabe, computa (criterio prudente) y se avisa.
//
// Veredicto (AEAT, preguntas frecuentes del modelo 721):
// - Umbral: hay que presentarlo si el valor conjunto a 31 de diciembre supera
//   el umbral (50.000 €).
// - Incremento: si ya se presentó, solo vuelve a ser obligatorio si ese valor
//   sube más de 20.000 € respecto del que motivó la última presentación.
// - Extinción: en todo caso, si dejaste de tener una moneda que ya habías
//   declarado en una entidad.

/** Unidades por debajo de las cuales una posición se da por extinguida. */
const POLVO = 1e-9;


export interface PosicionDeclarada { clave: string; entidad: string; asset: string; unidades: number; valorEur: number }

export interface Grupo721 {
  /** entidad:<nombre> o wallet:<id> si la custodia no tiene entidad conocida. */
  clave: string;
  entidad: DatosEntidad | null;
  /** null: no se sabe (computa por prudencia). */
  enEspana: boolean | null;
  /** Cada wallet con cómo se sabe su custodia. */
  wallets: ({ id: string; nombre: string } & Pick<Custodia, 'origen' | 'desde' | 'filaId' | 'regla'>)[];
  /** Computa para el 721: custodia fuera de España o desconocida. */
  computa: boolean;
  activos: { asset: string; unidades: number; valorEur: number; sinPrecio: boolean }[];
  totalEur: number;
}

export type Motivo721 = 'umbral' | 'incremento' | 'extincion' | 'no_supera' | 'incremento_insuficiente';

export interface Veredicto721 {
  /** true: hay que presentarlo; false: no; null: no se puede saber (faltan precios). */
  obligado: boolean | null;
  motivo: Motivo721;
  valorEur: number;
  umbral: number;
  /** Valor a superar para volver a presentarlo (último presentado + 20.000 €), si ya se presentó. */
  objetivoIncremento: number | null;
  /** Monedas declaradas que ya no tienes en su entidad. */
  extinguidas: { entidad: string; asset: string }[];
}

/** Agrupa los lotes de exchange por entidad custodia (pura, con la custodia de cada wallet en la fecha). */
export function agruparPorEntidad(activos: readonly LoteValorizado[], custodias: ReadonlyMap<string, Custodia>): Grupo721[] {
  const grupos = new Map<string, Grupo721>();
  for (const a of activos) {
    if (a.wallet_kind !== 'exchange') continue;
    const c: Custodia = custodias.get(a.wallet_id)
      ?? { enEspana: null, entidad: null, origen: 'desconocido', desde: null, filaId: null, regla: null };
    const clave = c.entidad ? `entidad:${c.entidad.nombre}` : `wallet:${a.wallet_id}`;
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, entidad: c.entidad, enEspana: c.enEspana, wallets: [], computa: c.enEspana !== true, activos: [], totalEur: 0 };
      grupos.set(clave, g);
    }
    if (!g.wallets.some(w => w.id === a.wallet_id)) {
      g.wallets.push({ id: a.wallet_id, nombre: a.wallet_name, origen: c.origen, desde: c.desde, filaId: c.filaId, regla: c.regla });
    }
    const act = g.activos.find(x => x.asset === a.asset);
    if (act) { act.unidades += a.quantity; act.valorEur += a.valorEur; act.sinPrecio ||= a.sinPrecio }
    else g.activos.push({ asset: a.asset, unidades: a.quantity, valorEur: a.valorEur, sinPrecio: a.sinPrecio });
    g.totalEur += a.valorEur;
  }
  for (const g of grupos.values()) {
    g.activos = g.activos.filter(x => x.unidades > POLVO).sort((x, y) => y.valorEur - x.valorEur || x.asset.localeCompare(y.asset));
    g.wallets.sort((x, y) => x.nombre.localeCompare(y.nombre));
  }
  // Primero lo que computa y, dentro, de mayor a menor valor.
  return [...grupos.values()].filter(g => g.activos.length > 0)
    .sort((x, y) => Number(y.computa) - Number(x.computa) || y.totalEur - x.totalEur);
}

/** Nombre de un grupo, para las posiciones declaradas y los mensajes. */
export const nombreGrupo = (g: Grupo721): string => g.entidad?.nombre ?? g.wallets.map(w => w.nombre).join(', ');

/** Posiciones a guardar al marcar el 721 como presentado: las de los grupos que computan. */
export function posicionesDe(grupos: readonly Grupo721[]): PosicionDeclarada[] {
  return grupos.filter(g => g.computa).flatMap(g => g.activos.map(a => ({
    clave: g.clave, entidad: nombreGrupo(g), asset: a.asset, unidades: a.unidades, valorEur: Math.round(a.valorEur * 100) / 100,
  })));
}

/** Veredicto del 721 (pura). `pendientes`: hay activos sin precio, así que el valor es un mínimo. */
export function veredicto721(
  grupos: readonly Grupo721[], umbral: number,
  ultima: { valor: number; posiciones?: readonly PosicionDeclarada[] } | null, pendientes: boolean,
): Veredicto721 {
  const computan = grupos.filter(g => g.computa);
  const valorEur = computan.reduce((s, g) => s + g.totalEur, 0);
  const objetivoIncremento = ultima ? ultima.valor + INCREMENTO_721 : null;

  // Extinción: cada moneda declarada en una entidad que ya no está en ella.
  const vivas = new Set(computan.flatMap(g => g.activos.filter(a => a.unidades > POLVO).map(a => `${g.clave}|${a.asset}`)));
  const extinguidas = (ultima?.posiciones ?? [])
    .filter(p => !vivas.has(`${p.clave}|${p.asset}`))
    .map(p => ({ entidad: p.entidad, asset: p.asset }));

  const base = { valorEur, umbral, objetivoIncremento, extinguidas };
  if (extinguidas.length > 0) return { ...base, obligado: true, motivo: 'extincion' };
  if (valorEur > umbral && (!ultima || valorEur - ultima.valor > INCREMENTO_721)) {
    return { ...base, obligado: true, motivo: ultima ? 'incremento' : 'umbral' };
  }
  // Con precios pendientes el valor es un mínimo: lo que no supera aún podría superar.
  const motivo: Motivo721 = valorEur > umbral ? 'incremento_insuficiente' : 'no_supera';
  return { ...base, obligado: pendientes ? null : false, motivo };
}

/** Grupos del 721 a partir de una valoración, con las entidades vigentes en su fecha. */
export async function grupos721(activos: readonly LoteValorizado[], fecha: Date): Promise<Grupo721[]> {
  return agruparPorEntidad(activos, await custodiaPorWallet(fecha));
}

export interface Estado721 {
  grupos: Grupo721[];
  veredicto: Veredicto721;
  preciosPendientes: string[];
  ultimaPresentacion: { ejercicio: number; valor: number } | null;
  /** Valor de toda la cartera, autocustodia incluida (que no computa). */
  totalCartera: number;
}

/** Estado del 721 de un ejercicio con el valor a una fecha (31 de diciembre u hoy). */
export async function estado721(ejercicio: number, fecha: Date): Promise<Estado721> {
  const [{ activos, preciosPendientes }, umbral, ultima] = await Promise.all([
    valorizarLotesEnFecha(fecha), getUmbral721(), ultimaPresentacion721(ejercicio),
  ]);
  const grupos = await grupos721(activos, fecha);
  return {
    grupos,
    totalCartera: activos.reduce((s, a) => s + a.valorEur, 0),
    veredicto: veredicto721(grupos, umbral, ultima, preciosPendientes.length > 0),
    preciosPendientes,
    ultimaPresentacion: ultima ? { ejercicio: ultima.ejercicio, valor: ultima.valor } : null,
  };
}

export interface Historico721 {
  ejercicio: number;
  /** Lo que computa: custodia fuera de España o desconocida. */
  valorEur: number;
  /** Lo que hay en exchanges con custodia en España: no computa. */
  noComputaEur: number;
  /** Lo que está fuera de los exchanges (autocustodia): no computa. */
  autocustodiaEur: number;
  estimado: boolean; presentado: boolean; incompleto: boolean;
}

/**
 * Valor que computa para el 721 a 31 de diciembre de cada ejercicio, desde el
 * primero con operaciones hasta el actual (este, a hoy y estimado).
 */
export async function historico721(tz: string, anioActual: number, ahora: Date = new Date()): Promise<Historico721[]> {
  const r = await db.query(`SELECT MIN(EXTRACT(YEAR FROM timestamp AT TIME ZONE $1))::int AS desde FROM transactions`, [tz]);
  const desde = r.rows[0]?.desde as number | null;
  if (!desde) return [];
  const presentados = new Set((await listarDeclaraciones()).filter(d => d.tipo === 'modelo721').map(d => d.ejercicio));
  const out: Historico721[] = [];
  for (let y = desde; y <= anioActual; y++) {
    const estimado = y === anioActual;
    const fecha = estimado ? ahora : endOfLocalYear(tz, y);
    const { activos, preciosPendientes } = await valorizarLotesEnFecha(fecha);
    const grupos = await grupos721(activos, fecha);
    const suma = (computa: boolean) => grupos.filter(g => g.computa === computa).reduce((s, g) => s + g.totalEur, 0);
    const enExchanges = grupos.reduce((s, g) => s + g.totalEur, 0);
    const autocustodiaEur = Math.max(0, activos.reduce((s, a) => s + a.valorEur, 0) - enExchanges);
    out.push({ ejercicio: y, valorEur: suma(true), noComputaEur: suma(false), autocustodiaEur, estimado, presentado: presentados.has(y), incompleto: preciosPendientes.length > 0 });
  }
  return out;
}
