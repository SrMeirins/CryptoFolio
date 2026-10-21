import { db } from '../../db/client';
import { calcularCobertura, type CoberturaExchange, type ExchangeCobertura, type RangoImportacion, type Revision } from './cobertura';

// Carga de la cobertura temporal desde la BD (#328). Fechas como días UTC.
const EXCHANGES: ExchangeCobertura[] = ['binance', 'bitvavo'];

export const hoyUtc = (): string => new Date().toISOString().slice(0, 10);

async function cargar() {
  const [rangos, revisiones, meses] = await Promise.all([
    db.query(
      `SELECT ci.id, ci.filename, ci.exchange,
              to_char(MIN(t.timestamp) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS desde,
              to_char(MAX(t.timestamp) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS hasta,
              COUNT(t.id)::int AS n
       FROM csv_imports ci JOIN transactions t ON t.import_id = ci.id
       GROUP BY ci.id`,
    ),
    db.query(`SELECT id, exchange, tipo, to_char(desde, 'YYYY-MM-DD') AS desde, to_char(hasta, 'YYYY-MM-DD') AS hasta, revisado_en FROM cobertura_revisiones`),
    db.query(
      `SELECT ci.exchange, to_char(t.timestamp AT TIME ZONE 'UTC', 'YYYY-MM') AS mes, COUNT(*)::int AS n
       FROM transactions t JOIN csv_imports ci ON ci.id = t.import_id
       GROUP BY 1, 2 ORDER BY 2`,
    ),
  ]);
  return {
    rangos: rangos.rows.map((r: { id: string; filename: string; exchange: string; desde: string; hasta: string; n: number }) =>
      ({ exchange: r.exchange, rango: { importId: r.id, archivo: r.filename, desde: r.desde, hasta: r.hasta, transacciones: r.n } as RangoImportacion })),
    revisiones: revisiones.rows.map((r: { id: string; exchange: string; tipo: Revision['tipo']; desde: string; hasta: string; revisado_en: Date }) =>
      ({ exchange: r.exchange, revision: { id: r.id, tipo: r.tipo, desde: r.desde, hasta: r.hasta, revisadoEn: new Date(r.revisado_en).toISOString() } })),
    meses: meses.rows as { exchange: string; mes: string; n: number }[],
  };
}

/**
 * Cobertura de cada exchange con datos. `extra` añade rangos hipotéticos (los
 * archivos del lote en revisión) para calcular cómo encajan.
 */
export async function coberturaActual(
  extra: readonly { exchange: ExchangeCobertura; rango: RangoImportacion }[] = [],
  hoy: string = hoyUtc(),
  /** Actividad mensual de los archivos del lote, que aún no está en la BD. */
  extraMeses: readonly { exchange: ExchangeCobertura; mes: string; n: number }[] = [],
): Promise<{ antes: Map<ExchangeCobertura, CoberturaExchange | null>; despues: CoberturaExchange[] }> {
  const { rangos, revisiones, meses } = await cargar();
  const antes = new Map<ExchangeCobertura, CoberturaExchange | null>();
  const despues: CoberturaExchange[] = [];
  for (const ex of EXCHANGES) {
    const propios = rangos.filter(r => r.exchange === ex).map(r => r.rango);
    const revs = revisiones.filter(r => r.exchange === ex).map(r => r.revision);
    const m = meses.filter(x => x.exchange === ex).map(({ mes, n }) => ({ mes, n }));
    antes.set(ex, calcularCobertura(ex, propios, revs, hoy, m));
    const conLote = [...propios, ...extra.filter(e => e.exchange === ex).map(e => e.rango)];
    const mConLote = new Map(m.map(x => [x.mes, x.n]));
    for (const e of extraMeses.filter(x => x.exchange === ex)) mConLote.set(e.mes, (mConLote.get(e.mes) ?? 0) + e.n);
    const c = calcularCobertura(ex, conLote, revs, hoy, [...mConLote].sort().map(([mes, n]) => ({ mes, n })));
    if (c) despues.push(c);
  }
  return { antes, despues };
}
