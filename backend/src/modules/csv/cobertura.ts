// Cobertura temporal por exchange (#328): qué periodos cubren las importaciones,
// los huecos entre ellas y lo pendiente hasta hoy. Módulo puro (sin BD).
// Las fechas son días UTC «YYYY-MM-DD»: un CSV solo dice su primera y su última
// transacción, así que un hueco puede ser inactividad real (por eso se puede revisar).

export type ExchangeCobertura = 'binance' | 'bitvavo';

/** Días sin ningún archivo a partir de los cuales hay hueco. */
export const UMBRAL_HUECO_DIAS = 7;
/** Una marca «no he operado desde entonces» deja de valer pasado este tiempo. */
export const CADUCIDAD_PENDIENTE_DIAS = 60;

export interface RangoImportacion {
  importId: string | null;
  archivo: string;
  desde: string;
  hasta: string;
  transacciones: number;
  /** Archivo del lote que se está revisando (aún no importado). */
  nuevo?: boolean;
}

export interface Revision { id: string; tipo: 'hueco' | 'pendiente'; desde: string; hasta: string; revisadoEn: string }

export interface Tramo {
  desde: string;
  hasta: string;
  transacciones: number;
  importaciones: { importId: string | null; archivo: string; nuevo: boolean; desde: string; hasta: string }[];
}

export interface Hueco { desde: string; hasta: string; dias: number; revisionId: string | null }

export interface CoberturaExchange {
  exchange: ExchangeCobertura;
  desde: string;
  hasta: string;
  tramos: Tramo[];
  huecos: Hueco[];
  pendiente: Hueco | null;
  meses: { mes: string; n: number }[];
}

const DIA = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const dia = (t: number) => new Date(t).toISOString().slice(0, 10);
const masDias = (d: string, n: number) => dia(ms(d) + n * DIA);
/** Días completos estrictamente entre dos fechas. */
const entre = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DIA) - 1;

export function calcularCobertura(
  exchange: ExchangeCobertura,
  rangos: readonly RangoImportacion[],
  revisiones: readonly Revision[],
  hoy: string,
  meses: { mes: string; n: number }[] = [],
): CoberturaExchange | null {
  if (rangos.length === 0) return null;
  const orden = [...rangos].sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta));

  // Une los tramos solapados o separados por menos del umbral: cobertura continua.
  const tramos: Tramo[] = [];
  for (const r of orden) {
    const ultimo = tramos.at(-1);
    const imp = { importId: r.importId, archivo: r.archivo, nuevo: !!r.nuevo, desde: r.desde, hasta: r.hasta };
    if (ultimo && entre(ultimo.hasta, r.desde) <= UMBRAL_HUECO_DIAS) {
      if (r.hasta > ultimo.hasta) ultimo.hasta = r.hasta;
      ultimo.transacciones += r.transacciones;
      ultimo.importaciones.push(imp);
    } else {
      tramos.push({ desde: r.desde, hasta: r.hasta, transacciones: r.transacciones, importaciones: [imp] });
    }
  }

  const huecos: Hueco[] = [];
  for (let i = 1; i < tramos.length; i++) {
    const desde = masDias(tramos[i - 1].hasta, 1);
    const hasta = masDias(tramos[i].desde, -1);
    const rev = revisiones.find(v => v.tipo === 'hueco' && v.desde <= desde && v.hasta >= hasta);
    huecos.push({ desde, hasta, dias: entre(tramos[i - 1].hasta, tramos[i].desde), revisionId: rev?.id ?? null });
  }

  const fin = tramos.at(-1)!.hasta;
  let pendiente: Hueco | null = null;
  if (entre(fin, hoy) + 1 > UMBRAL_HUECO_DIAS) {
    const desde = masDias(fin, 1);
    const rev = revisiones.find(v => v.tipo === 'pendiente' && v.desde <= desde
      && (ms(hoy) - Date.parse(v.revisadoEn)) / DIA <= CADUCIDAD_PENDIENTE_DIAS);
    pendiente = { desde, hasta: hoy, dias: entre(fin, hoy) + 1, revisionId: rev?.id ?? null };
  }

  return { exchange, desde: tramos[0].desde, hasta: fin, tramos, huecos, pendiente, meses };
}

export type TipoEncaje = 'primera' | 'rellena' | 'rellena_parte' | 'deja_hueco' | 'al_dia' | 'avanza';
export interface Encaje { tipo: TipoEncaje; exchange: ExchangeCobertura; desde: string; hasta: string; dias: number }

const dentro = (h: Hueco, en: Hueco) => h.desde >= en.desde && h.hasta <= en.hasta;

/** Qué cambia en la cobertura de un exchange al añadir los archivos del lote. */
export function compararCobertura(antes: CoberturaExchange | null, despues: CoberturaExchange): Encaje[] {
  const ex = despues.exchange;
  const out: Encaje[] = [];
  // Primera importación del exchange: qué periodo cubre y cuánto falta hasta hoy (en días).
  if (!antes) out.push({ tipo: 'primera', exchange: ex, desde: despues.desde, hasta: despues.hasta, dias: despues.pendiente?.dias ?? 0 });
  const huecosAntes = antes?.huecos ?? [];
  for (const a of huecosAntes) {
    const restos = despues.huecos.filter(d => dentro(d, a));
    if (restos.length === 0) out.push({ tipo: 'rellena', exchange: ex, desde: a.desde, hasta: a.hasta, dias: a.dias });
    else if (!(restos.length === 1 && restos[0].desde === a.desde && restos[0].hasta === a.hasta)) {
      out.push({ tipo: 'rellena_parte', exchange: ex, desde: a.desde, hasta: a.hasta, dias: a.dias });
    }
  }
  // Huecos nuevos: no estaban dentro de ninguno anterior (o no había cobertura previa).
  for (const d of despues.huecos) {
    if (!huecosAntes.some(a => dentro(d, a)) && !d.revisionId) {
      out.push({ tipo: 'deja_hueco', exchange: ex, desde: d.desde, hasta: d.hasta, dias: d.dias });
    }
  }
  if (antes?.pendiente && despues.hasta > antes.hasta) {
    out.push(despues.pendiente
      ? { tipo: 'avanza', exchange: ex, desde: despues.pendiente.desde, hasta: despues.pendiente.hasta, dias: despues.pendiente.dias }
      : { tipo: 'al_dia', exchange: ex, desde: antes.pendiente.desde, hasta: despues.hasta, dias: 0 });
  }
  return out;
}
