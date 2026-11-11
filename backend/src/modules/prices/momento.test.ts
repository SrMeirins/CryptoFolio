import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vela } from './binance';

// Precio del momento de una operación (#599): Binance, la base y la detección
// de pares, simulados. Datos sintéticos.
const velas = new Map<string, Vela[]>();
const fetchVelas = vi.fn(async (pair: string, intervalo: string) => {
  const v = velas.get(`${pair}|${intervalo}`);
  if (v === undefined) throw new Error('fallo de red simulado');
  return v;
});
const getHistoricalPriceEur = vi.fn(async () => 7);
vi.mock('./binance', () => ({
  fetchVelas: (...a: [string, string]) => fetchVelas(...a),
  getHistoricalPriceEur: () => getHistoricalPriceEur(),
  isDefinitiveNoData: (e: unknown) => String((e as Error)?.message ?? e).startsWith('Sin datos'),
}));
vi.mock('./pairDetector', () => ({
  getOrDetectPairInfo: vi.fn(async (s: string) => ({
    symbol: s, binanceEurPair: null, binanceUsdtPair: s === 'USDT' ? null : `${s}USDT`, binanceBtcPair: null, binanceEthPair: null,
    priceSource: 'usdt_proxy', isStablecoin: false,
  })),
}));
const inserts: unknown[][] = [];
vi.mock('../../db/client', () => ({
  db: { query: vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.startsWith('INSERT')) inserts.push(params);
    return { rows: [] };
  }) },
}));

const { getPrecioMomentoEur, precioVela, velaMasCercana } = await import('./momento');

const T = Date.UTC(2024, 4, 10, 12, 30, 20); // 12:30:20 UTC
const MIN = 60_000;
const vela = (inicio: number, cierre: number, volumen: number, volumenCotizacion: number): Vela => ({ inicio, cierre, volumen, volumenCotizacion });

beforeEach(() => { velas.clear(); inserts.length = 0; fetchVelas.mockClear(); });

describe('precioVela y velaMasCercana', () => {
  it('precio medio negociado; sin volumen, el cierre', () => {
    expect(precioVela(vela(0, 10, 2, 21))).toBe(10.5);
    expect(precioVela(vela(0, 10, 0, 0))).toBe(10);
  });
  it('la vela que contiene el instante; si no tuvo volumen, la más cercana con volumen', () => {
    const minuto = Math.floor(T / MIN) * MIN;
    const lista = [vela(minuto - 5 * MIN, 1, 1, 1), vela(minuto, 2, 1, 2), vela(minuto + 2 * MIN, 3, 1, 3)];
    expect(velaMasCercana(lista, T, MIN)!.cierre).toBe(2);
    expect(velaMasCercana([lista[0], vela(minuto, 2, 0, 0), lista[2]], T, MIN)!.cierre).toBe(3);
    expect(velaMasCercana([], T, MIN)).toBeNull();
  });
});

describe('getPrecioMomentoEur', () => {
  const minuto = Math.floor(T / MIN) * MIN;

  it('vela de minuto del par en USDT, convertida con EURUSDT del mismo minuto', async () => {
    velas.set('ABCUSDT|1m', [vela(minuto, 2, 10, 21)]);     // 2,1 USDT
    velas.set('EURUSDT|1m', [vela(minuto, 1.05, 1, 1.05)]); // 1 EUR = 1,05 USDT
    const p = await getPrecioMomentoEur('ABC', new Date(T));
    expect(p.fuente).toBe('1m');
    expect(p.precio).toBeCloseTo(2.1 / 1.05, 12);
    expect(inserts.at(-1)).toEqual(['ABC', new Date(minuto), p.precio, '1m']);
  });

  it('sin velas de minuto: la vela horaria', async () => {
    velas.set('DEFUSDT|1m', []);
    velas.set('DEFUSDT|1h', [vela(Math.floor(T / 3_600_000) * 3_600_000, 4, 1, 4)]);
    velas.set('EURUSDT|1m', [vela(minuto, 1, 1, 1)]);
    expect(await getPrecioMomentoEur('DEF', new Date(T))).toEqual({ precio: 4, fuente: '1h' });
  });

  it('sin velas: el precio del día, marcado como «1d» y guardado', async () => {
    velas.set('GHIUSDT|1m', []);
    velas.set('GHIUSDT|1h', []);
    expect(await getPrecioMomentoEur('GHI', new Date(T))).toEqual({ precio: 7, fuente: '1d' });
    expect(inserts.at(-1)?.[3]).toBe('1d');
  });

  it('fallo de red: el precio del día sin guardarlo, para reintentarlo después', async () => {
    const antes = inserts.length;
    expect(await getPrecioMomentoEur('JKL', new Date(T))).toEqual({ precio: 7, fuente: '1d' });
    expect(inserts.length).toBe(antes);
  });

  it('EUR vale 1', async () => {
    expect(await getPrecioMomentoEur('EUR', new Date(T))).toEqual({ precio: 1, fuente: '1m' });
  });
});
